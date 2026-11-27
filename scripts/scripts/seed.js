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
import { randomUUID } from 'node:crypto';
import config from '../src/config/index.js';
import store from '../src/data/store.js';
import {
  accountsRepo, profilesRepo, consentsRepo, onboardingRepo, weightsRepo,
} from '../src/repositories/index.js';
import { ONBOARDING_STATEMENTS, ZONE_IDS } from '../src/data/zones.js';
import { classifyWithLexicon } from '../src/services/classification.service.js';
import { nextWeight } from '../src/services/adaptation.service.js';
import { chooseThree, choosePrompt } from '../src/services/selection.service.js';
import { daysAgo } from '../src/utils/dates.js';

if (config.storage.driver !== 'memory') {
  console.error('npm run seed fills the memory driver only. For Supabase use supabase/seed/test_data.sql.');
  process.exit(1);
}

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
  const S = store.state;

  // --- the account --------------------------------------------------------
  const user = await accountsRepo.createUser({ email: EMAIL, password: PASSWORD });
  await profilesRepo.create(user.id, { displayName: 'Mia' });
  await consentsRepo.grant(user.id, 'study');
  await consentsRepo.grant(user.id, 'ai_processing');

  // --- the quiz, taken a month ago ----------------------------------------
  for (const statement of ONBOARDING_STATEMENTS) {
    await onboardingRepo.upsert(user.id, statement.zoneId, 1 + Math.floor(random() * 5));
  }
  await weightsRepo.seedFromQuiz(user.id, await onboardingRepo.listForUser(user.id));
  await profilesRepo.markOnboardingComplete(user.id);

  // The rows below are written straight into the store, because they have to
  // be back-dated and the repositories stamp "now". The rules are the
  // application's own: chooseThree, the classifier, nextWeight, the boost.
  const live = S.userTopicWeights.filter((w) => w.userId === user.id);
  const remember = (day) => {
    for (const row of live) {
      const h = S.weightHistory.find((x) => x.userId === user.id && x.zoneId === row.zoneId && x.asOf === day);
      if (h) h.weight = row.weight;
      else S.weightHistory.push({ userId: user.id, zoneId: row.zoneId, asOf: day, weight: row.weight });
    }
  };

  // --- a month of days, ending yesterday ----------------------------------
  // Today is left empty, so the demo opens on three fresh questions.
  let written = 0;
  for (let back = DAYS; back >= 1; back -= 1) {
    const day = daysAgo(back);
    const three = chooseThree({ weights: live, random }).map((q) => ({
      id: randomUUID(),
      userId: user.id,
      promptId: choosePrompt(q.zoneId, random).id,
      zoneId: q.zoneId,
      selectionReason: q.reason,
      shownOn: day,
      slot: q.slot,
      shownAt: `${day}T08:00:00.000Z`,
      wasChosen: false,
      chosenAt: null,
      wasAnswered: false,
      entryId: null,
      relevanceRating: null,
      ratedAt: null,
      explanationOpened: random() < 0.2,
    }));
    S.promptsShown.push(...three);

    // About three days in four have an entry; one in five of those a second.
    const answers = random() > 0.26 ? (random() < 0.2 ? 2 : 1) : 0;
    const order = [...three].sort(() => random() - 0.5).slice(0, answers);

    for (const [k, shown] of order.entries()) {
      const at = `${day}T20:${String(10 + k * 25 + Math.floor(random() * 20)).padStart(2, '0')}:00.000Z`;
      // the pick: once, small, source = choice
      const picked = live.find((w) => w.zoneId === shown.zoneId);
      picked.weight = Math.round(Math.min(1, picked.weight + config.adaptation.choiceBoost) * 1000) / 1000;
      picked.source = 'choice';

      const text = SAMPLE_ENTRIES[Math.floor(random() * SAMPLE_ENTRIES.length)];
      const scores = classifyWithLexicon(text);
      const entry = { id: randomUUID(), userId: user.id, text, status: 'classified', createdAt: at, classifiedAt: at };
      S.entries.push(entry);
      for (const [zoneId, score] of Object.entries(scores)) {
        S.entryTopicScores.push({ entryId: entry.id, zoneId, score: Math.round(score * 1000) / 1000 });
      }
      // the same two skips as adaptation.service.applyEntryScores
      for (const row of live) {
        if (row.isMuted || !scores[row.zoneId]) continue;
        row.weight = nextWeight(row.weight, scores[row.zoneId]);
        row.source = 'learned';
      }

      Object.assign(shown, { wasChosen: true, chosenAt: at, wasAnswered: true, entryId: entry.id });
      if (random() < 0.6) Object.assign(shown, { relevanceRating: random() < 0.68, ratedAt: at });
      written += 1;
    }
    remember(day);
  }

  store.save();

  const summary = [...live]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((w) => `${w.zoneId} ${w.weight.toFixed(2)}`)
    .join(', ');

  console.log(`
  account     ${EMAIL} / ${PASSWORD}  (name: Mia)
  days        ${DAYS} (${daysAgo(DAYS)} to ${daysAgo(1)}); today is left open
  entries     ${written}
  questions   ${S.promptsShown.length} (three a day)
  top zones   ${summary}
  zones       ${ZONE_IDS.length}

  Now run: npm start
`);
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
