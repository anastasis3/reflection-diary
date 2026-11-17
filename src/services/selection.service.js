/**
 * Choosing the question of the day.
 *
 * The rule, in order:
 *
 *   1. With probability RANDOM_QUESTION_SHARE (0.33 by default) the question
 *      is drawn uniformly from the whole bank. This is the control condition
 *      of the study. The participant is never told which kind they received,
 *      and the coin is flipped at selection time, so neither they nor the
 *      interface can anticipate it.
 *   2. Otherwise, with probability EXPLORATION_RATE (0.15), a quiet zone is
 *      chosen — the lowest-weighted zone that is not muted. Without this the
 *      profile would narrow onto the same three topics for ever and could
 *      never discover that something else has become important.
 *   3. Otherwise, one of the three highest-weighted zones, at random.
 *
 * On top of that: a muted zone is never chosen, and the zone asked about
 * yesterday is excluded, so the same topic never comes two days running.
 *
 * `chooseZone` takes everything it needs as arguments, including the source of
 * randomness. That is what makes the rule testable: a test passes a fake
 * `random` and gets a predictable branch, instead of running the function a
 * thousand times and hoping.
 */
import config from '../config/index.js';
import { promptsForZone } from '../data/prompts.js';
import ApiError from '../utils/ApiError.js';
import * as weightsRepo from '../repositories/weights.repo.js';
import * as promptsShownRepo from '../repositories/promptsShown.repo.js';
import { ZONE_IDS } from '../data/zones.js';
import { toDay } from '../utils/dates.js';

/**
 * The pure decision. No database, no clock, no global randomness.
 *
 * @param {object}   input
 * @param {Array<{zoneId: string, weight: number, isMuted: boolean}>} input.weights
 * @param {string|null} [input.excludeZone] zone asked about yesterday
 * @param {() => number} [input.random] source of randomness, [0, 1)
 * @param {object}   [input.settings] overrides for the three parameters
 * @returns {{zoneId: string, reason: 'top_three'|'exploration'|'baseline_random'}}
 */
export function chooseZone({ weights, excludeZone = null, random = Math.random, settings } = {}) {
  const { randomQuestionShare, explorationRate, topN } = { ...config.adaptation, ...settings };

  const available = weights.filter((w) => !w.isMuted && w.zoneId !== excludeZone);

  // If excluding yesterday's zone leaves nothing (everything else is muted),
  // allow it back rather than failing to ask a question at all.
  const pool = available.length > 0 ? available : weights.filter((w) => !w.isMuted);

  if (pool.length === 0) {
    throw ApiError.conflict(
      'NO_ACTIVE_ZONES',
      'All your zones are muted, so there is nothing to ask about. Turn at least three back on in Profile.',
    );
  }

  const pick = (list) => list[Math.floor(random() * list.length)];

  // 1. the control condition
  if (random() < randomQuestionShare) {
    return { zoneId: pick(pool).zoneId, reason: 'baseline_random' };
  }

  const ranked = [...pool].sort((a, b) => b.weight - a.weight);

  // 2. exploration: the quietest zone still in play
  if (random() < explorationRate) {
    const quietest = ranked[ranked.length - 1];
    return { zoneId: quietest.zoneId, reason: 'exploration' };
  }

  // 3. the adaptive case
  return { zoneId: pick(ranked.slice(0, topN)).zoneId, reason: 'top_three' };
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
 * The question of the day for one participant.
 *
 * One question per calendar day: asking again on the same day returns the same
 * question, so a reload or a second device cannot hand out a second one and
 * quietly spoil the measurement.
 */
export function questionOfTheDay(userId, { random = Math.random, day = toDay() } = {}) {
  const existing = promptsShownRepo.findForDay(userId, day);
  if (existing) return { shown: existing, isNew: false };

  const weights = weightsRepo.listForUser(userId);
  if (weights.length === 0) {
    throw ApiError.conflict(
      'ONBOARDING_INCOMPLETE',
      'Finish the short quiz first — it sets the starting profile the questions are chosen from.',
    );
  }

  const excludeZone = promptsShownRepo.lastZoneBefore(userId, day);
  const { zoneId, reason } = chooseZone({ weights, excludeZone, random });
  const prompt = choosePrompt(zoneId, random);

  const shown = promptsShownRepo.create({
    userId,
    promptId: prompt.id,
    zoneId,
    selectionReason: reason,
  });
  return { shown, isNew: true };
}

/** The three zones the diary is currently asking about, highest first. */
export function topZones(userId, n = config.adaptation.topN) {
  return weightsRepo
    .activeForUser(userId)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n)
    .map((w) => w.zoneId);
}

/**
 * The text behind "Why this question?" on screen S-03a.
 *
 * It states the real reason, including when the reason was chance. Telling a
 * participant that a randomly drawn question was chosen for them would make
 * the explanation a lie and the study's relevance measurement worthless.
 */
export function explain(userId, shown) {
  const weight = weightsRepo.find(userId, shown.zoneId)?.weight ?? 0;
  const rank = topZones(userId, ZONE_IDS.length).indexOf(shown.zoneId) + 1;

  switch (shown.selectionReason) {
    case 'top_three':
      return {
        reason: shown.selectionReason,
        weight,
        rank,
        text: `This zone is among your most relevant right now (weight ${weight.toFixed(2)}). Yesterday's question was about a different zone, which is excluded today.`,
      };
    case 'exploration':
      return {
        reason: shown.selectionReason,
        weight,
        rank,
        text: `This is one of your quieter zones (weight ${weight.toFixed(2)}). The diary asks about one from time to time, so that a topic that is becoming important to you is not missed.`,
      };
    default:
      return {
        reason: shown.selectionReason,
        weight,
        rank,
        text: 'This question was drawn at random rather than from your profile. The diary does this for about one question in three, so that it can tell whether the chosen ones actually suit you better.',
      };
  }
}

export default { chooseZone, choosePrompt, questionOfTheDay, topZones, explain };
