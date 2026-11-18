/**
 * Topic weights — memory driver.
 *
 *   userTopicWeights — the live value of each zone, 0.00 to 1.00
 *   weightHistory    — one row per zone per day, for the trend chart
 *   weightChanges    — every change with its old and new value and its cause
 *
 * In PostgreSQL the two audit collections are written by the trigger
 * record_weight_change(). A JSON file has no triggers, so `set()` is the one
 * place a weight may change here, and it does the trigger's work too.
 *
 * source: quiz | learned | manual | choice — the same values the database
 * CHECK constraint allows.
 */
import store from '../../data/store.js';
import { ZONE_IDS } from '../../data/zones.js';
import { toDay } from '../../utils/dates.js';

const round3 = (w) => Math.round(Math.min(1, Math.max(0, w)) * 1000) / 1000;
const copy = (rows) => rows.map((r) => ({ ...r }));

export async function listForUser(userId) {
  return copy(store.state.userTopicWeights.filter((w) => w.userId === userId));
}

export async function find(userId, zoneId) {
  const row = store.state.userTopicWeights.find((w) => w.userId === userId && w.zoneId === zoneId);
  return row ? { ...row } : null;
}

/**
 * Creates or updates one weight and records the change.
 * @param {{weight?: number, isMuted?: boolean, source: 'quiz'|'learned'|'manual'|'choice'}} patch
 */
export async function set(userId, zoneId, patch) {
  const now = new Date().toISOString();
  let row = store.state.userTopicWeights.find((w) => w.userId === userId && w.zoneId === zoneId);
  const old = row ? { weight: row.weight, isMuted: row.isMuted } : { weight: null, isMuted: null };

  if (!row) {
    row = { userId, zoneId, weight: 0, isMuted: false, source: patch.source, updatedAt: now };
    store.state.userTopicWeights.push(row);
  }
  if (patch.weight !== undefined) row.weight = round3(patch.weight);
  if (patch.isMuted !== undefined) row.isMuted = Boolean(patch.isMuted);
  row.source = patch.source;
  row.updatedAt = now;

  if (old.weight !== row.weight || old.isMuted !== row.isMuted) {
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
    const day = toDay();
    const h = store.state.weightHistory.find(
      (x) => x.userId === userId && x.zoneId === zoneId && x.asOf === day,
    );
    if (h) h.weight = row.weight;
    else store.state.weightHistory.push({ userId, zoneId, asOf: day, weight: row.weight });
  }

  store.save();
  return { ...row };
}

/** The nine starting weights: weight = (answer - 1) / 4. */
export async function seedFromQuiz(userId, answers) {
  for (const zoneId of ZONE_IDS) {
    const answer = answers.find((a) => a.zoneId === zoneId);
    await set(userId, zoneId, {
      weight: answer ? (answer.value - 1) / 4 : 0.5,
      isMuted: false,
      source: 'quiz',
    });
  }
  return listForUser(userId);
}

/** One zone's trend, oldest first. */
export async function historyForZone(userId, zoneId, fromDay) {
  return copy(
    store.state.weightHistory
      .filter((h) => h.userId === userId && h.zoneId === zoneId && (!fromDay || h.asOf >= fromDay))
      .sort((a, b) => a.asOf.localeCompare(b.asOf)),
  );
}

export async function historyForUser(userId) {
  return copy(
    store.state.weightHistory
      .filter((h) => h.userId === userId)
      .sort((a, b) => a.asOf.localeCompare(b.asOf) || a.zoneId.localeCompare(b.zoneId)),
  );
}

export async function changesForUser(userId) {
  return copy(
    store.state.weightChanges
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt) || b.id - a.id),
  );
}

export async function removeAllForUser(userId) {
  const s = store.state;
  s.userTopicWeights = s.userTopicWeights.filter((w) => w.userId !== userId);
  s.weightHistory = s.weightHistory.filter((h) => h.userId !== userId);
  s.weightChanges = s.weightChanges.filter((c) => c.userId !== userId);
  store.save();
}

export default {
  listForUser, find, set, seedFromQuiz, historyForZone, historyForUser, changesForUser, removeAllForUser,
};
