/**
 * The topic profile: nine weights per account, plus two audit collections.
 *
 *   userTopicWeights — the live value of each zone, 0.00 to 1.00
 *   weightHistory    — one row per zone per day, which the trend chart reads
 *   weightChanges    — every change with its old and new value and its cause
 *
 * In PostgreSQL the two audit collections are filled by a trigger, so the
 * application cannot forget to write them. There is no trigger in a JSON file,
 * so `set()` below is the single place a weight may be changed and it writes
 * all three. Nothing outside this file touches the collections directly.
 */
import store from '../data/store.js';
import { ZONE_IDS } from '../data/zones.js';
import { toDay } from '../utils/dates.js';

/** Clamps to the 0..1 range and rounds to three decimals, as the CHECK does. */
function normalise(weight) {
  return Math.round(Math.min(1, Math.max(0, weight)) * 1000) / 1000;
}

export function listForUser(userId) {
  return store.state.userTopicWeights.filter((w) => w.userId === userId);
}

export function find(userId, zoneId) {
  return (
    store.state.userTopicWeights.find((w) => w.userId === userId && w.zoneId === zoneId) ?? null
  );
}

/** The weights as a plain `{ zoneId: value }` object, for the algorithms. */
export function asMap(userId) {
  const map = {};
  for (const row of listForUser(userId)) map[row.zoneId] = row.weight;
  return map;
}

/** The zones the participant has not muted, with their weights. */
export function activeForUser(userId) {
  return listForUser(userId).filter((w) => !w.isMuted);
}

/**
 * Creates or updates one weight and records the change.
 *
 * @param {string} userId
 * @param {string} zoneId
 * @param {{weight?: number, isMuted?: boolean, source: 'quiz'|'entry'|'manual'}} patch
 */
export function set(userId, zoneId, patch) {
  const now = new Date().toISOString();
  let row = find(userId, zoneId);
  const old = row ? { weight: row.weight, isMuted: row.isMuted } : { weight: null, isMuted: null };

  if (!row) {
    row = { userId, zoneId, weight: 0, isMuted: false, source: patch.source, updatedAt: now };
    store.state.userTopicWeights.push(row);
  }

  if (patch.weight !== undefined) row.weight = normalise(patch.weight);
  if (patch.isMuted !== undefined) row.isMuted = Boolean(patch.isMuted);
  row.source = patch.source;
  row.updatedAt = now;

  const changed = old.weight !== row.weight || old.isMuted !== row.isMuted;
  if (changed) {
    // --- what the PostgreSQL trigger record_weight_change() does ---
    store.state.weightChanges.push({
      id: store.nextId('weightChanges'),
      userId,
      zoneId,
      oldWeight: old.weight,
      newWeight: row.weight,
      oldMuted: old.isMuted,
      newMuted: row.isMuted,
      source: patch.source,
      changedAt: now,
    });
    writeHistory(userId, zoneId, row.weight);
  }

  store.save();
  return row;
}

/** One row per zone per day: a second write on the same day overwrites it. */
function writeHistory(userId, zoneId, weight, day = toDay()) {
  const existing = store.state.weightHistory.find(
    (h) => h.userId === userId && h.zoneId === zoneId && h.asOf === day,
  );
  if (existing) {
    existing.weight = weight;
    return;
  }
  store.state.weightHistory.push({ userId, zoneId, asOf: day, weight });
}

/** Creates the nine starting weights from the quiz answers. */
export function seedFromQuiz(userId, answers) {
  for (const zoneId of ZONE_IDS) {
    const answer = answers.find((a) => a.zoneId === zoneId);
    // weight = (answer - 1) / 4 maps the 1..5 scale onto 0.00..1.00
    const weight = answer ? (answer.value - 1) / 4 : 0.5;
    set(userId, zoneId, { weight, isMuted: false, source: 'quiz' });
  }
  return listForUser(userId);
}

/** The trend series of one zone, oldest first. */
export function historyForZone(userId, zoneId, fromDay) {
  return store.state.weightHistory
    .filter((h) => h.userId === userId && h.zoneId === zoneId && (!fromDay || h.asOf >= fromDay))
    .sort((a, b) => a.asOf.localeCompare(b.asOf));
}

/** The whole weight history of one account, oldest first. */
export function historyForUser(userId) {
  return store.state.weightHistory
    .filter((h) => h.userId === userId)
    .sort((a, b) => a.asOf.localeCompare(b.asOf) || a.zoneId.localeCompare(b.zoneId));
}

export function changesForUser(userId) {
  return store.state.weightChanges
    .filter((c) => c.userId === userId)
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt));
}

export function removeAllForUser(userId) {
  const s = store.state;
  s.userTopicWeights = s.userTopicWeights.filter((w) => w.userId !== userId);
  s.weightHistory = s.weightHistory.filter((h) => h.userId !== userId);
  s.weightChanges = s.weightChanges.filter((c) => c.userId !== userId);
  store.save();
}

export default {
  listForUser,
  find,
  asMap,
  activeForUser,
  set,
  seedFromQuiz,
  historyForZone,
  historyForUser,
  changesForUser,
  removeAllForUser,
};
