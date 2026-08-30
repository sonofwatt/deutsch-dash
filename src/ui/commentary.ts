import { rankRows } from './scoreRanks';
import { statsFor, type GameStats } from '../game/stats';
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
  /** Everything one round cannot know: streaks, records, who has never lost a race. */
  stats: GameStats | null;
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

/** "1 second", "2 seconds". Snark does not survive a grammar mistake. */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MAX_REMARKS = 6;
/** Nobody wants five jokes about the same person. */
const MAX_PER_PLAYER = 2;

export function commentary(input: CommentaryInput): Remark[] {
  const { players, scores, spaces, duels, blitzedBy, roundNumber, targetScore } = input;
  const ids = Object.keys(players);
  if (ids.length === 0) return [];

  const nameOf = (id: string) => players[id]?.name ?? 'Somebody';
  /**
   * Some facts are true for the rest of the game once they are true at all - a
   * standing blitz record, a bot in front, a player who has not lost a race - and
   * repeating one every round is how a carousel teaches people to ignore it.
   * These surface on alternating rounds, staggered per rule so they do not all
   * arrive and leave together.
   */
  const standing = (id: string) => (roundNumber + hash(id)) % 2 === 0;
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
  const { previous, current, move, places } = rankRows(players, scores);
  const total = (id: string) => players[id].score;
  const leader = current[0];
  const last = current[current.length - 1];
  const lead = current.length > 1 ? total(leader) - total(current[1]) : 0;
  const delta = (id: string) => scores?.[id]?.delta ?? 0;
  const deltas = ids.map(delta).sort((a, b) => b - a);
  // Floored, not rounded: the keeper shows a clock, and a round it displayed as
  // 0:11 must not be described a moment later as twelve seconds.
  const seconds = Math.floor((input.durationMs ?? 0) / 1000);

  // === the round itself ====================================================
  if (!blitzedBy) {
    add('stalled', 90, [
      'Nobody could move. That was less a round than a standoff.',
      'Round over by mutual exhaustion. No winner, only survivors.',
      `Nobody moved. Nobody scored. Nobody covered themselves in glory.`,
      `Nobody could move. I call that a stand-off. Well - I call it that, nobody else does.`,
    ]);
  }
  if (blitzedBy && input.durationMs != null && seconds > 0 && seconds <= 60) {
    add('speed-blitz', 95, [
      `${nameOf(blitzedBy)} blitzed in ${plural(seconds, 'second')}. Everyone else was still reading their cards.`,
      `${plural(seconds, 'second')}. ${nameOf(blitzedBy)} came to play; the rest came to watch.`,
      `${plural(seconds, 'second')}. Some of you are still deciding which pile to look at.`,
      `${plural(seconds, 'second')}. Blink and you missed it, which several of you did.`,
    ], [blitzedBy]);
  }
  if (input.durationMs != null && input.durationMs >= 240_000) {
    add('slog', 40, [
      `${Math.round(input.durationMs / 60_000)} minutes for one round. Somebody put the kettle on.`,
      'That round could have been an email.',
      `That round took long enough for the cards to go out of fashion.`,
      `That round had a beginning, a middle, and no discernible end. Like my stories, apparently.`,
    ]);
  }
  if (input.stuckRounds >= 2) {
    add('rotations', 55, [
      'Two full wood rotations before anything happened. Vintage stuff.',
      'The table stalled so often the piles started to gather dust.',
      `The wood went round twice. The cards have seen more of each other than you have.`,
      `The wood went round and round. Wheel, wheel, wheel. Nothing else did.`,
    ]);
  }
  if (completed === 0 && spaces.length > 0) {
    add('no-piles', 38, [
      'Not one pile made it to ten. Ambitious openings, no follow-through.',
      'Eight piles started, none finished. Very on-brand.',
      `Not one pile finished. Plenty of enthusiasm, no closing argument.`,
      `No pile reached ten. You were all at nine-teen the whole time.`,
    ]);
  }

  // === how it was scored ===================================================
  if (scores && ids.every(id => delta(id) < 0)) {
    add('wipeout', 70, [
      'Everybody lost points. Congratulations to nobody.',
      'A round so bad the scoreboard went backwards for all of you.',
      `Every single score went down. A collective achievement, of sorts.`,
      `Everyone went backwards. A group effort, and the group should be ashamed.`,
    ]);
  }
  if (blitzedBy && (scores?.[blitzedBy]?.centerCount ?? 0) >= 8) {
    add('perfect', 84, [
      `${nameOf(blitzedBy)} emptied the Blitz pile AND left ${scores![blitzedBy].centerCount} cards in the middle. Show-off.`,
      `${nameOf(blitzedBy)} did both jobs at once. Insufferable.`,
      `${nameOf(blitzedBy)} won the round and the board. Leave something for the others.`,
      `${nameOf(blitzedBy)} did the lot. Deal with it - because ${nameOf(blitzedBy)} certainly did.`,
    ], [blitzedBy]);
  }
  if (deltas.length > 1 && deltas[0] > 0 && deltas[0] >= 2 * Math.max(deltas[1], 1)) {
    const best = ids.find(id => delta(id) === deltas[0])!;
    add('landslide', 66, [
      `${nameOf(best)} scored ${deltas[0]} — more than double anyone else. Unsporting.`,
      `${nameOf(best)} took ${deltas[0]} points off that round. The rest of you shared the scraps.`,
      `${nameOf(best)} lapped the table. The rest of you were sharing a brain cell.`,
      `${nameOf(best)} scored ${deltas[0]}. The rest of you scored a lift home.`,
    ], [best]);
  }
  const passenger = ids.find(id => scores && (scores[id]?.centerCount ?? 0) === 0);
  if (passenger && ids.length > 1) {
    add('passenger', 50, [
      `${nameOf(passenger)} played exactly zero cards to the middle. Present in body.`,
      `Not a single card from ${nameOf(passenger)}. Lovely to have you along.`,
      `${nameOf(passenger)} contributed nothing to the middle and everything to the atmosphere.`,
      `${nameOf(passenger)} played nothing to the middle. Not a card. Card to believe.`,
    ], [passenger]);
  }
  const hoarder = ids.find(id => id !== blitzedBy && (scores?.[id]?.blitzLeft ?? 0) >= 8);
  if (hoarder) {
    add('barely-started', 46, [
      `${nameOf(hoarder)} finished with ${scores![hoarder].blitzLeft} cards still in the Blitz pile. Was it a nice nap?`,
      `${nameOf(hoarder)}'s Blitz pile is basically untouched. Bold strategy.`,
      `${nameOf(hoarder)} guarded that Blitz pile like it was evidence.`,
      `${nameOf(hoarder)} is still holding ${scores![hoarder].blitzLeft} Blitz cards. Blitz-erly disappointing.`,
    ], [hoarder]);
  }

  // === the table ===========================================================
  const gap = current.length > 1 ? Math.abs(total(leader) - total(current[1])) : 0;
  if (current.length > 1 && gap <= 2) {
    add('photo-finish', 76, gap === 0 ? [
      `${nameOf(leader)} and ${nameOf(current[1])} are dead level. Somebody do something.`,
      `Not a point between ${nameOf(leader)} and ${nameOf(current[1])}. This is going to get personal.`,
    ] : [
      `${nameOf(leader)} and ${nameOf(current[1])} are ${plural(gap, 'point')} apart. Somebody blink.`,
      `Nothing between ${nameOf(leader)} and ${nameOf(current[1])}. This is going to get personal.`,
    ], [leader, current[1]]);
  } else if (lead >= Math.max(15, targetScore / 4)) {
    add('runaway', 72, [
      `${nameOf(leader)} is ${lead} clear. Everyone else is playing for second.`,
      `${lead} points ahead. ${nameOf(leader)} has stopped being a player and become the weather.`,
      `${nameOf(leader)} is ${lead} ahead. At this point it is less a game than a documentary.`,
      `${nameOf(leader)} is ${lead} ahead. At what point does this stop being a game and start being a lift?`,
    ], [leader]);
  }
  if (!input.final && total(leader) >= targetScore - 6 && total(leader) < targetScore) {
    add('match-point', 88, [
      `${nameOf(leader)} needs ${targetScore - total(leader)} more. Feel free to panic.`,
      `One decent round and ${nameOf(leader)} takes the whole thing.`,
      `${nameOf(leader)} is ${targetScore - total(leader)} from ending this. Someone stop them, ideally now.`,
      `${nameOf(leader)} needs ${targetScore - total(leader)}. That is not a lead, that is a countdown.`,
    ], [leader]);
  }
  // Strictly lowest, not merely sorted last: on a table where everyone is level on
  // the same negative score, naming one of them is just picking on whoever RTDB
  // happened to key first.
  if (total(last) < 0 && total(last) < total(leader)) {
    add('basement', 52, [
      `${nameOf(last)} is on ${total(last)}. That is a negative number, on purpose, in a game.`,
      `${nameOf(last)} has fewer points than they started with. Impressive, in a way.`,
      `${nameOf(last)} is on ${total(last)}. Going backwards is a skill nobody asked for.`,
      `${nameOf(last)} is on ${total(last)}. That is not a score, that is a debt.`,
    ], [last]);
  } else if (current.length > 2 && total(current[current.length - 2]) - total(last) >= 15) {
    add('adrift', 44, [
      `${nameOf(last)} is ${total(current[current.length - 2]) - total(last)} behind everyone. Send a search party.`,
      `${nameOf(last)} is playing a different, sadder game.`,
      `${nameOf(last)} is so far back the leaders are a rumour.`,
      `${nameOf(last)} is miles back. Send a postcard when you arrive.`,
    ], [last]);
  }
  // Two genuine overtakes, not two rows. See rankRows: on a table where everyone
  // was level, finishing above somebody is not passing them.
  const climber = ids.find(id => places[id] >= 2);
  if (climber) {
    const climbed = places[climber];
    if (current.indexOf(climber) === 0 && previous.indexOf(climber) === previous.length - 1) {
      add('comeback', 82, [
        `${nameOf(climber)} went from last to first in one round. Insufferable.`,
        `Last to first. ${nameOf(climber)} would like everyone to have seen that.`,
      `Last to first in one round. ${nameOf(climber)} will be mentioning this for years.`,
      `Last to first for ${nameOf(climber)}. Nobody saw it coming, including ${nameOf(climber)}.`,
      ], [climber]);
    } else {
      add('climb', 58, [
        `${nameOf(climber)} climbed ${plural(climbed, 'place')}. Ladder acquired.`,
        `${plural(climbed, 'place')} up for ${nameOf(climber)}. Somebody found a gear.`,
      `${nameOf(climber)} went up ${plural(climbed, 'place')} while nobody was watching. Sneaky.`,
      `${nameOf(climber)} is up ${plural(climbed, 'place')}. Stair we go.`,
      ], [climber]);
    }
  }
  const faller = ids.find(id => places[id] <= -2);
  if (faller) {
    add('freefall', 56, [
      `${nameOf(faller)} dropped ${plural(-places[faller], 'place')}. Gravity is undefeated.`,
      `A bad round for ${nameOf(faller)}, and the table noticed.`,
      `${nameOf(faller)} fell ${plural(-places[faller], 'place')}. That is not a slump, that is a trapdoor.`,
      `${nameOf(faller)} is down ${plural(-places[faller], 'place')}. What goes up, and so on.`,
    ], [faller]);
  }
  // Also alternated: a settled table stays settled, and this was filling a slot
  // every round of a quiet stretch.
  if (roundNumber > 1 && ids.every(id => move[id] === null) && standing('stasis')) {
    add('stasis', 32, [
      'Not one place changed hands. A round of quiet mutual respect.',
      'Everyone finished exactly where they started. Efficient.',
      `Nothing changed. You could have all stayed home.`,
      `Nobody moved anywhere. Riveting. Truly.`,
    ]);
  }

  // === who was fighting whom ==============================================
  const topPair = Object.entries(pair).sort(([, a], [, b]) => b - a)[0];
  if (topPair && topPair[1] >= 3) {
    const [a, b] = topPair[0].split('|');
    // Same rule as pile-closer: the count is the point, so it goes in every line.
    add('rivalry', 78, [
      `${nameOf(a)} and ${nameOf(b)} went for the same pile ${plural(topPair[1], 'time')}. Get a room.`,
      `${topPair[1]} photo-finishes between ${nameOf(a)} and ${nameOf(b)}. This is no longer about cards.`,
      `${nameOf(a)} and ${nameOf(b)} keep reaching for the same card. It is starting to look deliberate.`,
      `${plural(topPair[1], 'time')} ${nameOf(a)} and ${nameOf(b)} went for the same card. At this point just deal them their own table.`,
    ], [a, b]);
  }
  const bully = Object.entries(won).sort(([, a], [, b]) => b - a)[0];
  if (bully && bully[1] >= 3) {
    add('bully', 62, [
      `${nameOf(bully[0])} won ${plural(bully[1], 'race')} to the same space. Fast hands.`,
      `${bully[1]} cards snatched out from under people by ${nameOf(bully[0])}.`,
      `${nameOf(bully[0])} has taken ${plural(bully[1], 'pile')} off people who were already reaching. Charming.`,
      `${nameOf(bully[0])} keeps getting there first. Some people have no manners and excellent reflexes.`,
    ], [bully[0]]);
  }
  const unlucky = Object.entries(lost).sort(([, a], [, b]) => b - a)[0];
  if (unlucky && unlucky[1] >= 3) {
    add('unlucky', 60, [
      `${nameOf(unlucky[0])} lost ${plural(unlucky[1], 'race')}. Fractionally too slow, ${plural(unlucky[1], 'separate time')}.`,
      `${nameOf(unlucky[0])} has been second to the same pile ${unlucky[1]} times. Painful.`,
      `${nameOf(unlucky[0])} lost ${bully ? '' : ''}${unlucky[1]} races. Always the bridesmaid, never fast enough.`,
      `${nameOf(unlucky[0])} keeps arriving second. Close, but no cigar - and no card either.`,
    ], [unlucky[0]]);
  }

  // === the board ===========================================================
  const closer = Object.entries(finished).sort(([, a], [, b]) => b - a)[0];
  if (closer && closer[1] >= 2) {
    // Every variant of this one carries the count: it is a tally remark, and
    // commentary.test.ts pins that the tally comes off the BOARD rather than the
    // scores by looking for the number in whatever phrasing the hash picks.
    add('pile-closer', 54, [
      `${nameOf(closer[0])} closed ${plural(closer[1], 'pile')}. Somebody has to do the washing up.`,
      `${closer[1]} tens from ${nameOf(closer[0])}. Finishing what others start.`,
      `${nameOf(closer[0])} keeps finishing other people's piles - ${closer[1]} of them. Tidy, and slightly smug.`,
      `${plural(closer[1], 'pile')} closed by ${nameOf(closer[0])}. Somebody has to take out the tens.`,
    ], [closer[0]]);
  }
  const opener = Object.entries(opened).sort(([, a], [, b]) => b - a)[0];
  if (opener && opener[1] >= 3) {
    add('opener', 42, [
      `${nameOf(opener[0])} opened ${plural(opener[1], 'pile')}. Generous. Everyone else said thanks.`,
      `${opener[1]} Aces down from ${nameOf(opener[0])}, mostly for other people to build on.`,
      `${nameOf(opener[0])} laid ${plural(opener[1], 'Ace')} down for everyone else to enjoy. Very generous. Very costly.`,
      `${nameOf(opener[0])} keeps laying Aces down for everyone else. Very generous. Ace-tually costly.`,
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
      `Most of that board has ${nameOf(biggest[0])}'s badge on it. The rest of you are set dressing.`,
      `That board is mostly ${nameOf(biggest[0])}'s. The rest of you are wallpaper.`,
    ], [biggest[0]]);
  }

  // === the machines ========================================================
  const botIds = ids.filter(id => players[id].isBot);
  const humanIds = ids.filter(id => !players[id].isBot);
  if (botIds.length && humanIds.length) {
    const bestBot = botIds.sort((a, b) => total(b) - total(a))[0];
    const bestHuman = humanIds.sort((a, b) => total(b) - total(a))[0];
    if (total(bestBot) > total(bestHuman)) {
      if (players[bestBot].botLevel === 'easy' && standing('easy-shame')) {
        add('easy-shame', 86, [
          `${nameOf(bestBot)} is on Easy. ${nameOf(bestBot)} is also winning. Sit with that.`,
          `Losing to the easy bot is a choice, and you have all made it.`,
      `The Easy bot is winning. It is not even paying attention.`,
      `The Easy bot is winning. It is called Easy. Sit with that for a moment.`,
        ], [bestBot]);
      } else if (standing('bot-ahead')) {
        add('bot-ahead', 68, [
          `${nameOf(bestBot)} is ahead of every human here, and it does not have thumbs.`,
          `A bot is beating all of you. It is not even trying to enjoy itself.`,
      `You are all losing to software that has never once wanted anything.`,
      `A bot is beating all of you. It does not even have a stake in this. Or hands.`,
        ], [bestBot]);
      }
    }
  }
  if (blitzedBy && players[blitzedBy]?.isBot) {
    add('bot-blitz', 60, [
      `${nameOf(blitzedBy)} blitzed. It is a bot. It does not even want the points.`,
      `Beaten to it by ${nameOf(blitzedBy)}, who is made of arithmetic.`,
      `${nameOf(blitzedBy)} blitzed, felt nothing, and moved on. Be more like ${nameOf(blitzedBy)}.`,
      `Beaten by ${nameOf(blitzedBy)}, who is a program. No hard feelings, because it has none.`,
    ], [blitzedBy]);
  }

  // === the game so far, not just this round ================================
  const stats = input.stats;
  const games = stats?.rounds ?? 0;
  if (stats && games >= 2) {
    const streaker = ids.find(id => statsFor(stats, id).lastStreak >= 2);
    if (streaker) {
      const k = statsFor(stats, streaker).lastStreak;
      add('last-streak', 68, [
        `${nameOf(streaker)} has been bottom of the table ${plural(k, 'round')} running. A tradition, at this point.`,
        `${plural(k, 'straight round')} propping up the scoreboard for ${nameOf(streaker)}. Consistency of a kind.`,
      `${plural(k, 'round')} at the bottom. ${nameOf(streaker)} has made it their own.`,
      `${plural(k, 'round')} at the bottom for ${nameOf(streaker)}. That is not a slump, that is a postcode.`,
      ], [streaker]);
    }
    if (stats.best && stats.best.round === roundNumber && stats.best.delta > 0 && players[stats.best.uid]) {
      add('record-round', 74, [
        `${nameOf(stats.best.uid)}'s +${stats.best.delta} is the best round anyone has managed all game.`,
        `Nobody has had a round like ${nameOf(stats.best.uid)}'s +${stats.best.delta} tonight.`,
      `Nobody else has come close to ${nameOf(stats.best.uid)}'s +${stats.best.delta} tonight.`,
      `${nameOf(stats.best.uid)}'s +${stats.best.delta} is the best of the night. Peaked, probably.`,
      ], [stats.best.uid]);
    }
    if (stats.worst && stats.worst.round === roundNumber && stats.worst.delta < 0 && players[stats.worst.uid]) {
      add('record-low', 63, [
        `${nameOf(stats.worst.uid)}'s ${stats.worst.delta} is the worst round of the night so far.`,
        `${stats.worst.delta} is a new low for this table, and it belongs to ${nameOf(stats.worst.uid)}.`,
      `${stats.worst.delta}. ${nameOf(stats.worst.uid)} has set a bar nobody wants to reach.`,
      `${stats.worst.delta} for ${nameOf(stats.worst.uid)}. A personal worst, and the night is young.`,
      ], [stats.worst.uid]);
    }
    const unbeaten = ids.find(id => {
      const p = statsFor(stats, id);
      return p.racesLost === 0 && p.racesWon >= 2;
    });
    if (unbeaten && stats.races >= 4 && standing('unbeaten')) {
      add('unbeaten', 66, [
        `${nameOf(unbeaten)} has not lost a single race all game. Suspicious reflexes.`,
        `Every race ${nameOf(unbeaten)} has been in, ${nameOf(unbeaten)} has won. Nobody likes that.`,
      ], [unbeaten]);
    }
    // ...and only in a round where somebody blitzed and failed to beat it, which
    // is when the record is actually the story.
    if (stats.fastest && stats.fastest.round !== roundNumber && players[stats.fastest.uid]
        && blitzedBy && input.durationMs != null && standing('standing-record')) {
      add('standing-record', 48, [
        `${nameOf(stats.fastest.uid)}'s ${Math.round(stats.fastest.ms / 1000)}-second blitz is still the one to beat.`,
        `Nobody has got near ${nameOf(stats.fastest.uid)}'s ${Math.round(stats.fastest.ms / 1000)} seconds yet.`,
      ], [stats.fastest.uid]);
    }
    const serial = ids.find(id => statsFor(stats, id).blitzes >= 3);
    if (serial) {
      add('blitz-hoarder', 70, [
        `${nameOf(serial)} has ended ${plural(statsFor(stats, serial).blitzes, 'of these rounds', 'of these rounds')}. Somebody stop them.`,
        `${plural(statsFor(stats, serial).blitzes, 'round')} finished by ${nameOf(serial)}. This is becoming a pattern.`,
      ], [serial]);
    }
    if (games >= 3) {
      const quiet = ids.find(id => statsFor(stats, id).blitzes === 0);
      if (quiet) {
        add('never-blitzed', 44, [
          `${nameOf(quiet)} has yet to end a single round. There is still time. Probably.`,
          `${plural(games, 'round')} and ${nameOf(quiet)} has not called Blitz once.`,
        ], [quiet]);
      }
    }
    // Only in a round the table actually stalled: the running total does not
  // change in between, and it was turning up for five rounds after the fact.
    if (stats.allStuck >= 3 && input.stuckRounds > 0) {
      add('all-stuck', 52, [
        `You have all seized up at the same time ${plural(stats.allStuck, 'time')} now. Impressive teamwork.`,
        `${plural(stats.allStuck, 'full standstill')} this game. The cards are not the problem.`,
      ]);
    }
  }

  // === the badge on their chip ============================================
  //
  // A joke per badge, fired only when the board has actually made it true - a
  // tulip is only a late bloomer if they WERE behind and have just had a good
  // round. They carry a priority in the sixties so they compete with the ordinary
  // remarks rather than displacing them, and `about` puts them under the same
  // two-per-player cap as everything else: the point is a joke that lands once,
  // not a running bit about somebody's chip.
  const badgeOf = (id: string) => players[id]?.badgeId;
  const holder = (badge: string) => ids.find(id => badgeOf(id) === badge);
  const behindBefore = (id: string) =>
    previous.length > 2 && previous.indexOf(id) >= previous.length - 2;

  const tulip = holder('tulip');
  if (tulip && behindBefore(tulip) && delta(tulip) >= 8) {
    add('quip-tulip', 66, [
      `${nameOf(tulip)} finally opens up. A late bloomer, and no, nobody is going to let that go.`,
      `Look at ${nameOf(tulip)} coming up after all that time in the dirt. Bulb-ieve it.`,
      `${nameOf(tulip)} was planted at the bottom for ages and has come up all at once. Bloomin' typical.`,
    ], [tulip]);
  }
  const anchor = holder('anchor');
  if (anchor && places[anchor] <= -2) {
    add('quip-anchor', 68, [
      `${nameOf(anchor)} drops ${plural(-places[anchor], 'place')}. Went down like an anchor, which is on brand and no excuse.`,
      `${nameOf(anchor)} sinks ${plural(-places[anchor], 'place')}. Weigh to go.`,
      `That is ${nameOf(anchor)} anchored to the bottom of the table. The badge was a warning, not a suggestion.`,
    ], [anchor]);
  }
  const bicycle = holder('bicycle');
  if (bicycle && (played[bicycle] ?? 0) > 0
      && (played[bicycle] ?? 0) >= Math.max(...ids.map(id => played[id] ?? 0))) {
    add('quip-bicycle', 64, [
      `${nameOf(bicycle)} put more cards in the middle than anyone. Kept the wheels turning while the rest of you were freewheeling.`,
      `Nobody out-pedalled ${nameOf(bicycle)} this round. Tyre-d yet?`,
      `${nameOf(bicycle)} did the legwork. The others were along for the ride, which is spoke-n about later.`,
    ], [bicycle]);
  }
  const star = holder('star');
  if (star && deltas.length > 1 && delta(star) === deltas[0] && deltas[0] > 0) {
    add('quip-star', 66, [
      `${nameOf(star)} takes the round. A star turn, and now we will never hear the end of it.`,
      `Best round of the lot goes to ${nameOf(star)}. Twinkle twinkle, insufferable star.`,
      `${nameOf(star)} outscored the table. Somebody get them a dressing room.`,
    ], [star]);
  }
  const bell = holder('bell');
  if (bell && blitzedBy === bell) {
    add('quip-bell', 66, [
      `${nameOf(bell)} calls it. Saved by the bell, and everyone else saved by nothing.`,
      `That is ${nameOf(bell)}'s bell. The rest of you were still ringing up.`,
      `${nameOf(bell)} ends the round. You could see that one coming a chime off.`,
    ], [bell]);
  }
  const kite = holder('kite');
  if (kite && current[0] === kite && lead >= 12) {
    add('quip-kite', 64, [
      `${nameOf(kite)} is ${lead} clear and climbing. Somebody find the string.`,
      `${nameOf(kite)} has gone up like a kite. Bring a ladder, or a stiff breeze in the other direction.`,
      `${lead} points up for ${nameOf(kite)}, who is now officially out of reach and insufferable with it.`,
    ], [kite]);
  }
  const acorn = holder('acorn');
  if (acorn && delta(acorn) <= -6) {
    add('quip-acorn', 62, [
      `${nameOf(acorn)} went backwards again. From little acorns, apparently, come slightly smaller acorns.`,
      `A ${delta(acorn)} round for ${nameOf(acorn)}. Nuts.`,
      `${nameOf(acorn)} is not growing into anything at this rate. Oak-ay then.`,
    ], [acorn]);
  }
  const boat = holder('boat');
  if (boat && current[current.length - 1] === boat && current.length > 1) {
    add('quip-boat', 62, [
      `${nameOf(boat)} is bottom of the table and taking on water. Man overboat.`,
      `${nameOf(boat)} is last. Whatever this is, it is not plain sailing.`,
      `The good ship ${nameOf(boat)} is going down with all hands. Both of them.`,
    ], [boat]);
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
    // Strictly lowest, not merely sorted last: on a table where everyone is level on
  // the same negative score, naming one of them is just picking on whoever RTDB
  // happened to key first.
  if (total(last) < 0 && total(last) < total(leader)) {
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
    stats: room.stats ?? null,
    final,
  });
}
