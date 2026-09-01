import { useEffect, useState } from 'react';
import { BADGES, BADGE_IDS } from '../../game/badges';
import { ScoreList } from '../components/ScoreList';
import { Commentary } from '../components/Commentary';
import { commentary } from '../commentary';
import { signed } from '../scoreRanks';
import {
  believableMs, blitzerOf, emptyGame, roundScore, statsOf, totals, winnerOf,
  MAX_BLITZ_LEFT, MAX_CENTER, MAX_KEEPER_PLAYERS, TIMED_MIN_MS, type KeeperGame,
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
    connected: true, stuckAt: null, awayAt: null, score: tot[p.id] ?? 0,
  }]));
}

export function Keeper() {
  const [game, setGame] = useState<KeeperGame>(() => loadGame() ?? emptyGame());
  // Pick a saved game back up exactly where it was, including a clock left
  // running when the phone locked. A table that was set but never played lands
  // back on setup, not on a scoreboard of zeroes.
  const [phase, setPhase] = useState<'setup' | 'playing' | 'entry' | 'sheet'>(() => {
    const saved = loadGame();
    if (!saved) return 'setup';
    if (saved.runningSince) return 'playing';
    if (saved.pendingMs != null) return 'entry';
    return saved.rounds.length ? 'sheet' : 'setup';
  });
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  /** Set while correcting a round that was already saved. */
  const [fixing, setFixing] = useState(false);
  /** Ticks the clock. Zero until the first tick, so nothing reads the time during render. */
  const [now, setNow] = useState(0);

  useEffect(() => { saveGame(game.players.length ? game : null); }, [game]);
  useEffect(() => {
    if (!game.runningSince) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [game.runningSince]);

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

  /** Deal the cards, start the clock. */
  function startRound() {
    setGame(g => ({ ...g, runningSince: Date.now(), pendingMs: null }));
    setNow(0);
    setPhase('playing');
  }

  /** Somebody called Blitz: stop the clock and go and count. */
  function stopRound() {
    setGame(g => ({
      ...g,
      runningSince: null,
      pendingMs: g.runningSince ? believableMs(Date.now() - g.runningSince) : null,
    }));
    startEntry();
  }

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
      // A correction keeps the length the round was actually played in.
      rounds: fixing
        ? [...g.rounds.slice(0, -1), { scores: round, ms: g.rounds[g.rounds.length - 1]?.ms ?? null }]
        : [...g.rounds, { scores: round, ms: g.pendingMs }],
      pendingMs: null,
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
        <button className="btn btn-primary" disabled={!ready} onClick={startRound}>
          {ready ? 'Deal and start the clock' : 'Add two named players'}
        </button>
        <a className="muted keep-back" href="#/">Back</a>
      </div>
    );
  }

  if (phase === 'playing') {
    const elapsed = game.runningSince && now ? Math.max(0, now - game.runningSince) : 0;
    return (
      <div className="screen stack keep-playing">
        <h1 className="title">Round {game.rounds.length + 1}</h1>
        <p className="keep-clock">{mmss(elapsed)}</p>
        <p className="muted" style={{ textAlign: 'center' }}>
          {elapsed < TIMED_MIN_MS
            ? 'Playing. Stop the clock when somebody calls Dash.'
            : 'Playing…'}
        </p>
        <button className="btn btn-primary" onClick={stopRound}>Dash! Count the cards</button>
        <a className="muted keep-back" href="#/">Leave (score is saved)</a>
      </div>
    );
  }

  if (phase === 'entry') {
    const roundNumber = fixing ? game.rounds.length : game.rounds.length + 1;
    return (
      <div className="screen stack">
        <h1 className="title">Round {roundNumber}</h1>
        <p className="muted">
          Cards you got into the middle, and cards left in your Dash pile.
          {game.pendingMs != null && ` Round took ${mmss(game.pendingMs)}.`}
        </p>
        {game.players.map(p => {
          const e = entries[p.id] ?? blankEntry();
          const delta = clamp(e.center, MAX_CENTER) - 2 * e.blitz;
          const step = (by: number, label: string) => (
            <button className="btn btn-slim" aria-label={label} key={by}
              disabled={e.blitz === (by < 0 ? 0 : MAX_BLITZ_LEFT)}
              onClick={() => setEntries(s => ({
                ...s,
                [p.id]: { ...e, blitz: Math.min(MAX_BLITZ_LEFT, Math.max(0, e.blitz + by)) },
              }))}>
              {by > 0 ? `+${by === 1 ? '' : by}` : `−${by === -1 ? '' : -by}`}
            </button>
          );
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
                  {/* Their proper name. "In the middle" was a description of
                      where they are; at a table people say Dutch piles. */}
                  <span className="muted">Dutch piles count</span>
                  <input className="field" type="number" inputMode="numeric" min={0} max={MAX_CENTER}
                    value={e.center} placeholder="0"
                    onChange={ev => setEntries(s => ({ ...s, [p.id]: { ...e, center: ev.target.value } }))} />
                </label>
                <div className="keep-field">
                  <span className="muted">Left in Dash</span>
                  {/* Ten cards, so single steps are up to ten taps for one
                      player and the pile is usually counted in threes anyway.
                      The coarse pair sits OUTSIDE the fine one: the value stays
                      in the middle and the jump gets bigger the further your
                      thumb travels from it. Both clamp, so ±3 near an end lands
                      on the end rather than refusing to move. */}
                  <div className="keep-step">
                    {step(-3, `Three fewer left for ${p.name}`)}
                    {step(-1, `One fewer left for ${p.name}`)}
                    <span className="keep-step-value">{e.blitz}</span>
                    {step(1, `One more left for ${p.name}`)}
                    {step(3, `Three more left for ${p.name}`)}
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
    players, scores: last.scores, spaces: [], duels: null,
    blitzedBy: blitzerOf(last.scores), roundNumber: game.rounds.length,
    targetScore: game.targetScore, durationMs: last.ms, stuckRounds: 0,
    stats: statsOf(game), final: winner != null,
  }) : [];

  return (
    <div className="screen stack">
      <h1 className="title">
        {winner ? `🏆 ${players[winner]?.name} wins!` : `After round ${game.rounds.length}`}
      </h1>
      <ScoreList players={players} scores={last?.scores ?? null} />
      {remarks.length > 0 && <Commentary remarks={remarks} />}
      {winner
        ? <button className="btn btn-primary" onClick={() => {
            setGame(g => ({ ...g, rounds: [] }));
            setPhase('setup');
          }}>New game</button>
        : <button className="btn btn-primary" onClick={startRound}>Deal the next round</button>}
      {last && (
        <button className="btn" onClick={() => { setFixing(true); startEntry(last.scores); }}>
          Fix round {game.rounds.length}
        </button>
      )}
      <a className="muted keep-back" href="#/" onClick={() => saveGame(game)}>Leave (score is saved)</a>
    </div>
  );
}

/** A clock at a card table wants minutes and seconds and nothing else. */
function mmss(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Empty means nothing entered yet, which is zero, not NaN. */
function clamp(value: string, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}
