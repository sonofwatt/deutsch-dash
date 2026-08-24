import { useState } from 'react';
import { useGameStore } from '../../state/store';
import { BadgePicker } from '../components/BadgePicker';
import type { BadgeId } from '../../game/badges';

export function Home() {
  const hostRoom = useGameStore(s => s.hostRoom);
  const joinPhase = useGameStore(s => s.joinPhase);
  const [name, setName] = useState(localStorage.getItem('bz.name') ?? '');
  const [badge, setBadge] = useState<BadgeId | null>(localStorage.getItem('bz.badge') as BadgeId | null);
  const [code, setCode] = useState('');
  const ready = name.trim().length > 0 && badge != null;

  function remember() {
    localStorage.setItem('bz.name', name.trim());
    if (badge) localStorage.setItem('bz.badge', badge);
  }
  async function create() {
    remember();
    const c = await hostRoom(name.trim(), badge!);
    location.hash = `#/room/${c}`;
  }
  function goJoin() {
    remember();
    location.hash = `#/room/${code.trim().toUpperCase()}`;
  }

  return (
    <div className="screen stack">
      <h1 className="title">Holland Hustle</h1>
      <p className="muted">Fast-paced multiplayer card racing. Create a room, text the link, play.</p>
      <input className="field" placeholder="Your name" maxLength={14}
        value={name} onChange={e => setName(e.target.value)} />
      <BadgePicker value={badge} onChange={setBadge} taken={[]} />
      <button className="btn btn-primary" disabled={!ready || joinPhase === 'joining'} onClick={create}>
        Create room
      </button>
      <div className="row">
        <input className="field" placeholder="Room code" maxLength={6}
          value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
        <button className="btn" disabled={code.trim().length !== 6} onClick={goJoin}>Join</button>
      </div>
    </div>
  );
}
