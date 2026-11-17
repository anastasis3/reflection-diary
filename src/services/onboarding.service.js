/**
 * The nine-statement quiz that sets the starting profile (screen S-02).
 *
 * Each answer is saved as it is given, so the screen can be left and resumed.
 * Completing the quiz converts the answers into the nine starting weights:
 *
 *     weight = (answer - 1) / 4
 *
 * which maps the 1..5 scale onto 0.00..1.00. From that moment the weights
 * belong to the adaptation model and the quiz is never used again.
 */
import ApiError from '../utils/ApiError.js';
import { ONBOARDING_STATEMENTS, ZONE_IDS } from '../data/zones.js';
import * as onboardingRepo from '../repositories/onboarding.repo.js';
import * as profilesRepo from '../repositories/profiles.repo.js';
import * as weightsRepo from '../repositories/weights.repo.js';

/** The questionnaire plus how far this participant has got. */
export function getState(userId) {
  const answers = onboardingRepo.listForUser(userId);
  const profile = profilesRepo.findById(userId);
  const answeredFor = new Set(answers.map((a) => a.zoneId));

  return {
    statements: ONBOARDING_STATEMENTS.map((s, index) => ({
      step: index + 1,
      zoneId: s.zoneId,
      text: s.text,
      value: answers.find((a) => a.zoneId === s.zoneId)?.value ?? null,
    })),
    total: ONBOARDING_STATEMENTS.length,
    answered: answers.length,
    // Where to resume: the first statement with no answer.
    nextStep:
      ONBOARDING_STATEMENTS.findIndex((s) => !answeredFor.has(s.zoneId)) + 1 || null,
    startedAt: profile?.onboardingStartedAt ?? null,
    completedAt: profile?.onboardingCompletedAt ?? null,
    completed: Boolean(profile?.onboardingCompletedAt),
  };
}

export function saveAnswer(userId, zoneId, value) {
  if (!ZONE_IDS.includes(zoneId)) {
    throw ApiError.badRequest(`"${zoneId}" is not one of the nine zones.`);
  }
  onboardingRepo.upsert(userId, zoneId, value);
  return getState(userId);
}

/**
 * Turns the answers into the starting weights.
 *
 * Refuses while any statement is unanswered: a profile built from a partial
 * quiz would start the adaptation from a guess, and the participant would have
 * no way to tell which numbers were theirs.
 */
export function complete(userId) {
  const answers = onboardingRepo.listForUser(userId);
  if (answers.length < ONBOARDING_STATEMENTS.length) {
    const missing = ONBOARDING_STATEMENTS.filter(
      (s) => !answers.some((a) => a.zoneId === s.zoneId),
    ).map((s) => s.zoneId);
    throw ApiError.badRequest('Answer all nine statements first.', { missing });
  }

  weightsRepo.seedFromQuiz(userId, answers);
  profilesRepo.markOnboardingComplete(userId);

  return {
    ...getState(userId),
    weights: weightsRepo.listForUser(userId),
  };
}

export default { getState, saveAnswer, complete };
