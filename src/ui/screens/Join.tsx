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
  race: 'Someone just took that spot — try again.',
};

export function Join({ code }: { code: string }) {
  const enterRoom = useGameStore(s => s.enterRoom);
  const joinPhase = useGameStore(s => s.joinPhase);
  const joinError = useGameStore(s => s.joinError);
  const [name, setName] = useState(localStorage.getItem('bz.name') ?? '');
  const [badge, setBadge] = useState<BadgeId | null>(localStorage.getItem('bz.badge') as BadgeId | null);
  const [taken, setTaken] = useState<BadgeId[]>([]);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    // sign in FIRST so peekRoom reuses the same uid (concurrent sign-ins can diverge),
    // then exclude my own badge so a reload mid-game can rejoin
    let cancelled = false;
    (async () => {
      try {
        const uid = await ensureSignedIn();
        const room = await peekRoom(code);
        if (cancelled || !room) return;
        // Already a member (reload, tab closed to text the invite, phone locked):
        // resume straight in rather than making them re-pick a name and badge they
        // already own. joinRoom's rejoin path ignores these values anyway, but pass
        // the stored ones so nothing is misrepresented if that ever changes.
        const mine = room.players[uid];
        if (mine) {
          setResuming(true);
          const res = await enterRoom(code, mine.name, mine.badgeId);
          if (!cancelled && !res.ok) setResuming(false); // fall back to the form so the error shows
          return;
        }
        // keep excluding my own badge: if the resume above fails we fall back to
        // this form while still being a member, and must not grey out my own badge
        setTaken(Object.entries(room.players).filter(([id]) => id !== uid).map(([, p]) => p.badgeId));
      } catch {
        // peek is best-effort; join itself will surface real errors
      }
    })();
    return () => { cancelled = true; };
  }, [code, enterRoom]);

  const effBadge = badge && !taken.includes(badge) ? badge : null;
  const ready = name.trim().length > 0 && effBadge != null;

  async function join() {
    localStorage.setItem('bz.name', name.trim());
    localStorage.setItem('bz.badge', effBadge!);
    await enterRoom(code, name.trim(), effBadge!);
  }

  if (resuming) {
    return (
      <div className="screen stack">
        <h1 className="title">Rejoining…</h1>
        <div className="code-pill">{code}</div>
        <p className="muted">Putting you back in the room.</p>
      </div>
    );
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
