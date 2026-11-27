/**
 * Choosing the three questions of the day.
 *
 * Each day the diary offers three questions on three different zones, and the
 * participant picks the one that fits. The three are chosen like this:
 *
 *   slot A  one of the three highest-weighted zones, more often the higher
 *           its weight                                       → top_three
 *   slot B  another of the top three — or, with probability
 *           EXPLORATION_RATE (0.15), one of the quietest zones → top_three /
 *                                                               exploration
 *   slot C  a zone drawn uniformly from the rest: the control → baseline_random
 *
 * Muted zones are never offered. The three are then shuffled into slots 1-3
 * and look identical on screen, so the random one cannot be spotted.
 *
 * What the study measures from this: which question gets picked first. If
 * the participant picked blindly, two picks in three would land on an
 * adaptive question (A or B). Picking them more often than that is evidence
 * that the selection matches what the person wants to write about.
 *
 * Note for the methodology: slot C is drawn from the zones *not* already in
 * A and B, so the control is "a random other zone", not "any zone". That is
 * needed to keep the three zones different, and it biases the control very
 * slightly away from the top zones.
 *
 * `chooseThree` takes everything as arguments, including the source of
 * randomness, so a test can pass a fake `random` and get a known result.
 */
import config from '../config/index.js';
import { promptsForZone, getPrompt } from '../data/prompts.js';
import ApiError from '../utils/ApiError.js';
import { weightsRepo, promptsShownRepo, entriesRepo, consentsRepo } from '../repositories/index.js';
import { generateQuestions } from './question.generator.js';
import { getZone, ZONE_IDS } from '../data/zones.js';
import { toDay, daysAgo } from '../utils/dates.js';

/** Picks from `list` with probability proportional to weight. */
function weightedPick(list, random) {
  const total = list.reduce((sum, w) => sum + w.weight, 0);
  if (total <= 0) return list[Math.floor(random() * list.length)];
  let r = random() * total;
  for (const w of list) {
    r -= w.weight;
    if (r <= 0) return w;
  }
  return list[list.length - 1];
}

/**
 * The pure decision. No database, no clock, no global randomness.
 *
 * @param {object} input
 * @param {Array<{zoneId: string, weight: number, isMuted: boolean}>} input.weights
 * @param {() => number} [input.random] source of randomness, [0, 1)
 * @param {object} [input.settings] overrides for explorationRate / topN
 * @returns {Array<{zoneId: string, reason: string, slot: number}>} three, shuffled
 */
export function chooseThree({ weights, random = Math.random, settings } = {}) {
  const { explorationRate, topN } = { ...config.adaptation, ...settings };

  const live = weights.filter((w) => !w.isMuted).sort((a, b) => b.weight - a.weight);
  if (live.length < 3) {
    throw ApiError.conflict(
      'NO_ACTIVE_ZONES',
      'Fewer than three zones are on, so there is nothing to choose between. Turn some back on in Profile.',
    );
  }

  const top = live.slice(0, topN);
  const quiet = live.slice(topN);

  const a = weightedPick(top, random);

  let b;
  let bReason = 'top_three';
  if (quiet.length > 0 && random() < explorationRate) {
    // one of the (up to) three quietest zones
    const tail = quiet.slice(-3);
    b = tail[Math.floor(random() * tail.length)];
    bReason = 'exploration';
  } else {
    b = weightedPick(top.filter((w) => w.zoneId !== a.zoneId), random);
  }

  const rest = live.filter((w) => w.zoneId !== a.zoneId && w.zoneId !== b.zoneId);
  const c = rest[Math.floor(random() * rest.length)];

  const three = [
    { zoneId: a.zoneId, reason: 'top_three' },
    { zoneId: b.zoneId, reason: bReason },
    { zoneId: c.zoneId, reason: 'baseline_random' },
  ];

  // Fisher–Yates shuffle into screen positions
  for (let i = three.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [three[i], three[j]] = [three[j], three[i]];
  }
  return three.map((q, i) => ({ ...q, slot: i + 1 }));
}

/** Picks one active question from a zone. */
export function choosePrompt(zoneId, random = Math.random) {
  const candidates = promptsForZone(zoneId);
  if (candidates.length === 0) {
    throw ApiError.notFound(`No question is available for the zone "${zoneId}".`);
  }
  return candidates[Math.floor(random() * candidates.length)];
}

/**
 * The three questions of today for one participant.
 *
 * Created on the first request of the day and stored; every later request
 * that day — a reload, a second device — returns the same three, so nobody
 * can re-roll the questions and quietly spoil the measurement.
 */
export async function todaysQuestions(userId, { random = Math.random, day = toDay() } = {}) {
  const existing = await promptsShownRepo.listForDay(userId, day);
  if (existing.length > 0) return { day, questions: existing, isNew: false };

  const weights = await weightsRepo.listForUser(userId);
  if (weights.length === 0) {
    throw ApiError.conflict(
      'ONBOARDING_INCOMPLETE',
      'Finish the short quiz first — it sets the starting profile the questions are chosen from.',
    );
  }

    const three = chooseThree({ weights, random }).map((q) => ({
    zoneId: q.zoneId,
    selectionReason: q.reason,
    slot: q.slot,
    promptId: choosePrompt(q.zoneId, random).id, // the bank question, and the fallback
    promptText: null,
    textSource: 'bank',
  }));

  await personalise(userId, three);
  const questions = await promptsShownRepo.createDay(userId, day, three);

  return { day, questions, isNew: true };
}

/**
 * QUESTIONS=claude: Claude rewrites the two ADAPTIVE questions from the
 * participant's recent entries. The random control stays a bank question.
 * Any failure leaves the bank questions in place.
 */
async function personalise(userId, three) {
  if (config.questions !== 'claude') return;
  if (!(await consentsRepo.isActive(userId, 'ai_processing'))) return;
  const adaptive = three.filter((q) => q.selectionReason !== 'baseline_random');
  try {
    const recent = (await entriesRepo.listForUser(userId, { from: daysAgo(13) }))
      .slice(0, 6)
      .map((e) => ({ day: e.createdAt.slice(0, 10), text: e.text }));
    const written = await generateQuestions(adaptive.map((q) => q.zoneId), recent);
    for (const q of adaptive) {
      if (written[q.zoneId]) Object.assign(q, { promptText: written[q.zoneId], textSource: 'generated' });
    }
  } catch (error) {
    console.error(`Personal questions not written, bank questions used: ${error.message}`);
  }
}

/** The three zones the diary is currently asking about, highest first. */
export async function topZones(userId, n = config.adaptation.topN) {
  const weights = await weightsRepo.listForUser(userId);
  return weights
    .filter((w) => !w.isMuted)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n)
    .map((w) => w.zoneId);
}

/**
 * The text behind "Why this question?".
 *
 * It states the real reason, including when the reason was chance. Telling a
 * participant that a randomly drawn question was chosen for them would make
 * the explanation a lie and the measurement worthless. (The reason is shown
 * only when asked for, after the choice — never on the three cards.)
 */
export async function explain(userId, shown) {
  const weight = (await weightsRepo.find(userId, shown.zoneId))?.weight ?? 0;
  const rank = (await topZones(userId, ZONE_IDS.length)).indexOf(shown.zoneId) + 1;
  const label = getZone(shown.zoneId)?.name ?? shown.zoneId;

  const text = {
    top_three: `${label} is among your most relevant zones right now (weight ${weight.toFixed(2)}).`,
    exploration: `${label} is one of your quieter zones right now (weight ${weight.toFixed(2)}). The diary offers one now and then, so that a topic that is becoming important is not missed.`,
    baseline_random:
      'This one was drawn at random rather than from your profile. One of the three questions each day is, so that the diary can tell whether its own choices suit you better.',
  }[shown.selectionReason];

  return { reason: shown.selectionReason, weight, rank, text };
}

/** A shown-question row as the browser may see it — without the reason. */
export function presentQuestion(shown) {
  return {
    promptShownId: shown.id,
    slot: shown.slot,
    day: shown.shownOn,
    text: shown.promptText ?? getPrompt(shown.promptId)?.text ?? null,
    zone: getZone(shown.zoneId),
    wasChosen: shown.wasChosen,
    wasAnswered: shown.wasAnswered,
    entryId: shown.entryId,
    relevanceRating: shown.relevanceRating,
    // selectionReason is deliberately absent. A participant who could see
    // which question was the random one would choose and rate differently,
    // and the comparison the study rests on would be worthless.
  };
}

export default { chooseThree, choosePrompt, todaysQuestions, topZones, explain, presentQuestion };
