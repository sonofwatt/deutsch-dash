import { useState } from 'react';
import { useGameStore, isHost, tableReady } from '../../state/store';
import { BADGES, BADGE_IDS, type BadgeId } from '../../game/badges';
import { BOT_LABELS, BOT_LEVELS, type BotLevel } from '../../game/bot';
import { APP_VERSION } from '../../version';
import { MAX_PLAYERS } from '../../net/rooms';
import { ShareInvite } from '../components/ShareInvite';
import { BadgePicker } from '../components/BadgePicker';
import { useWoodSide } from '../prefs';
import type { PlayerInfo } from '../../game/types';

// Dutch/German-flavoured, to sit alongside the human names without pretending to be one.
const BOT_NAMES = ['Ada', 'Bram', 'Cleo', 'Dirk', 'Elke', 'Fritz', 'Greta', 'Hans'];

/**
 * Somebody else's state, in the same three colours as your own button, because
 * they are the same three states. Bots are simply never anything but ready.
 */
function ReadyTag({ p }: { p: PlayerInfo }) {
  if (p.isBot) return null;
  // Sitting out outranks the rest: it is a decision, where away is a symptom,
  // and the table is not waiting on them either way.
  if (p.sittingOut) return <span className="ready-tag out">Sitting out</span>;
  const away = p.awayAt != null || !p.connected;
  const cls = away ? 'away' : p.ready ? 'on' : '';
  return <span className={`ready-tag ${cls}`}>{away ? 'Away' : p.ready ? 'Ready' : 'Not ready'}</span>;
}

export function Lobby({ code }: { code: string }) {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const host = isHost({ uid, room });
  const setTarget = useGameStore(s => s.setTarget);
  const setHints = useGameStore(s => s.setHints);
  const setOrderly = useGameStore(s => s.setOrderly);
  const setReady = useGameStore(s => s.setReady);
  const setSittingOut = useGameStore(s => s.setSittingOut);
  const setPaleCards = useGameStore(s => s.setPaleCards);
  const setFling = useGameStore(s => s.setFling);
  const cancelCountdown = useGameStore(s => s.cancelCountdown);
  const startAnyway = useGameStore(s => s.startAnyway);
  const setIdentity = useGameStore(s => s.setIdentity);
  const addBot = useGameStore(s => s.addBot);
  const removeBot = useGameStore(s => s.removeBot);
  const actionError = useGameStore(s => s.actionError);
  const [level, setLevel] = useState<BotLevel>('medium');
  const [woodSide, swapSides] = useWoodSide();
  // Which of my own two fields is open. Both close the moment I ready up.
  const [picking, setPicking] = useState(false);
  const [draftName, setDraftName] = useState<string | null>(null);

  const players = Object.entries(room.players).sort(([, a], [, b]) => a.joinedAt - b.joinedAt);
  const hostConnected = room.players[room.meta.hostId]?.connected ?? true;
  const taken = new Set(players.map(([, p]) => p.badgeId));
  const freeBadge: BadgeId | undefined = BADGE_IDS.find(b => !taken.has(b));
  const usedNames = new Set(players.map(([, p]) => p.name));
  const full = players.length >= MAX_PLAYERS;

  const me = uid ? room.players[uid] : null;
  const iAmReady = me?.ready === true;
  const iAmOut = me?.sittingOut === true;
  const iAmAway = me != null && me.awayAt != null;
  // Everything about me is fixed once I say I am ready. Un-readying is the way
  // back, which is the whole reason the ready flag is a toggle and not a latch.
  const canEdit = me != null && !iAmReady;
  // Mine is excluded, so my own badge never greys itself out in my own picker.
  const takenByOthers = players.filter(([id]) => id !== uid).map(([, p]) => p.badgeId);
  const countdown = room.meta.countdown;
  const inPlay = players.filter(([, p]) => !p.sittingOut);
  // The override appears only for a host who has readied and is waiting on
  // somebody else, and it needs a table worth starting. Once everyone is ready
  // the countdown has it from there and this is gone.
  // ...and never offer a start that would deal to nobody but machines. The
  // countdown already refuses that (tableReady); the override must refuse it too,
  // or the way past a dead phone becomes a way to start a game with no people in
  // it.
  const humansInPlay = inPlay.some(([, p]) => !p.isBot);
  const showOverride = host && (iAmReady || iAmOut)
    && !tableReady(room) && inPlay.length >= 2 && humansInPlay;

  function add() {
    if (!freeBadge) return;
    const name = BOT_NAMES.find(n => !usedNames.has(n)) ?? `${BADGES[freeBadge].label} bot`;
    addBot(freeBadge, level, name);
  }

  function commitName() {
    if (draftName != null && me) setIdentity(draftName, me.badgeId);
    setDraftName(null);
  }

  function pickBadge(b: BadgeId) {
    if (me) setIdentity(me.name, b);
    setPicking(false);
  }

  const noteVisible = useGameStore(s => s.noteVisible);

  function toggleReady() {
    // Close both editors on the way in, so a half-typed name cannot sit behind a
    // Ready badge looking like it was saved.
    if (!iAmReady) { commitName(); setPicking(false); }
    // Tapping this is proof of presence, so it clears Away as well. Without it a
    // player whose flag survived a backgrounded tab could ready up and still
    // block the countdown, with nothing on the screen to tell them why - which is
    // exactly what happened to a host whose phone had been in their pocket.
    if (iAmAway) noteVisible(true);
    setReady(!iAmReady);
  }

  return (
    <div className="screen stack">
      <h1 className="title">Lobby</h1>
      <div className="row"><span className="code-pill">{code}</span><ShareInvite code={code} /></div>
      {players.map(([id, p]) => {
        const mine = id === uid;
        const editing = mine && canEdit;
        return (
          <div className="player-row" key={id}>
            {/* Tap the badge for the whole grid, with everybody else's greyed
                out. Only ever your own, and only before you are ready. */}
            {editing
              ? <button className="chip chip-btn" aria-label="Change your badge"
                  style={{ ['--badge' as string]: BADGES[p.badgeId].color }}
                  onClick={() => { commitName(); setPicking(v => !v); }}>
                  {BADGES[p.badgeId].glyph}
                </button>
              : <span className="chip" style={{ ['--badge' as string]: BADGES[p.badgeId].color }}>
                  {BADGES[p.badgeId].glyph}
                </span>}
            {editing && draftName != null
              ? <input className="field name-field" autoFocus maxLength={14} value={draftName}
                  aria-label="Your name"
                  onChange={e => setDraftName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
              : editing
                ? <button className="name-btn" onClick={() => { setPicking(false); setDraftName(p.name); }}>
                    {p.name}{id === room.meta.hostId ? ' (host)' : ''}
                  </button>
                : <span>{p.name}{id === room.meta.hostId ? ' (host)' : ''}</span>}
            {p.isBot && <span className="tag">AI · {BOT_LABELS[p.botLevel ?? 'medium']}</span>}
            <span className="spacer" />
            {/* My own state is the big button at the bottom, not a second copy
                up here - one player, one place to read it. */}
            {!mine && <ReadyTag p={p} />}
            {p.isBot && host && (
              <button className="btn btn-slim" onClick={() => removeBot(id, p.badgeId)}
                aria-label={`Remove ${p.name}`}>Remove</button>
            )}
          </div>
        );
      })}
      {picking && canEdit && (
        <BadgePicker value={me!.badgeId} onChange={pickBadge} taken={takenByOthers} />
      )}

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
            difficulty was tuned against a human without them. One switch covers
            both of them - the stalled-player hint and the just-opened glow. */}
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
      <div className="row">
        {/* Host-wide rather than per-device, unlike the theme toggle in the
            corner: it changes how the CARDS read, and two players describing the
            same board to each other should be looking at the same thing. Does
            nothing for a player already in a light theme.
            Defaults ON (normalizeRoom), which is why the fallback here is true. */}
        <label className="muted" htmlFor="pale">White cards in dark mode</label>
        <span className="spacer" />
        <input id="pale" type="checkbox" className="toggle" disabled={!host}
          checked={room.meta.paleCards ?? true} onChange={e => setPaleCards(e.target.checked)} />
      </div>
      <div className="row">
        {/* Also on by default: flinging is simply the faster way to play, and
            carrying a card into the drop area still works either way. Off is for
            a table that finds cards leaving their hand unbidden. */}
        <label className="muted" htmlFor="fling">Fling cards at the board</label>
        <span className="spacer" />
        <input id="fling" type="checkbox" className="toggle" disabled={!host}
          checked={room.meta.flingOn ?? true} onChange={e => setFling(e.target.checked)} />
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

      {/* Mine, and the only place my own state is shown. Three states, three
          fixed colours - white, green and yellow with black ink in both themes,
          which is why they are literals and not theme tokens. */}
      {/* The host's override shares the ready button's row rather than sitting under
          it as a second full-width slab, and it appears once the host has ANSWERED
          for themselves - ready, or sitting this one out. That is the whole point:
          the count it used to show could never be complete while the host was one
          of the players it was counting. A host who is sitting out is not in the
          count at all, and still needs the way past a dead phone. */}
      <div className={`ready-row${showOverride ? ' with-override' : ''}`}>
        {showOverride && (
          <button className="btn start-anyway" onClick={startAnyway}>Start anyway</button>
        )}
        {iAmOut
          ? <button className="btn ready-btn" onClick={() => setSittingOut(false)}>
              I'm back — deal me in
            </button>
          : <button className={`btn ready-btn${iAmAway ? ' away' : iAmReady ? ' on' : ''}`}
              onClick={toggleReady}>
              {/* A question when it is asking and a statement when it is answered.
                  "I'm Ready" then "Ready" read as the same word twice, and people
                  could not tell which state they were looking at - the colour was
                  carrying the whole message on its own. */}
              {iAmAway ? 'Away — tap when you are back' : iAmReady ? 'Ready!' : 'Ready?'}
            </button>}
      </div>
      {/* Quiet, and below the ready button: stepping away is the rarer thing to
          want, and it must not be the button a thumb finds by accident. */}
      {!iAmOut && (
        <button className="btn btn-slim sit-out" onClick={() => setSittingOut(true)}>
          Sit out the next rounds
        </button>
      )}

      {/* The host keeps a way past a phone that has died: the ready gate must not
          be able to strand a table. It is gone entirely once everyone is ready,
          because the countdown has it from there.

          Deliberately NOT btn-primary, whose --accent flips with the theme. This
          one is a fixed dark slab in both themes, like the ready button above it
          is a fixed white one: the two are read together, and they must not swap
          relative weight because one player's phone is in dark mode. */}
      {host && !tableReady(room) && inPlay.length < 2 && (
        <p className="muted">Waiting for players…</p>
      )}
      {/* A table of nothing but bots will never be ready however long it waits -
          they are ready by definition and there is nobody for them to play
          against - so say that rather than leaving it looking like a hang. */}
      {!tableReady(room) && inPlay.length >= 2 && !humansInPlay && (
        <p className="muted">Somebody has to play them. Deal yourself back in, or add a player.</p>
      )}
      {!host && !tableReady(room) && (
        <p className="muted">
          {hostConnected ? 'Waiting for everyone to be ready…' : 'Host is away — someone else can start shortly…'}
        </p>
      )}
      {/* A lobby nobody ever starts is a dead end too - most often a room whose
          host wandered off before pressing anything. */}
      <a className="muted keep-back" href="#/">Home</a>
      <p className="version">{APP_VERSION}</p>

      {countdown != null && (
        <div className="overlay countdown-overlay">
          <div className="countdown-num" key={countdown}>{countdown === 0 ? 'GO!' : countdown}</div>
          {/* Only the host, and not at GO: by then startRound is a few hundred
              milliseconds away and a tap would be racing the deal. Three seconds
              is long enough to notice somebody walk off with their phone, which
              is the whole reason this is here. */}
          {host && countdown > 0 && (
            <button className="btn countdown-cancel" onClick={cancelCountdown}>
              Cancel — back to lobby
            </button>
          )}
        </div>
      )}
    </div>
  );
}
