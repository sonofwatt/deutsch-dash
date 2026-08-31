/** Why a join was refused, in words. Shared by the home screen and the join form. */
export const JOIN_REASONS: Record<string, string> = {
  'not-found': 'No room with that code.',
  expired: 'This room has expired.',
  full: 'Room is full (8 players).',
  'badge-taken': 'That badge is taken - pick another.',
  // Kept for a room snapshot written by an older client; nothing produces it
  // now that a game in progress admits spectators.
  started: 'This game already started without you.',
  race: 'Someone just took that spot - try again.',
  offline: 'Could not reach the game. Check your connection and try again.',
};
