import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../state/store';
import { MAX_NAME_LENGTH, peekRoom } from '../../net/rooms';
import { ensureSignedIn } from '../../net/firebase';
import { BadgePicker } from '../components/BadgePicker';
import { JOIN_REASONS } from '../joinReasons';
import { readSavedBadge } from '../prefs';
import type { BadgeId } from '../../game/badges';

export function Join({ code }: { code: string }) {
  const enterRoom = useGameStore(s => s.enterRoom);
  const joinPhase = useGameStore(s => s.joinPhase);
  const joinError = useGameStore(s => s.joinError);
  const [name, setName] = useState((localStorage.getItem('bz.name') ?? '').slice(0, MAX_NAME_LENGTH));
  const [badge, setBadge] = useState<BadgeId | null>(readSavedBadge);
  const [taken, setTaken] = useState<BadgeId[]>([]);
  const [resuming, setResuming] = useState(false);
  const [resumeFailed, setResumeFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const online = useGameStore(s => s.online);
  const wasOffline = useRef(false);

  // Retry the resume by itself once the connection comes back, but only on an
  // offline -> online edge: retrying on every render would spin if the failure
  // is something a retry cannot fix.
  useEffect(() => {
    if (!online) { wasOffline.current = true; return; }
    if (wasOffline.current && resumeFailed) {
      wasOffline.current = false;
      setResumeFailed(false);
      setAttempt(a => a + 1);
    }
  }, [online, resumeFailed]);

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
        // A throw in here - most likely a dead socket after the phone slept - used
        // to be swallowed with `resuming` still true, leaving the screen stuck on
        // "Rejoining…" for good with no retry and no way out. Surface it instead.
        if (!cancelled) { setResuming(false); setResumeFailed(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [code, enterRoom, attempt]);

  const effBadge = badge && !taken.includes(badge) ? badge : null;
  const ready = name.trim().length > 0 && effBadge != null;

  async function join() {
    localStorage.setItem('bz.name', name.trim());
    localStorage.setItem('bz.badge', effBadge!);
    await enterRoom(code, name.trim(), effBadge!);
  }

  function retry() {
    setResumeFailed(false);
    setAttempt(a => a + 1);
  }

  if (resuming) {
    return (
      <div className="screen stack">
        <h1 className="title">Rejoining…</h1>
        <div className="code-pill">{code}</div>
        <p className="muted">Putting you back in the room.</p>
        <a className="muted keep-back" href="#/">Home</a>
      </div>
    );
  }

  if (resumeFailed) {
    return (
      <div className="screen stack">
        <h1 className="title">Reconnecting…</h1>
        <div className="code-pill">{code}</div>
        <p className="muted">
          {online
            ? 'Could not reach the game.'
            : 'Waiting for your connection to come back - this will retry by itself.'}
        </p>
        <button className="btn btn-primary" onClick={retry}>Try again</button>
        <a className="muted keep-back" href="#/">Home</a>
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
      {joinError && <p className="error">{JOIN_REASONS[joinError] ?? joinError}</p>}
      <button className="btn btn-primary" disabled={!ready || joinPhase === 'joining'} onClick={join}>
        {joinPhase === 'joining' ? 'Joining…' : 'Join game'}
      </button>
      {/* An invite link is often the only way into this app, and a stale one used
          to be a dead end: no room to join, and nothing on screen going anywhere. */}
      <a className="muted keep-back" href="#/">Home</a>
    </div>
  );
}
