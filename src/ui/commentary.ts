import { rankRows } from './scoreRanks';
import type { CenterSpace, PlayerInfo, Room, RoundScore } from '../game/types';

export interface Remark {
  id: string; text: string; priority: number;
  /** Who it is about, which is how the thinning pass keeps one player from hogging it. */
  about: string[];
}

export interface CommentaryInput {
  players: Record<string, PlayerInfo>;
  scores: Record<string, RoundScore> | null;
  spaces: CenterSpace[];
  duels: Record<string, Record<string, number>> | null;
  blitzedBy: string | null;
  roundNumber: number;
  targetScore: number;
  /** endedAt - startedAt, when both are known. */
  durationMs: number | null;
  stuckRounds: number;
  /** The game-over sheet, which gets to be ruder. */
  final?: boolean;
}

/**
 * Deterministic variant picker. Math.random would give a different line on every
 * render - the carousel re-renders on a timer - and oxlint's react(purity) rule
 * rightly objects to it during render anyway. Seeding on the round number means
 * the same situation reads differently next round without ever flickering.
 */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const pick = (variants: string[], seed: string) => variants[hash(seed) % variants.length];

const MAX_REMARKS = 6;
/** Nobody wants five jokes about the same person. */
const MAX_PER_PLAYER = 2;

export function commentary(input: CommentaryInput): Remark[] {
  const { players, scores, spaces, duels, blitzedBy, roundNumber, targetScore } = input;
  const ids = Object.keys(players);
  if (ids.length === 0) return [];

  const nameOf = (id: string) => players[id]?.name ?? 'Somebody';
  const out: Remark[] = [];
  const add = (id: string, priority: number, variants: string[], about: string[] = []) =>
    out.push({ id, priority, about, text: pick(variants, `${id}:${roundNumber}:${about.join()}`) });

  // --- what happened in the middle ----------------------------------------
  const played: Record<string, number> = {};
  const finished: Record<string, number> = {};  // laid the 10 that closed a pile
  const opened: Record<string, number> = {};    // laid the Ace that started one
  let completed = 0;
  for (const space of spaces) {
    for (const run of [...space.history, space.stack]) {
      if (!run.length) continue;
      opened[run[0].owner] = (opened[run[0].owner] ?? 0) + 1;
      if (run.length === 10) {
        completed++;
        finished[run[9].owner] = (finished[run[9].owner] ?? 0) + 1;
      }
      for (const card of run) played[card.owner] = (played[card.owner] ?? 0) + 1;
    }
  }

  // --- who kept beating whom to the same space -----------------------------
  const pair: Record<string, number> = {};
  const lost: Record<string, number> = {};
  const won: Record<string, number> = {};
  for (const [loser, against] of Object.entries(duels ?? {})) {
    for (const [winner, n] of Object.entries(against ?? {})) {
      if (!players[loser] || !players[winner] || typeof n !== 'number') continue;
      lost[loser] = (lost[loser] ?? 0) + n;
      won[winner] = (won[winner] ?? 0) + n;
      pair[[loser, winner].sort().join('|')] = (pair[[loser, winner].sort().join('|')] ?? 0) + n;
    }
  }

  // --- standings -----------------------------------------------------------
  const { previous, current, move } = rankRows(players, scores);
  const total = (id: string) => players[id].score;
  const leader = current[0];
  const last = current[current.length - 1];
  const lead = current.length > 1 ? total(leader) - total(current[1]) : 0;
  const delta = (id: string) => scores?.[id]?.delta ?? 0;
  const deltas = ids.map(delta).sort((a, b) => b - a);
  const seconds = Math.round((input.durationMs ?? 0) / 1000);

  // === the round itself ====================================================
  if (!blitzedBy) {
    add('stalled', 90, [
      'Nobody could move. That was less a round than a standoff.',
      'Round over by mutual exhaustion. No winner, only survivors.',
    ]);
  }
  if (blitzedBy && input.durationMs != null && seconds > 0 && seconds <= 60) {
    add('speed-blitz', 95, [
      `${nameOf(blitzedBy)} blitzed in ${seconds} seconds. Everyone else was still reading their cards.`,
      `${seconds} seconds. ${nameOf(blitzedBy)} came to play; the rest came to watch.`,
    ], [blitzedBy]);
  }
  if (input.durationMs != null && input.durationMs >= 240_000) {
    add('slog', 40, [
      `${Math.round(input.durationMs / 60_000)} minutes for one round. Somebody put the kettle on.`,
      'That round could have been an email.',
    ]);
  }
  if (input.stuckRounds >= 2) {
    add('rotations', 55, [
      'Two full wood rotations before anything happened. Vintage stuff.',
      'The table stalled so often the piles started to gather dust.',
    ]);
  }
  if (completed === 0 && spaces.length > 0) {
    add('no-piles', 38, [
      'Not one pile made it to ten. Ambitious openings, no follow-through.',
      'Eight piles started, none finished. Very on-brand.',
    ]);
  }

  // === how it was scored ===================================================
  if (scores && ids.every(id => delta(id) < 0)) {
    add('wipeout', 70, [
      'Everybody lost points. Congratulations to nobody.',
      'A round so bad the scoreboard went backwards for all of you.',
    ]);
  }
  if (blitzedBy && (scores?.[blitzedBy]?.centerCount ?? 0) >= 8) {
    add('perfect', 84, [
      `${nameOf(blitzedBy)} emptied the Blitz pile AND left ${scores![blitzedBy].centerCount} cards in the middle. Show-off.`,
      `${nameOf(blitzedBy)} did both jobs at once. Insufferable.`,
    ], [blitzedBy]);
  }
  if (deltas.length > 1 && deltas[0] > 0 && deltas[0] >= 2 * Math.max(deltas[1], 1)) {
    const best = ids.find(id => delta(id) === deltas[0])!;
    add('landslide', 66, [
      `${nameOf(best)} scored ${deltas[0]} — more than double anyone else. Unsporting.`,
      `${nameOf(best)} took ${deltas[0]} points off that round. The rest of you shared the scraps.`,
    ], [best]);
  }
  const passenger = ids.find(id => scores && (scores[id]?.centerCount ?? 0) === 0);
  if (passenger && ids.length > 1) {
    add('passenger', 50, [
      `${nameOf(passenger)} played exactly zero cards to the middle. Present in body.`,
      `Not a single card from ${nameOf(passenger)}. Lovely to have you along.`,
    ], [passenger]);
  }
  const hoarder = ids.find(id => id !== blitzedBy && (scores?.[id]?.blitzLeft ?? 0) >= 8);
  if (hoarder) {
    add('barely-started', 46, [
      `${nameOf(hoarder)} finished with ${scores![hoarder].blitzLeft} cards still in the Blitz pile. Was it a nice nap?`,
      `${nameOf(hoarder)}'s Blitz pile is basically untouched. Bold strategy.`,
    ], [hoarder]);
  }

  // === the table ===========================================================
  if (current.length > 1 && Math.abs(total(leader) - total(current[1])) <= 2) {
    add('photo-finish', 76, [
      `${nameOf(leader)} and ${nameOf(current[1])} are ${Math.abs(total(leader) - total(current[1]))} apart. Somebody blink.`,
      `Nothing between ${nameOf(leader)} and ${nameOf(current[1])}. This is going to get personal.`,
    ], [leader, current[1]]);
  } else if (lead >= Math.max(15, targetScore / 4)) {
    add('runaway', 72, [
      `${nameOf(leader)} is ${lead} clear. Everyone else is playing for second.`,
      `${lead} points ahead. ${nameOf(leader)} has stopped being a player and become the weather.`,
    ], [leader]);
  }
  if (!input.final && total(leader) >= targetScore - 6 && total(leader) < targetScore) {
    add('match-point', 88, [
      `${nameOf(leader)} needs ${targetScore - total(leader)} more. Feel free to panic.`,
      `One decent round and ${nameOf(leader)} takes the whole thing.`,
    ], [leader]);
  }
  if (total(last) < 0) {
    add('basement', 52, [
      `${nameOf(last)} is on ${total(last)}. That is a negative number, on purpose, in a game.`,
      `${nameOf(last)} has fewer points than they started with. Impressive, in a way.`,
    ], [last]);
  } else if (current.length > 2 && total(current[current.length - 2]) - total(last) >= 15) {
    add('adrift', 44, [
      `${nameOf(last)} is ${total(current[current.length - 2]) - total(last)} behind everyone. Send a search party.`,
      `${nameOf(last)} is playing a different, sadder game.`,
    ], [last]);
  }
  const climber = ids.find(id => move[id] === 'up' && previous.indexOf(id) - current.indexOf(id) >= 2);
  if (climber) {
    const places = previous.indexOf(climber) - current.indexOf(climber);
    if (current.indexOf(climber) === 0 && previous.indexOf(climber) === previous.length - 1) {
      add('comeback', 82, [
        `${nameOf(climber)} went from last to first in one round. Insufferable.`,
        `Last to first. ${nameOf(climber)} would like everyone to have seen that.`,
      ], [climber]);
    } else {
      add('climb', 58, [
        `${nameOf(climber)} climbed ${places} places. Ladder acquired.`,
        `${places} places up for ${nameOf(climber)}. Somebody found a gear.`,
      ], [climber]);
    }
  }
  const faller = ids.find(id => move[id] === 'down' && current.indexOf(id) - previous.indexOf(id) >= 2);
  if (faller) {
    add('freefall', 56, [
      `${nameOf(faller)} dropped ${current.indexOf(faller) - previous.indexOf(faller)} places. Gravity is undefeated.`,
      `A bad round for ${nameOf(faller)}, and the table noticed.`,
    ], [faller]);
  }
  if (roundNumber > 1 && ids.every(id => move[id] === null)) {
    add('stasis', 32, [
      'Not one place changed hands. A round of quiet mutual respect.',
      'Everyone finished exactly where they started. Efficient.',
    ]);
  }

  // === who was fighting whom ==============================================
  const topPair = Object.entries(pair).sort(([, a], [, b]) => b - a)[0];
  if (topPair && topPair[1] >= 3) {
    const [a, b] = topPair[0].split('|');
    add('rivalry', 78, [
      `${nameOf(a)} and ${nameOf(b)} went for the same pile ${topPair[1]} times. Get a room.`,
      `${topPair[1]} photo-finishes between ${nameOf(a)} and ${nameOf(b)}. This is no longer about cards.`,
    ], [a, b]);
  }
  const bully = Object.entries(won).sort(([, a], [, b]) => b - a)[0];
  if (bully && bully[1] >= 3) {
    add('bully', 62, [
      `${nameOf(bully[0])} won ${bully[1]} races to the same space. Fast hands.`,
      `${bully[1]} cards snatched out from under people by ${nameOf(bully[0])}.`,
    ], [bully[0]]);
  }
  const unlucky = Object.entries(lost).sort(([, a], [, b]) => b - a)[0];
  if (unlucky && unlucky[1] >= 3) {
    add('unlucky', 60, [
      `${nameOf(unlucky[0])} lost ${unlucky[1]} races. Fractionally too slow, ${unlucky[1]} separate times.`,
      `${nameOf(unlucky[0])} has been second to the same pile ${unlucky[1]} times. Painful.`,
    ], [unlucky[0]]);
  }

  // === the board ===========================================================
  const closer = Object.entries(finished).sort(([, a], [, b]) => b - a)[0];
  if (closer && closer[1] >= 2) {
    add('pile-closer', 54, [
      `${nameOf(closer[0])} closed ${closer[1]} piles. Somebody has to do the washing up.`,
      `${closer[1]} tens from ${nameOf(closer[0])}. Finishing what others start.`,
    ], [closer[0]]);
  }
  const opener = Object.entries(opened).sort(([, a], [, b]) => b - a)[0];
  if (opener && opener[1] >= 3) {
    add('opener', 42, [
      `${nameOf(opener[0])} opened ${opener[1]} piles. Generous. Everyone else said thanks.`,
      `${opener[1]} Aces down from ${nameOf(opener[0])}, mostly for other people to build on.`,
    ], [opener[0]]);
  }
  // Three or more, and a clear majority: at two players "half the middle" is the
  // expected outcome rather than a remark, and it was crowding out pile-closer,
  // which is nearly always about the same person.
  const biggest = Object.entries(played).sort(([, a], [, b]) => b - a)[0];
  const totalPlayed = Object.values(played).reduce((a, b) => a + b, 0);
  if (biggest && ids.length > 2 && biggest[1] >= 0.55 * totalPlayed) {
    add('board-owner', 64, [
      `Half the middle belongs to ${nameOf(biggest[0])}. The others are decorating.`,
      `${nameOf(biggest[0])} owns most of the board. Rude.`,
    ], [biggest[0]]);
  }

  // === the machines ========================================================
  const botIds = ids.filter(id => players[id].isBot);
  const humanIds = ids.filter(id => !players[id].isBot);
  if (botIds.length && humanIds.length) {
    const bestBot = botIds.sort((a, b) => total(b) - total(a))[0];
    const bestHuman = humanIds.sort((a, b) => total(b) - total(a))[0];
    if (total(bestBot) > total(bestHuman)) {
      if (players[bestBot].botLevel === 'easy') {
        add('easy-shame', 86, [
          `${nameOf(bestBot)} is on Easy. ${nameOf(bestBot)} is also winning. Sit with that.`,
          `Losing to the easy bot is a choice, and you have all made it.`,
        ], [bestBot]);
      } else {
        add('bot-ahead', 68, [
          `${nameOf(bestBot)} is ahead of every human here, and it does not have thumbs.`,
          `A bot is beating all of you. It is not even trying to enjoy itself.`,
        ], [bestBot]);
      }
    }
  }
  if (blitzedBy && players[blitzedBy]?.isBot) {
    add('bot-blitz', 60, [
      `${nameOf(blitzedBy)} blitzed. It is a bot. It does not even want the points.`,
      `Beaten to it by ${nameOf(blitzedBy)}, who is made of arithmetic.`,
    ], [blitzedBy]);
  }

  // === meta ================================================================
  const gone = ids.find(id => !players[id].connected && !players[id].isBot);
  if (gone) {
    add('departed', 48, [
      `${nameOf(gone)} has left the building. Their cards have not.`,
      `${nameOf(gone)} is offline, and somehow still not last.`,
    ], [gone]);
  }
  if (roundNumber === 1) {
    add('first-round', 24, [
      'One round down. Plenty of time to make this worse.',
      'Early days. Nobody has anything to be smug about yet. Yet.',
    ]);
  } else if (roundNumber >= 8) {
    add('long-game', 30, [
      `Round ${roundNumber}. Somebody actually win, please.`,
      `${roundNumber} rounds in. This has stopped being a game and become a lifestyle.`,
    ]);
  }

  // === the last word =======================================================
  if (input.final) {
    const margin = current.length > 1 ? total(leader) - total(current[1]) : 0;
    add('champion', 99, margin >= 20 ? [
      `${nameOf(leader)} wins by ${margin}. The rest of you were furniture.`,
      `${nameOf(leader)} takes it at a canter. Nobody laid a glove on them.`,
    ] : [
      `${nameOf(leader)} takes it by ${margin}. Close enough to hurt.`,
      `${nameOf(leader)} wins, barely. ${nameOf(current[1])} will be thinking about that one.`,
    ], [leader, ...(current[1] ? [current[1]] : [])]);
    if (total(last) < 0) {
      add('negative-finish', 58, [
        `${nameOf(last)} finished on ${total(last)}. It takes real commitment to end below zero.`,
        `${nameOf(last)} ends in the red. Well played, in a sense.`,
      ], [last]);
    }
  }

  // Highest priority first, then thinned: the rules overlap heavily on whoever had
  // the big round, and six lines about one player is not commentary, it is a
  // fan club. A remark is dropped only when EVERY player it is about has already
  // had their say - so a rivalry still lands on the strength of the other party,
  // which is the whole point of a rivalry.
  const counts: Record<string, number> = {};
  const kept: Remark[] = [];
  for (const remark of out.sort((a, b) => b.priority - a.priority)) {
    const subjects = remark.about;
    if (subjects.length && subjects.every(id => (counts[id] ?? 0) >= MAX_PER_PLAYER)) continue;
    subjects.forEach(id => { counts[id] = (counts[id] ?? 0) + 1; });
    kept.push(remark);
    if (kept.length === MAX_REMARKS) break;
  }
  return kept;
}

/** The sheets' entry point: everything the rules need, pulled off one room. */
export function remarksForRoom(room: Room, final = false): Remark[] {
  const round = room.round;
  const started = round?.startedAt ?? 0;
  const ended = round?.endedAt ?? 0;
  return commentary({
    players: room.players,
    scores: round?.scores ?? null,
    spaces: round?.spaces ?? [],
    duels: round?.duels ?? null,
    blitzedBy: round?.blitzedBy ?? null,
    roundNumber: room.meta.roundNumber,
    targetScore: room.meta.targetScore,
    // Both are server timestamps, so the difference is honest even though the two
    // clients' own clocks are not.
    durationMs: started > 0 && ended > started ? ended - started : null,
    stuckRounds: round?.stuckRounds ?? 0,
    final,
  });
}
