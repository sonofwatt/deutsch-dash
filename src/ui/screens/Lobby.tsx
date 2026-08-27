import { useState } from 'react';
import { useGameStore, isHost } from '../../state/store';
import { BADGES, BADGE_IDS, type BadgeId } from '../../game/badges';
import { BOT_LABELS, BOT_LEVELS, type BotLevel } from '../../game/bot';
import { MAX_PLAYERS } from '../../net/rooms';
import { ShareInvite } from '../components/ShareInvite';
import { useWoodSide } from '../prefs';

// Dutch/German-flavoured, to sit alongside the human names without pretending to be one.
const BOT_NAMES = ['Ada', 'Bram', 'Cleo', 'Dirk', 'Elke', 'Fritz', 'Greta', 'Hans'];

export function Lobby({ code }: { code: string }) {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const host = isHost({ uid, room });
  const setTarget = useGameStore(s => s.setTarget);
  const setHints = useGameStore(s => s.setHints);
  const setOrderly = useGameStore(s => s.setOrderly);
  const start = useGameStore(s => s.start);
  const addBot = useGameStore(s => s.addBot);
  const removeBot = useGameStore(s => s.removeBot);
  const actionError = useGameStore(s => s.actionError);
  const [level, setLevel] = useState<BotLevel>('medium');
  const [woodSide, swapSides] = useWoodSide();

  const players = Object.entries(room.players).sort(([, a], [, b]) => a.joinedAt - b.joinedAt);
  const hostConnected = room.players[room.meta.hostId]?.connected ?? true;
  const taken = new Set(players.map(([, p]) => p.badgeId));
  const freeBadge: BadgeId | undefined = BADGE_IDS.find(b => !taken.has(b));
  const usedNames = new Set(players.map(([, p]) => p.name));
  const full = players.length >= MAX_PLAYERS;

  function add() {
    if (!freeBadge) return;
    const name = BOT_NAMES.find(n => !usedNames.has(n)) ?? `${BADGES[freeBadge].label} bot`;
    addBot(freeBadge, level, name);
  }

  return (
    <div className="screen stack">
      <h1 className="title">Lobby</h1>
      <div className="row"><span className="code-pill">{code}</span><ShareInvite code={code} /></div>
      {players.map(([id, p]) => (
        <div className="player-row" key={id}>
          <span className="chip" style={{ ['--badge' as string]: BADGES[p.badgeId].color }}>
            {BADGES[p.badgeId].glyph}
          </span>
          <span>{p.name}{id === room.meta.hostId ? ' (host)' : ''}</span>
          {p.isBot && <span className="tag">AI · {BOT_LABELS[p.botLevel ?? 'medium']}</span>}
          <span className="spacer" />
          {p.isBot
            ? host && <button className="btn btn-slim" onClick={() => removeBot(id, p.badgeId)}
                aria-label={`Remove ${p.name}`}>Remove</button>
            : <span className={`dot${p.connected ? '' : ' off'}`} />}
        </div>
      ))}

      {host && (
        <div className="row">
          <button className="btn" onClick={add} disabled={full || !freeBadge}>Add AI player</button>
          <select className="field" style={{ width: 'auto', flex: 1 }} value={level}
            aria-label="AI difficulty" onChange={e => setLevel(e.target.value as BotLevel)}>
            {BOT_LEVELS.map(l => <option key={l} value={l}>{BOT_LABELS[l]}</option>)}
          </select>
        </div>
      )}

      <div className="row">
        <label className="muted" htmlFor="target">Play to</label>
        <select id="target" className="field" disabled={!host} value={room.meta.targetScore}
          onChange={e => setTarget(Number(e.target.value))}>
          {[25, 50, 75, 100].map(n => <option key={n} value={n}>{n} points</option>)}
        </select>
      </div>
      <div className="row">
        {/* Room-wide, not a device preference: hints are an advantage, and bot
            difficulty was tuned against a human without them. */}
        <label className="muted" htmlFor="hints">Helper hints</label>
        <span className="spacer" />
        <input id="hints" type="checkbox" className="toggle" disabled={!host}
          checked={room.meta.hintsOn ?? false} onChange={e => setHints(e.target.checked)} />
      </div>
      <div className="row">
        {/* Read at startRound, so it settles for a whole round at a time and the
            board cannot change shape under a hand somebody is holding. */}
        <label className="muted" htmlFor="orderly">Orderly grid</label>
        <span className="spacer" />
        <input id="orderly" type="checkbox" className="toggle" disabled={!host}
          checked={room.meta.orderlyGrid ?? false} onChange={e => setOrderly(e.target.checked)} />
      </div>
      {/* Not a host option and not disabled for anybody: this one is about the
          phone in your hand, so every player sets their own (see prefs.ts). The
          same ⇄ is on the board mid-game; this is only the chance to get it
          right before the cards land. */}
      <div className="row">
        <label className="muted">Wood pile</label>
        <span className="spacer" />
        <button className="btn btn-slim" onClick={swapSides}
          aria-label={`Wood pile under the ${woodSide} thumb. Move it to the ${woodSide === 'right' ? 'left' : 'right'}.`}>
          {woodSide === 'right' ? 'Right thumb ⇄' : 'Left thumb ⇄'}
        </button>
      </div>
      {actionError && <p className="error">{actionError}</p>}
      {host
        ? <button className="btn btn-primary" disabled={players.length < 2} onClick={start}>
            {players.length < 2 ? 'Waiting for players…' : 'Start game'}
          </button>
        : <p className="muted">
            {hostConnected ? 'Waiting for the host to start…' : 'Host is away — someone else can start shortly…'}
          </p>}
      {/* A lobby nobody ever starts is a dead end too - most often a room whose
          host wandered off before pressing anything. */}
      <a className="muted keep-back" href="#/">Home</a>
    </div>
  );
}
