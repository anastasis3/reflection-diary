/**
 * What the participant does with the three questions of the day:
 * see them, pick one, ask why it was offered, rate it after answering.
 *
 * Rules enforced here (and, for the Supabase driver, again by CHECK
 * constraints in the database):
 *
 *   - only today's questions can be picked or answered;
 *   - picking moves the zone up once (CHOICE_BOOST), not on every click;
 *   - a question is rated only after it has been answered — the pick already
 *     says which of the three appealed, and a rating given before writing
 *     would be a first impression rather than a judgement.
 */
import ApiError from '../utils/ApiError.js';
import { promptsShownRepo } from '../repositories/index.js';
import { getZone } from '../data/zones.js';
import { toDay } from '../utils/dates.js';
import { todaysQuestions, explain, presentQuestion } from './selection.service.js';
import { applyChoiceBoost } from './adaptation.service.js';

/** The row, if it belongs to this participant; otherwise 404. */
export async function ownQuestion(userId, promptShownId) {
  const shown = await promptsShownRepo.findById(promptShownId);
  if (!shown || shown.userId !== userId) {
    throw ApiError.notFound('That question does not belong to your account.');
  }
  return shown;
}

/** GET /api/prompts/today */
export async function today(userId, options) {
  const { day, questions, isNew } = await todaysQuestions(userId, options);
  return {
    day,
    questions: questions.map(presentQuestion),
    answeredCount: questions.filter((q) => q.wasAnswered).length,
    isNew,
  };
}

/**
 * POST /api/prompts/:id/choose — the participant opened this one to write.
 * Returns the question and, the first time only, how its zone moved.
 */
export async function choose(userId, promptShownId) {
  const shown = await ownQuestion(userId, promptShownId);
  if (shown.shownOn !== toDay()) {
    throw ApiError.conflict('QUESTION_EXPIRED', 'That question was for another day.');
  }
  const { row, first } = await promptsShownRepo.choose(shown.id);
  const moved = first ? await applyChoiceBoost(userId, row.zoneId) : null;
  return {
    question: presentQuestion(row),
    boost: moved ? { zone: getZone(moved.zoneId), from: moved.from, to: moved.to } : null,
  };
}

/** GET /api/prompts/:id/explanation — "Why this question?" */
export async function explanation(userId, promptShownId) {
  const shown = await ownQuestion(userId, promptShownId);
  await promptsShownRepo.markExplanationOpened(shown.id);
  const explained = await explain(userId, shown);
  return { zone: getZone(shown.zoneId), weight: explained.weight, text: explained.text };
}

/** POST /api/prompts/:id/rating — "was this question relevant to you?" */
export async function rate(userId, promptShownId, relevant) {
  const shown = await ownQuestion(userId, promptShownId);
  if (!shown.wasAnswered) {
    throw ApiError.conflict('NOT_ANSWERED', 'Answer the question first, then rate it.');
  }
  const updated = await promptsShownRepo.rate(shown.id, relevant);
  return {
    promptShownId: updated.id,
    relevanceRating: updated.relevanceRating,
    ratedAt: updated.ratedAt,
  };
}

export default { ownQuestion, today, choose, explanation, rate };
