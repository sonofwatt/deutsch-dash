import { useGameStore, isHost } from '../../state/store';
import { BADGES } from '../../game/badges';
import { ShareInvite } from '../components/ShareInvite';

export function Lobby({ code }: { code: string }) {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const host = isHost({ uid, room });
  const setTarget = useGameStore(s => s.setTarget);
  const start = useGameStore(s => s.start);
  const players = Object.entries(room.players).sort(([, a], [, b]) => a.joinedAt - b.joinedAt);

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
          <span className="spacer" />
          <span className={`dot${p.connected ? '' : ' off'}`} />
        </div>
      ))}
      <div className="row">
        <label className="muted" htmlFor="target">Play to</label>
        <select id="target" className="field" disabled={!host} value={room.meta.targetScore}
          onChange={e => setTarget(Number(e.target.value))}>
          {[25, 50, 75, 100].map(n => <option key={n} value={n}>{n} points</option>)}
        </select>
      </div>
      {host
        ? <button className="btn btn-primary" disabled={players.length < 2} onClick={start}>
            {players.length < 2 ? 'Waiting for players…' : 'Start game'}
          </button>
        : <p className="muted">Waiting for the host to start…</p>}
    </div>
  );
}
