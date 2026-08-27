import { useEffect, useState } from 'react';
import { BADGES, BADGE_IDS } from '../../game/badges';
import { ScoreList } from '../components/ScoreList';
import { Commentary } from '../components/Commentary';
import { commentary } from '../commentary';
import { signed } from '../scoreRanks';
import {
  blitzerOf, emptyGame, roundScore, statsOf, totals, winnerOf,
  MAX_BLITZ_LEFT, MAX_CENTER, MAX_KEEPER_PLAYERS, type KeeperGame,
} from '../../keeper/model';
import { loadGame, saveGame } from '../../keeper/storage';
import type { PlayerInfo, RoundScore } from '../../game/types';

/** What the entry form holds while it is being typed into. */
interface Entry { center: string; blitz: number }
const blankEntry = (): Entry => ({ center: '', blitz: MAX_BLITZ_LEFT });

/**
 * The scoreboard's components want a room's worth of players. A scorepad has
 * names, badges and totals, which is all any of them actually read.
 */
function asPlayers(game: KeeperGame, tot: Record<string, number>): Record<string, PlayerInfo> {
  return Object.fromEntries(game.players.map((p, i) => [p.id, {
    name: p.name.trim() || 'Player', badgeId: p.badgeId, joinedAt: i,
    connected: true, stuckAt: null, score: tot[p.id] ?? 0,
  }]));
}

export function Keeper() {
  const [game, setGame] = useState<KeeperGame>(() => loadGame() ?? emptyGame());
  // Pick a saved game back up where it was rather than making somebody set the
  // table again after a screen lock. A table that was set but never played lands
  // back on setup, not on a scoreboard of three zeroes.
  const [phase, setPhase] = useState<'setup' | 'entry' | 'sheet'>(
    () => (loadGame()?.rounds.length ? 'sheet' : 'setup'));
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  /** Set while correcting a round that was already saved. */
  const [fixing, setFixing] = useState(false);

  useEffect(() => { saveGame(game.players.length ? game : null); }, [game]);

  const tot = totals(game);
  const players = asPlayers(game, tot);
  const winner = winnerOf(game);
  const taken = game.players.map(p => p.badgeId);
  const free = BADGE_IDS.filter(b => !taken.includes(b));

  // --- setup ---------------------------------------------------------------
  function addPlayer() {
    const badgeId = free[0];
    if (!badgeId) return;
    setGame(g => ({ ...g, players: [...g.players, { id: badgeId, name: '', badgeId }] }));
  }
  function rename(id: string, name: string) {
    setGame(g => ({ ...g, players: g.players.map(p => (p.id === id ? { ...p, name } : p)) }));
  }
  function cycleBadge(id: string) {
    // The badge is the player's identity here, so this is only offered before any
    // round is entered - after that, changing it would orphan their scores.
    const next = free[0];
    if (!next) return;
    setGame(g => ({
      ...g,
      players: g.players.map(p => (p.id === id ? { id: next, name: p.name, badgeId: next } : p)),
    }));
  }
  const removePlayer = (id: string) =>
    setGame(g => ({ ...g, players: g.players.filter(p => p.id !== id) }));

  function startEntry(prefill?: Record<string, RoundScore>) {
    setEntries(Object.fromEntries(game.players.map(p => [p.id, prefill?.[p.id]
      ? { center: String(prefill[p.id].centerCount), blitz: prefill[p.id].blitzLeft }
      : blankEntry()])));
    setPhase('entry');
  }

  function saveRound() {
    const round: Record<string, RoundScore> = {};
    for (const p of game.players) {
      const e = entries[p.id] ?? blankEntry();
      round[p.id] = roundScore(clamp(e.center, MAX_CENTER), e.blitz);
    }
    setGame(g => ({
      ...g,
      rounds: fixing ? [...g.rounds.slice(0, -1), round] : [...g.rounds, round],
    }));
    setFixing(false);
    setPhase('sheet');
  }

  if (phase === 'setup') {
    const ready = game.players.length >= 2 && game.players.every(p => p.name.trim());
    return (
      <div className="screen stack">
        <h1 className="title">Score keeper</h1>
        <p className="muted">
          For a real deck on a real table. This phone keeps the score; nothing is
          shared and nothing needs a signal.
        </p>
        {game.players.map(p => (
          <div className="keep-setup-row" key={p.id}>
            <button className="chip" aria-label={`Change ${BADGES[p.badgeId].label}`}
              style={{ ['--badge' as string]: BADGES[p.badgeId].color }}
              disabled={!free.length} onClick={() => cycleBadge(p.id)}>
              {BADGES[p.badgeId].glyph}
            </button>
            <input className="field" placeholder="Name" maxLength={14} value={p.name}
              onChange={e => rename(p.id, e.target.value)} />
            <button className="btn btn-slim" aria-label={`Remove ${p.name || 'player'}`}
              onClick={() => removePlayer(p.id)}>×</button>
          </div>
        ))}
        <button className="btn" onClick={addPlayer}
          disabled={game.players.length >= MAX_KEEPER_PLAYERS}>
          {game.players.length >= MAX_KEEPER_PLAYERS ? 'Table full' : 'Add player'}
        </button>
        <div className="row">
          <label className="muted" htmlFor="keep-target">Play to</label>
          <select id="keep-target" className="field" value={game.targetScore}
            onChange={e => setGame(g => ({ ...g, targetScore: Number(e.target.value) }))}>
            {[25, 50, 75, 100].map(n => <option key={n} value={n}>{n} points</option>)}
          </select>
        </div>
        <label className="row keep-toggle">
          <input type="checkbox" checked={game.snark}
            onChange={e => setGame(g => ({ ...g, snark: e.target.checked }))} />
          <span>Commentary between rounds</span>
        </label>
        <button className="btn btn-primary" disabled={!ready} onClick={() => startEntry()}>
          {ready ? 'Start keeping score' : 'Add two named players'}
        </button>
        <a className="muted keep-back" href="#/">Back</a>
      </div>
    );
  }

  if (phase === 'entry') {
    const roundNumber = fixing ? game.rounds.length : game.rounds.length + 1;
    return (
      <div className="screen stack">
        <h1 className="title">Round {roundNumber}</h1>
        <p className="muted">
          Cards you got into the middle, and cards left in your Blitz pile.
        </p>
        {game.players.map(p => {
          const e = entries[p.id] ?? blankEntry();
          const delta = clamp(e.center, MAX_CENTER) - 2 * e.blitz;
          return (
            <div className="keep-card" key={p.id}>
              <div className="keep-card-head">
                <span className="chip" style={{ ['--badge' as string]: BADGES[p.badgeId].color }}>
                  {BADGES[p.badgeId].glyph}
                </span>
                <span className="keep-name">{p.name}</span>
                <span className={`keep-delta${delta < 0 ? ' score-neg' : ''}`}>{signed(delta)}</span>
              </div>
              <div className="keep-fields">
                <label className="keep-field">
                  <span className="muted">In the middle</span>
                  <input className="field" type="number" inputMode="numeric" min={0} max={MAX_CENTER}
                    value={e.center} placeholder="0"
                    onChange={ev => setEntries(s => ({ ...s, [p.id]: { ...e, center: ev.target.value } }))} />
                </label>
                <div className="keep-field">
                  <span className="muted">Left in Blitz</span>
                  <div className="keep-step">
                    <button className="btn btn-slim" aria-label={`One fewer left for ${p.name}`}
                      onClick={() => setEntries(s => ({ ...s, [p.id]: { ...e, blitz: Math.max(0, e.blitz - 1) } }))}>
                      −
                    </button>
                    <span className="keep-step-value">{e.blitz}</span>
                    <button className="btn btn-slim" aria-label={`One more left for ${p.name}`}
                      onClick={() => setEntries(s => ({ ...s, [p.id]: { ...e, blitz: Math.min(MAX_BLITZ_LEFT, e.blitz + 1) } }))}>
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <button className="btn btn-primary" onClick={saveRound}>
          {fixing ? 'Save correction' : 'Save round'}
        </button>
        {game.rounds.length > 0 && (
          <button className="btn" onClick={() => { setFixing(false); setPhase('sheet'); }}>Cancel</button>
        )}
      </div>
    );
  }

  // --- the sheet -----------------------------------------------------------
  const last = game.rounds[game.rounds.length - 1];
  const remarks = game.snark && last ? commentary({
    players, scores: last, spaces: [], duels: null,
    blitzedBy: blitzerOf(last), roundNumber: game.rounds.length,
    targetScore: game.targetScore, durationMs: null, stuckRounds: 0,
    stats: statsOf(game), final: winner != null,
  }) : [];

  return (
    <div className="screen stack">
      <h1 className="title">
        {winner ? `🏆 ${players[winner]?.name} wins!` : `After round ${game.rounds.length}`}
      </h1>
      <ScoreList players={players} scores={last ?? null} />
      {remarks.length > 0 && <Commentary remarks={remarks} />}
      {winner
        ? <button className="btn btn-primary" onClick={() => {
            setGame(g => ({ ...g, rounds: [] }));
            setPhase('setup');
          }}>New game</button>
        : <button className="btn btn-primary" onClick={() => startEntry()}>Next round</button>}
      {last && (
        <button className="btn" onClick={() => { setFixing(true); startEntry(last); }}>
          Fix round {game.rounds.length}
        </button>
      )}
      <a className="muted keep-back" href="#/" onClick={() => saveGame(game)}>Leave (score is saved)</a>
    </div>
  );
}

/** Empty means nothing entered yet, which is zero, not NaN. */
function clamp(value: string, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}
