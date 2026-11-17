/**
 * Which question was shown, why it was chosen, and what came of it.
 *
 * This is the measurement table of the study. `selectionReason` is the field
 * the whole experiment rests on:
 *
 *   top_three       chosen from the three highest weights — the adaptive case
 *   exploration     chosen from a quiet zone, to keep the profile from
 *                   collapsing onto three topics; still adaptive
 *   baseline_random drawn uniformly from the whole bank — the control
 *
 * Every participant receives both kinds, so each is compared against
 * themselves (a within-subject design). Exploration is deliberately a separate
 * value and not folded into the random case: it is produced by the model and
 * belongs on the adaptive side.
 */
import { randomUUID } from 'node:crypto';
import store from '../data/store.js';

export const SELECTION_REASONS = ['top_three', 'exploration', 'baseline_random'];

export function create({ userId, promptId, zoneId, selectionReason }) {
  const row = {
    id: randomUUID(),
    userId,
    promptId,
    zoneId,
    selectionReason,
    shownAt: new Date().toISOString(),
    wasAnswered: false,
    entryId: null,
    relevanceRating: null,
    ratedAt: null,
    explanationOpened: false,
  };
  store.state.promptsShown.push(row);
  store.save();
  return row;
}

export function findById(id) {
  return store.state.promptsShown.find((p) => p.id === id) ?? null;
}

export function listForUser(userId) {
  return store.state.promptsShown
    .filter((p) => p.userId === userId)
    .sort((a, b) => b.shownAt.localeCompare(a.shownAt));
}

/** The question shown to this participant on a given day, if any. */
export function findForDay(userId, day) {
  return (
    store.state.promptsShown.find((p) => p.userId === userId && p.shownAt.slice(0, 10) === day) ??
    null
  );
}

/** The zone asked about on the previous day — never asked again today. */
export function lastZoneBefore(userId, day) {
  const earlier = store.state.promptsShown
    .filter((p) => p.userId === userId && p.shownAt.slice(0, 10) < day)
    .sort((a, b) => b.shownAt.localeCompare(a.shownAt));
  return earlier[0]?.zoneId ?? null;
}

export function linkEntry(id, entryId) {
  const row = findById(id);
  if (!row) return null;
  row.wasAnswered = true;
  row.entryId = entryId;
  store.save();
  return row;
}

export function rate(id, relevant) {
  const row = findById(id);
  if (!row) return null;
  // A rating and its timestamp are one decision, not two: the database CHECK
  // constraint prompts_shown_rating_consistent requires both or neither.
  row.relevanceRating = relevant;
  row.ratedAt = new Date().toISOString();
  store.save();
  return row;
}

export function markExplanationOpened(id) {
  const row = findById(id);
  if (!row) return null;
  row.explanationOpened = true;
  store.save();
  return row;
}

export function removeAllForUser(userId) {
  store.state.promptsShown = store.state.promptsShown.filter((p) => p.userId !== userId);
  store.save();
}

export default {
  SELECTION_REASONS,
  create,
  findById,
  listForUser,
  findForDay,
  lastZoneBefore,
  linkEntry,
  rate,
  markExplanationOpened,
  removeAllForUser,
};
