/**
 * Diary entries and the classifier's output for them.
 *
 * An entry has a status, because saving the text and understanding it are two
 * separate steps that can fail separately:
 *
 *   pending               saved, not yet analysed
 *   classified            analysed, nine topic scores exist
 *   classification_failed saved and kept, but no scores and no profile change
 *
 * The third state is a documented product state (NFR-2, screen S-04b), not an
 * error to be hidden: the entry is never lost because the analysis failed.
 */
import { randomUUID } from 'node:crypto';
import store from '../data/store.js';

export function create({ userId, text }) {
  const entry = {
    id: randomUUID(),
    userId,
    text,
    status: 'pending',
    createdAt: new Date().toISOString(),
    classifiedAt: null,
  };
  store.state.entries.push(entry);
  store.save();
  return entry;
}

export function findById(id) {
  return store.state.entries.find((e) => e.id === id) ?? null;
}

export function listForUser(userId, { zoneId, from, to } = {}) {
  let rows = store.state.entries.filter((e) => e.userId === userId);

  if (from) rows = rows.filter((e) => e.createdAt.slice(0, 10) >= from);
  if (to) rows = rows.filter((e) => e.createdAt.slice(0, 10) <= to);

  if (zoneId) {
    // "an entry about X" means the classifier gave X the highest score.
    rows = rows.filter((e) => topZoneOf(e.id) === zoneId);
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Marks an entry classified and stores the nine scores in one step. */
export function saveScores(entryId, scores) {
  const entry = findById(entryId);
  if (!entry) return null;

  // status and classifiedAt are set together — the database CHECK constraint
  // entries_classified_has_time rejects one without the other.
  entry.status = 'classified';
  entry.classifiedAt = new Date().toISOString();

  store.state.entryTopicScores = store.state.entryTopicScores.filter(
    (s) => s.entryId !== entryId,
  );
  for (const [zoneId, score] of Object.entries(scores)) {
    store.state.entryTopicScores.push({
      entryId,
      zoneId,
      score: Math.round(score * 1000) / 1000,
    });
  }
  store.save();
  return entry;
}

export function markFailed(entryId) {
  const entry = findById(entryId);
  if (!entry) return null;
  entry.status = 'classification_failed';
  entry.classifiedAt = null;
  store.save();
  return entry;
}

export function scoresFor(entryId) {
  const map = {};
  for (const row of store.state.entryTopicScores.filter((s) => s.entryId === entryId)) {
    map[row.zoneId] = row.score;
  }
  return map;
}

/** The zone with the highest score, or null when the entry was never classified. */
export function topZoneOf(entryId) {
  const scores = Object.entries(scoresFor(entryId));
  if (scores.length === 0) return null;
  return scores.sort((a, b) => b[1] - a[1])[0][0];
}

export function countForUser(userId) {
  return store.state.entries.filter((e) => e.userId === userId).length;
}

export function removeAllForUser(userId) {
  const ids = new Set(
    store.state.entries.filter((e) => e.userId === userId).map((e) => e.id),
  );
  store.state.entries = store.state.entries.filter((e) => e.userId !== userId);
  store.state.entryTopicScores = store.state.entryTopicScores.filter(
    (s) => !ids.has(s.entryId),
  );
  store.save();
}

export default {
  create,
  findById,
  listForUser,
  saveScores,
  markFailed,
  scoresFor,
  topZoneOf,
  countForUser,
  removeAllForUser,
};
