import { useCallback, useState } from 'react';

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
