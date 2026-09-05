import { useEffect, useState } from 'react';
import { useGameStore } from '../../state/store';
import { BadgePicker } from '../components/BadgePicker';
import { JOIN_REASONS } from '../joinReasons';
import { APP_VERSION } from '../../version';
import { readSavedBadge } from '../prefs';
import { MAX_NAME_LENGTH, sweepOwnRooms } from '../../net/rooms';
import type { BadgeId } from '../../game/badges';

export function Home() {
  // Clean up after this device on the way past: rooms this phone created that are
  // now past the day the rules let anyone delete them. Nothing else ever removes a
  // room, and until this existed every room ever created simply stayed. Fire and
  // forget - it is housekeeping, and nothing on this screen waits for it.
  useEffect(() => { void sweepOwnRooms(); }, []);

  const hostRoom = useGameStore(s => s.hostRoom);
  const enterRoom = useGameStore(s => s.enterRoom);
  const joinPhase = useGameStore(s => s.joinPhase);
  const joinError = useGameStore(s => s.joinError);
  const [name, setName] = useState((localStorage.getItem('bz.name') ?? '').slice(0, MAX_NAME_LENGTH));
  const [badge, setBadge] = useState<BadgeId | null>(readSavedBadge);
  const [code, setCode] = useState('');
  const ready = name.trim().length > 0 && badge != null;

  function remember() {
    localStorage.setItem('bz.name', name.trim());
    if (badge) localStorage.setItem('bz.badge', badge);
  }
  async function create() {
    remember();
    try {
      const c = await hostRoom(name.trim(), badge!);
      location.hash = `#/room/${c}`;
    } catch {
      // hostRoom already recorded the reason in joinError; stay here and show it
    }
  }
  // Name and badge are already filled in here, so join outright rather than
  // handing the Join screen a second, identical form to fill in. If the room
  // rejects us (badge taken in that room, room full, already started) the store
  // holds the reason and the Join screen renders it with the form as a fallback.
  async function goJoin() {
    remember();
    const c = code.trim().toUpperCase();
    await enterRoom(c, name.trim(), badge!);
    location.hash = `#/room/${c}`;
  }

  return (
    <div className="screen stack">
      <h1 className="title">Deutsch Dash</h1>
      <p className="muted">Fast-paced multiplayer card racing. Create a room, text the link, play.</p>
      <input className="field" placeholder="Your name" maxLength={14}
        value={name} onChange={e => setName(e.target.value)} />
      <BadgePicker value={badge} onChange={setBadge} taken={[]} />
      {joinError && <p className="error">{JOIN_REASONS[joinError] ?? joinError}</p>}
      <button className="btn btn-primary" disabled={!ready || joinPhase === 'joining'} onClick={create}>
        Create room
      </button>
      {/* Create and join are the two ways into a game and now sit together. The
          code field no longer takes the whole row to itself - see .join-row. */}
      <div className="row join-row">
        <input className="field" placeholder="Room code" maxLength={6}
          value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
        <button className="btn" disabled={!ready || code.trim().length !== 6 || joinPhase === 'joining'}
          onClick={goJoin}>
          {joinPhase === 'joining' ? 'Joining…' : 'Join'}
        </button>
      </div>
      {/* The scorepad is a different app for a different evening - a real deck on
          a real table - so it is set well below the two buttons that start an
          online game rather than sitting between them. */}
      <a className="btn keep-link keep-entry" href="#/keeper">Keep score for meat space</a>
      {/* Quiet, and last. It is here so a report from a table can be tied to a
          build - "it did X" is a different bug depending on what they were
          running - not because anybody needs to read it. */}
      <p className="version">{APP_VERSION}</p>
    </div>
  );
}
