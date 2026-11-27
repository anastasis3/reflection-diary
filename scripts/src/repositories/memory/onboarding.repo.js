/**
 * Onboarding answers — memory driver. (userId, zoneId) is the key, so
 * answering a statement twice overwrites it.
 */
import store from '../../data/store.js';

export async function listForUser(userId) {
  return store.state.onboardingAnswers.filter((a) => a.userId === userId);
}

export async function upsert(userId, zoneId, value) {
  const answeredAt = new Date().toISOString();
  const existing = store.state.onboardingAnswers.find(
    (a) => a.userId === userId && a.zoneId === zoneId,
  );
  if (existing) {
    Object.assign(existing, { value, answeredAt });
    store.save();
    return existing;
  }
  const answer = { userId, zoneId, value, answeredAt };
  store.state.onboardingAnswers.push(answer);
  store.save();
  return answer;
}

export async function removeAllForUser(userId) {
  store.state.onboardingAnswers = store.state.onboardingAnswers.filter((a) => a.userId !== userId);
  store.save();
}

export default { listForUser, upsert, removeAllForUser };
