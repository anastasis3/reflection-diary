#!/usr/bin/env node
/**
 * Fills the database with one demo account and a month of history.
 *
 *     npm run seed
 *     → demo@example.test / demo12345
 *
 * Why it exists: the History screen, the trend chart and the calendar only
 * show anything after weeks of use. Waiting a month to look at them is not a
 * way to develop or to demonstrate the project.
 *
 * What it is not: these entries are written here, not collected from anyone.
 * Nothing produced by this script is a result, and no number taken from it
 * belongs in the thesis. It exercises the screens, nothing more.
 *
 * Running it replaces whatever is in the data file.
 */
import process from 'node:process';
import store from '../src/data/store.js';
import * as usersRepo from '../src/repositories/users.repo.js';
import * as profilesRepo from '../src/repositories/profiles.repo.js';
import * as consentsRepo from '../src/repositories/consents.repo.js';
import * as onboardingRepo from '../src/repositories/onboarding.repo.js';
import * as weightsRepo from '../src/repositories/weights.repo.js';
import * as entriesRepo from '../src/repositories/entries.repo.js';
import * as promptsShownRepo from '../src/repositories/promptsShown.repo.js';
import { hashPassword } from '../src/utils/password.js';
import { ONBOARDING_STATEMENTS, ZONE_IDS } from '../src/data/zones.js';
import { promptsForZone } from '../src/data/prompts.js';
import { classifyWithLexicon } from '../src/services/classification.service.js';
import { nextWeight } from '../src/services/adaptation.service.js';
import { chooseZone } from '../src/services/selection.service.js';
import { toDay, daysAgo } from '../src/utils/dates.js';

const EMAIL = 'demo@example.test';
const PASSWORD = 'demo12345';
const DAYS = 30;

/** A reproducible pseudo-random source, so two runs give the same database. */
function seededRandom(seed = 42) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

/** Entries written for this script. Each is plausible, none is anyone's. */
const SAMPLE_ENTRIES = [
  'Three meetings at the office that could have been one message. By six I had nothing left for the thing I actually care about.',
  'Slept badly again, maybe five hours. No energy by the afternoon and I gave up on the evening entirely.',
  'Called my sister for the first time in three weeks. We talked for an hour and I felt lighter afterwards.',
  'My back hurt from Wednesday on. I kept sitting through it and only went for a walk on Saturday, which helped immediately.',
  'I was more nervous before the review than the situation deserved. Wrote down the three things I wanted to say and it went quietly.',
  'Finished the chapter nobody is waiting for. Still felt like the most useful hour of the week.',
  'Spent an hour reading about something completely useless to me and enjoyed every minute.',
  'The flat is a mess and the bills are piling up on the table. Ten minutes would fix it and I keep not doing it.',
  'Had the deadline moved again. I noticed I was relieved rather than annoyed, which tells me something.',
  'Walked instead of taking the bus and arrived in a better mood than I left.',
  'Realised I have been saying yes to things I do not want to do, and nothing broke when I finally said no.',
  'Cooked properly for the first time in a fortnight. Small thing, but the evening felt like mine.',
  'Woke up at five and could not get back to sleep. Lay there listing everything I had not done.',
  'A colleague asked how I was and I answered honestly. It was less awkward than I expected.',
  'Too much screen, not enough daylight. By Thursday I could feel it in my eyes and my mood.',
  'Started the course I keep putting off. One lesson in and I already want to keep going.',
  'Nothing much happened today. That was not a bad thing.',
  'The project finally shipped. I expected to feel more than I did.',
  'Thought about what I actually want the next year to look like, and had no answer ready.',
  'Someone cancelled on me and my first feeling was relief at the free evening.',
];

async function seed() {
  console.log(`Seeding ${store.file}`);
  store.reset();

  const random = seededRandom();

  // --- the account --------------------------------------------------------
  const user = usersRepo.create({ email: EMAIL, passwordHash: await hashPassword(PASSWORD) });
  profilesRepo.create(user.id);
  consentsRepo.grant(user.id, 'study');
  consentsRepo.grant(user.id, 'ai_processing');

  // --- the quiz, taken a month ago ----------------------------------------
  for (const statement of ONBOARDING_STATEMENTS) {
    onboardingRepo.upsert(user.id, statement.zoneId, 1 + Math.floor(random() * 5));
  }
  weightsRepo.seedFromQuiz(user.id, onboardingRepo.listForUser(user.id));
  profilesRepo.markOnboardingComplete(user.id);

  // --- a month of days ----------------------------------------------------
  let written = 0;
  let previousZone = null;

  for (let back = DAYS - 1; back >= 0; back -= 1) {
    const day = daysAgo(back);

    // Choose the question exactly as the application would.
    const { zoneId, reason } = chooseZone({
      weights: weightsRepo.listForUser(user.id),
      excludeZone: previousZone,
      random,
    });
    previousZone = zoneId;

    const candidates = promptsForZone(zoneId);
    const prompt = candidates[Math.floor(random() * candidates.length)];

    const shown = promptsShownRepo.create({
      userId: user.id,
      promptId: prompt.id,
      zoneId,
      selectionReason: reason,
    });
    // Back-date it, since the repository stamps "now".
    shown.shownAt = `${day}T08:00:00.000Z`;

    // About three days in four produce an entry — the gaps are the point.
    if (random() > 0.26) {
      const text = SAMPLE_ENTRIES[Math.floor(random() * SAMPLE_ENTRIES.length)];
      const entry = entriesRepo.create({ userId: user.id, text });
      entry.createdAt = `${day}T20:${String(10 + Math.floor(random() * 45)).padStart(2, '0')}:00.000Z`;

      const scores = classifyWithLexicon(text);
      entriesRepo.saveScores(entry.id, scores);
      entriesRepo.findById(entry.id).classifiedAt = entry.createdAt;

      // Move the weights, and record each day's value so the trend has a line.
      // This mirrors adaptation.service.applyEntryScores rather than calling
      // it, because the service stamps today's date on the history and these
      // rows have to be back-dated. The two rules must stay in step: skip a
      // muted zone, and skip a zone this entry says nothing about.
      for (const row of weightsRepo.listForUser(user.id)) {
        if (row.isMuted || !scores[row.zoneId]) continue;
        row.weight = nextWeight(row.weight, scores[row.zoneId]);
        row.source = 'entry';
        const existing = store.state.weightHistory.find(
          (h) => h.userId === user.id && h.zoneId === row.zoneId && h.asOf === day,
        );
        if (existing) existing.weight = row.weight;
        else store.state.weightHistory.push({ userId: user.id, zoneId: row.zoneId, asOf: day, weight: row.weight });
      }

      promptsShownRepo.linkEntry(shown.id, entry.id);
      // Roughly three questions in five are rated.
      if (random() < 0.6) {
        shown.relevanceRating = random() < 0.68;
        shown.ratedAt = `${day}T21:30:00.000Z`;
      }
      written += 1;
    }

    shown.explanationOpened = random() < 0.22;
  }

  store.save();

  const summary = weightsRepo
    .listForUser(user.id)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((w) => `${w.zoneId} ${w.weight.toFixed(2)}`)
    .join(', ');

  console.log(`
  account     ${EMAIL} / ${PASSWORD}
  days        ${DAYS} (${toDay(new Date(Date.now() - (DAYS - 1) * 86400000))} to ${toDay()})
  entries     ${written}
  questions   ${promptsShownRepo.listForUser(user.id).length}
  top zones   ${summary}
  zones       ${ZONE_IDS.length}

  Now run: npm start
`);
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
