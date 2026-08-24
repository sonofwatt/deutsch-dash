import { useEffect, useState } from 'react';
import { useGameStore } from '../../state/store';
import { peekRoom } from '../../net/rooms';
import { ensureSignedIn } from '../../net/firebase';
import { BadgePicker } from '../components/BadgePicker';
import type { BadgeId } from '../../game/badges';

const REASONS: Record<string, string> = {
  'not-found': 'No room with that code.', expired: 'This room has expired.',
  full: 'Room is full (8 players).', 'badge-taken': 'That badge is taken - pick another.',
  started: 'This game already started without you.',
};

export function Join({ code }: { code: string }) {
  const enterRoom = useGameStore(s => s.enterRoom);
  const joinPhase = useGameStore(s => s.joinPhase);
  const joinError = useGameStore(s => s.joinError);
  const [name, setName] = useState(localStorage.getItem('bz.name') ?? '');
  const [badge, setBadge] = useState<BadgeId | null>(localStorage.getItem('bz.badge') as BadgeId | null);
  const [taken, setTaken] = useState<BadgeId[]>([]);

  useEffect(() => {
    // exclude my own badge so a reload mid-game can rejoin (rejoin ignores name/badge anyway)
    void Promise.all([peekRoom(code), ensureSignedIn()]).then(([room, uid]) => {
      if (room) {
        setTaken(Object.entries(room.players).filter(([id]) => id !== uid).map(([, p]) => p.badgeId));
      }
    });
  }, [code]);

  const effBadge = badge && !taken.includes(badge) ? badge : null;
  const ready = name.trim().length > 0 && effBadge != null;

  async function join() {
    localStorage.setItem('bz.name', name.trim());
    localStorage.setItem('bz.badge', effBadge!);
    await enterRoom(code, name.trim(), effBadge!);
  }

  return (
    <div className="screen stack">
      <h1 className="title">Join room</h1>
      <div className="code-pill">{code}</div>
      <input className="field" placeholder="Your name" maxLength={14}
        value={name} onChange={e => setName(e.target.value)} />
      <BadgePicker value={effBadge} onChange={setBadge} taken={taken} />
      {joinError && <p className="error">{REASONS[joinError] ?? joinError}</p>}
      <button className="btn btn-primary" disabled={!ready || joinPhase === 'joining'} onClick={join}>
        {joinPhase === 'joining' ? 'Joining…' : 'Join game'}
      </button>
    </div>
  );
}
