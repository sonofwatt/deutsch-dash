import { useCallback, useEffect, useState } from 'react';
import { isBadgeId, type BadgeId } from '../game/badges';
import { setSoundEnabled } from './sound/engine';

/**
 * The badge this phone used last time, if it is still one that exists. Whatever
 * is in localStorage was cast straight to a BadgeId before, and a retired or
 * hand-edited value went out with the join and came back to every client in the
 * room as a badge nobody could draw.
 */
export function readSavedBadge(): BadgeId | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem('bz.badge');
    return isBadgeId(v) ? v : null;
  } catch {
    return null;
  }
}

export type WoodSide = 'left' | 'right';
const KEY = 'bz.woodSide';

/**
 * Which thumb the wood pile sits under. Wood is the pile touched most - every
 * flip of three is another tap - so which hand it favours is the single biggest
 * comfort setting on the board, and it is not the same hand for everybody.
 *
 * Local to the device, not the room: it is about the phone you are holding, and
 * two players at the same table can want opposite answers.
 */
export function readWoodSide(): WoodSide {
  if (typeof localStorage === 'undefined') return 'right';
  try {
    return localStorage.getItem(KEY) === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}

export function useWoodSide(): [WoodSide, () => void] {
  const [side, setSide] = useState<WoodSide>(readWoodSide);
  const swap = useCallback(() => {
    setSide(prev => {
      const next: WoodSide = prev === 'right' ? 'left' : 'right';
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, next);
      } catch {
        // A private window will not remember it. It still works for this game.
      }
      return next;
    });
  }, []);
  return [side, swap];
}

const SOUND_KEY = 'bz.soundOn';

/**
 * Whether THIS phone joins in with the soundbites.
 *
 * **Default ON**, and remembered only once it has been turned OFF - the stored
 * value is read as "is it off", so a phone that has never been asked, and a
 * private window that cannot remember, both come up on. A player who switches it
 * off stays off in every future game until they switch it back.
 *
 * That default is only safe because the HOST holds the master switch and that one
 * defaults OFF (`meta.soundsOn`). Between them: one person decides the table
 * wants sound at all, and then everybody has it without hunting for a control,
 * which is the opposite way round from having every phone arrive loud. The
 * "four phones at one table a beat apart" problem is the host's switch to solve,
 * not this one.
 *
 * Local to the device for the same reason the wood side is: whether YOUR phone
 * makes noise is about your phone, and two players at one table want opposite
 * answers. Deliberately not borrowed from `prefers-reduced-motion`, which says
 * nothing about audio.
 */
export function readSoundOn(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * The player's switch, and the gate the engine actually runs on.
 *
 * `allowed` is whether the SCREEN permits sound at all: the lobby passes true
 * unconditionally, and the board passes the host's `meta.soundsOn`. The engine
 * gets the AND of the two, so a host who has switched sound off silences the
 * board without touching what the player has chosen for themselves - flip the
 * host option back on and every player's own preference is still whatever it
 * was. Keeping them separate here is what stops the board's master switch
 * quietly rewriting eight phones' settings.
 *
 * The returned flag is the PLAYER's, not the gate, because that is what the
 * switch in the lobby has to show.
 */
export function useSoundOn(allowed = true): [boolean, () => void] {
  const [on, setOn] = useState<boolean>(readSoundOn);
  // On mount as well as on change: a returning player's stored value is
  // otherwise a preference nothing ever acted on. Re-runs when `allowed` moves,
  // which is how the host's switch reaches a board already on screen.
  useEffect(() => { setSoundEnabled(on && allowed); }, [on, allowed]);
  const toggle = useCallback(() => {
    setOn(prev => {
      const next = !prev;
      // Inside the tap, and that is load-bearing on iOS: Safari only resumes a
      // suspended AudioContext from a real gesture, and turning sound ON is the
      // gesture. Doing it in the effect above would be one tick too late.
      setSoundEnabled(next && allowed);
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
      } catch {
        // A private window will not remember it. It still works for this game.
      }
      return next;
    });
  }, [allowed]);
  return [on, toggle];
}

const OPTIONS_KEY = 'bz.lobbyOptions';

/**
 * Whether the lobby's host-option list starts open.
 *
 * **The host gets it open and everybody else gets it shut**, which is the whole
 * point of the collapse: the host is the only person who can change any of them,
 * and for everyone else they are five rows of furniture describing a match they
 * are about to play anyway. Either way it is one tap, and the choice is
 * remembered per device.
 *
 * The stored value wins over the host default once it exists, so a host who
 * prefers the list shut keeps it shut.
 */
export function useOptionsOpen(host: boolean): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return host;
    try {
      const v = localStorage.getItem(OPTIONS_KEY);
      return v === null ? host : v === 'open';
    } catch {
      return host;
    }
  });
  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(OPTIONS_KEY, next ? 'open' : 'shut');
      } catch {
        // A private window will not remember it. It still works for this game.
      }
      return next;
    });
  }, []);
  return [open, toggle];
}
