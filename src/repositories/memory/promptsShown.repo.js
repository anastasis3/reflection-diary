/**
 * Questions shown — memory driver. The measurement table of the study.
 *
 * Three rows per participant per day (slots 1-3, three different zones).
 * `selectionReason` says why each was offered:
 *
 *   top_three       one of the three highest weights — adaptive
 *   exploration     a quiet zone, to keep the profile open — adaptive
 *   baseline_random drawn at random from the rest — the control
 *
 * `wasChosen` records that the participant picked the question to answer;
 * the first pick of a day is the main KPI signal.
 */
import { randomUUID } from 'node:crypto';
import store from '../../data/store.js';

export const SELECTION_REASONS = ['top_three', 'exploration', 'baseline_random'];

const all = () => store.state.promptsShown;
const raw = (id) => all().find((p) => p.id === id);
const copy = (r) => (r ? { ...r } : null);

/**
 * Stores the three questions of one day, unless that day already has them.
 * Returns the rows that are stored for the day, sorted by slot.
 */
export async function createDay(userId, day, questions) {
  const existing = await listForDay(userId, day);
  if (existing.length > 0) return existing;
  const shownAt = new Date().toISOString();
  for (const q of questions) {
    all().push({
      id: randomUUID(),
      userId,
      promptId: q.promptId,
      zoneId: q.zoneId,
      selectionReason: q.selectionReason,
      shownOn: day,
      slot: q.slot,
      shownAt,
      wasChosen: false,
      chosenAt: null,
      wasAnswered: false,
      entryId: null,
      relevanceRating: null,
      ratedAt: null,
      explanationOpened: false,
    });
  }
  store.save();
  return listForDay(userId, day);
}

export async function findById(id) {
  return copy(raw(id));
}

export async function listForDay(userId, day) {
  return all()
    .filter((p) => p.userId === userId && p.shownOn === day)
    .sort((a, b) => a.slot - b.slot)
    .map(copy);
}

export async function listForUser(userId) {
  return all()
    .filter((p) => p.userId === userId)
    .sort((a, b) => b.shownOn.localeCompare(a.shownOn) || a.slot - b.slot)
    .map(copy);
}

/**
 * Marks the question as picked. Returns `{ row, first }`, where `first` is
 * true only the first time — the weight nudge must happen once, not on every
 * click.
 */
export async function choose(id) {
  const row = raw(id);
  if (!row) return { row: null, first: false };
  if (row.wasChosen) return { row: copy(row), first: false };
  row.wasChosen = true;
  row.chosenAt = new Date().toISOString();
  store.save();
  return { row: copy(row), first: true };
}

export async function linkEntry(id, entryId) {
  const row = raw(id);
  if (!row) return null;
  // answered implies chosen (CHECK prompts_shown_answer_needs_choice)
  if (!row.wasChosen) {
    row.wasChosen = true;
    row.chosenAt = new Date().toISOString();
  }
  row.wasAnswered = true;
  row.entryId = entryId;
  store.save();
  return copy(row);
}

export async function rate(id, relevant) {
  const row = raw(id);
  if (!row) return null;
  // rating and its time together (CHECK prompts_shown_rating_consistent)
  row.relevanceRating = relevant;
  row.ratedAt = new Date().toISOString();
  store.save();
  return copy(row);
}

export async function markExplanationOpened(id) {
  const row = raw(id);
  if (!row) return null;
  row.explanationOpened = true;
  store.save();
  return copy(row);
}

export async function removeAllForUser(userId) {
  store.state.promptsShown = all().filter((p) => p.userId !== userId);
  store.save();
}

export default {
  SELECTION_REASONS, createDay, findById, listForDay, listForUser, choose, linkEntry, rate,
  markExplanationOpened, removeAllForUser,
};
