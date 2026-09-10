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
 * Whether this phone plays soundbites.
 *
 * **Default OFF**, which is the opposite of the other two device preferences and
 * is the decision `handoff.md` had parked under "Worth a decision". This is a
 * game people play sitting together, and four phones at one table playing the
 * same noise a beat apart is worse than silence - so nothing makes a sound until
 * somebody asks it to, and the player who is NOT in the room is the one who turns
 * it on. Settled here for voice too, whenever that arrives: same switch, same
 * default, same reasoning.
 *
 * Local to the device for the same reason the wood side is: whether YOUR phone
 * makes noise is about your phone, and two players at one table want opposite
 * answers. It is deliberately not a host option and deliberately not borrowed
 * from `prefers-reduced-motion`, which says nothing about audio.
 */
export function readSoundOn(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

export function useSoundOn(): [boolean, () => void] {
  const [on, setOn] = useState<boolean>(readSoundOn);
  // The engine is the single gate on playback and does not read localStorage
  // itself, so it has to be told - on mount as well as on change, because a
  // returning player's stored `on` is otherwise a preference nothing acted on.
  useEffect(() => { setSoundEnabled(on); }, [on]);
  const toggle = useCallback(() => {
    setOn(prev => {
      const next = !prev;
      // Inside the tap, and that is load-bearing on iOS: Safari only resumes a
      // suspended AudioContext from a real gesture, and turning sound ON is the
      // gesture. Doing it in the effect above would be one tick too late.
      setSoundEnabled(next);
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
      } catch {
        // A private window will not remember it. It still works for this game.
      }
      return next;
    });
  }, []);
  return [on, toggle];
}
