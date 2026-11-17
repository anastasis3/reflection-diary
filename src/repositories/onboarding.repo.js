/**
 * The answers to the nine onboarding statements.
 *
 * Each answer is saved the moment it is given, not at the end of the quiz, so
 * that screen S-02 can resume where the participant stopped. The pair
 * (userId, zoneId) is the primary key, so answering the same statement twice
 * overwrites rather than duplicates.
 */
import store from '../data/store.js';

export function listForUser(userId) {
  return store.state.onboardingAnswers.filter((a) => a.userId === userId);
}

export function upsert(userId, zoneId, value) {
  const existing = store.state.onboardingAnswers.find(
    (a) => a.userId === userId && a.zoneId === zoneId,
  );
  const answeredAt = new Date().toISOString();
  if (existing) {
    existing.value = value;
    existing.answeredAt = answeredAt;
    store.save();
    return existing;
  }
  const answer = { userId, zoneId, value, answeredAt };
  store.state.onboardingAnswers.push(answer);
  store.save();
  return answer;
}

export function removeAllForUser(userId) {
  store.state.onboardingAnswers = store.state.onboardingAnswers.filter(
    (a) => a.userId !== userId,
  );
  store.save();
}

export default { listForUser, upsert, removeAllForUser };
