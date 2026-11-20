/**
 * Entries and their classifier scores — memory driver.
 *
 *   saved                  stored, not yet analysed
 *   classified             analysed, scores exist
 *   classification_failed  saved and kept, no scores, no profile change
 *
 * Every read returns the entry with `scores` ({ zoneId: score }),
 * `topZoneId` (highest score, or null) and `question` (the question it
 * answers, or null) already attached, so callers never need a second lookup.
 * The PostgreSQL driver returns the same shape from one query.
 */
import { randomUUID } from 'node:crypto';
import store from '../../data/store.js';

function scoresOf(entryId) {
  const map = {};
  for (const s of store.state.entryTopicScores) if (s.entryId === entryId) map[s.zoneId] = s.score;
  return map;
}

function topOf(scores) {
  const list = Object.entries(scores).filter(([, v]) => v > 0);
  if (list.length === 0) return null;
  return list.sort((a, b) => b[1] - a[1])[0][0];
}

function hydrate(entry) {
  if (!entry) return null;
  const scores = scoresOf(entry.id);
  const shown = store.state.promptsShown.find((p) => p.entryId === entry.id);
  return {
    ...entry,
    scores,
    topZoneId: topOf(scores),
    question: shown
      ? { promptShownId: shown.id, promptId: shown.promptId, promptText: shown.promptText ?? null, zoneId: shown.zoneId,
          relevanceRating: shown.relevanceRating }
      : null,
  };
}

export async function create({ userId, text }) {
  const entry = {
    id: randomUUID(),
    userId,
    text,
    status: 'saved',
    createdAt: new Date().toISOString(),
    classifiedAt: null,
  };
  store.state.entries.push(entry);
  store.save();
  return hydrate(entry);
}

export async function findById(id) {
  return hydrate(store.state.entries.find((e) => e.id === id));
}

export async function listForUser(userId, { zoneId, from, to } = {}) {
  let rows = store.state.entries.filter((e) => e.userId === userId);
  if (from) rows = rows.filter((e) => e.createdAt.slice(0, 10) >= from);
  if (to) rows = rows.filter((e) => e.createdAt.slice(0, 10) <= to);
  let out = rows.map(hydrate);
  // "an entry about X" = the classifier gave X the highest score
  if (zoneId) out = out.filter((e) => e.topZoneId === zoneId);
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Marks the entry classified and stores its scores in one step. */
export async function saveScores(entryId, scores) {
  const entry = store.state.entries.find((e) => e.id === entryId);
  if (!entry) return null;
  // status and classifiedAt change together (CHECK entries_classified_has_time)
  entry.status = 'classified';
  entry.classifiedAt = new Date().toISOString();
  store.state.entryTopicScores = store.state.entryTopicScores.filter((s) => s.entryId !== entryId);
  for (const [zoneId, score] of Object.entries(scores)) {
    store.state.entryTopicScores.push({ entryId, zoneId, score: Math.round(score * 1000) / 1000 });
  }
  store.save();
  return hydrate(entry);
}

export async function markFailed(entryId) {
  const entry = store.state.entries.find((e) => e.id === entryId);
  if (!entry) return null;
  entry.status = 'classification_failed';
  entry.classifiedAt = null;
  store.save();
  return hydrate(entry);
}

export async function countForUser(userId) {
  return store.state.entries.filter((e) => e.userId === userId).length;
}

export async function removeAllForUser(userId) {
  const ids = new Set(store.state.entries.filter((e) => e.userId === userId).map((e) => e.id));
  store.state.entries = store.state.entries.filter((e) => e.userId !== userId);
  store.state.entryTopicScores = store.state.entryTopicScores.filter((s) => !ids.has(s.entryId));
  store.save();
}

export default { create, findById, listForUser, saveScores, markFailed, countForUser, removeAllForUser };
