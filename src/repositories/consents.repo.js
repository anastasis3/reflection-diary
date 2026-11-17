/**
 * Consents.
 *
 * Two purposes are recorded separately: `study` (taking part at all) and
 * `ai_processing` (sending the text of an entry to the model). Withdrawal is a
 * timestamp on the existing row rather than a deletion, because the study has
 * to be able to say when processing stopped, and the participant has to be
 * able to see it on the Settings screen.
 */
import store from '../data/store.js';

export const PURPOSES = ['study', 'ai_processing'];

export function listForUser(userId) {
  return store.state.consents.filter((c) => c.userId === userId);
}

export function find(userId, purpose) {
  return store.state.consents.find((c) => c.userId === userId && c.purpose === purpose) ?? null;
}

export function grant(userId, purpose, textVersion = 'v1.0') {
  const existing = find(userId, purpose);
  if (existing) {
    existing.withdrawnAt = null;
    existing.grantedAt = new Date().toISOString();
    store.save();
    return existing;
  }
  const consent = {
    id: store.nextId('consents'),
    userId,
    purpose,
    textVersion,
    grantedAt: new Date().toISOString(),
    withdrawnAt: null,
  };
  store.state.consents.push(consent);
  store.save();
  return consent;
}

export function withdraw(userId, purpose) {
  const consent = find(userId, purpose);
  if (!consent || consent.withdrawnAt) return consent;
  consent.withdrawnAt = new Date().toISOString();
  store.save();
  return consent;
}

/** True when the participant currently allows this kind of processing. */
export function isActive(userId, purpose) {
  const consent = find(userId, purpose);
  return Boolean(consent && !consent.withdrawnAt);
}

export function removeAllForUser(userId) {
  store.state.consents = store.state.consents.filter((c) => c.userId !== userId);
  store.save();
}

export default { PURPOSES, listForUser, find, grant, withdraw, isActive, removeAllForUser };
