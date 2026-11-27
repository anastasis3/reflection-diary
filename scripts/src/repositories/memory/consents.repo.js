/**
 * Consents — memory driver.
 *
 * Two purposes: `study` and `ai_processing`. Withdrawal is a timestamp on the
 * row, never a deletion; giving consent again adds a new row, as in the
 * database (one active row per purpose).
 */
import store from '../../data/store.js';

/** The latest row per purpose. */
export async function listForUser(userId) {
  const latest = new Map();
  for (const c of store.state.consents.filter((r) => r.userId === userId)) latest.set(c.purpose, c);
  return [...latest.values()];
}

export async function find(userId, purpose) {
  const rows = store.state.consents.filter((c) => c.userId === userId && c.purpose === purpose);
  return rows.at(-1) ?? null;
}

export async function grant(userId, purpose, textVersion = 'v1.0') {
  const current = await find(userId, purpose);
  if (current && !current.withdrawnAt) return current;
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

export async function withdraw(userId, purpose) {
  const consent = await find(userId, purpose);
  if (!consent || consent.withdrawnAt) return consent;
  consent.withdrawnAt = new Date().toISOString();
  store.save();
  return consent;
}

export async function isActive(userId, purpose) {
  const consent = await find(userId, purpose);
  return Boolean(consent && !consent.withdrawnAt);
}

export async function removeAllForUser(userId) {
  store.state.consents = store.state.consents.filter((c) => c.userId !== userId);
  store.save();
}

export default { listForUser, find, grant, withdraw, isActive, removeAllForUser };
