/**
 * Questions shown — PostgreSQL driver. Table: prompts_shown.
 *
 * The database itself guarantees the daily shape: unique (user, day, slot)
 * and unique (user, day, zone). If two requests race to create the same
 * day, the second insert hits those constraints, ON CONFLICT DO NOTHING
 * drops its rows, and both requests read back the same three questions.
 */
import { query } from '../../data/db.js';

export const SELECTION_REASONS = ['top_three', 'exploration', 'baseline_random'];

const COLS = `id, user_id as "userId", prompt_id as "promptId", zone_id as "zoneId",
  selection_reason as "selectionReason", shown_on as "shownOn", slot, shown_at as "shownAt",
  was_chosen as "wasChosen", chosen_at as "chosenAt", was_answered as "wasAnswered",
  entry_id as "entryId", relevance_rating as "relevanceRating", rated_at as "ratedAt",
  explanation_opened as "explanationOpened"`;

export async function listForDay(userId, day) {
  return query(
    `select ${COLS} from prompts_shown where user_id = $1 and shown_on = $2 order by slot`,
    [userId, day],
  );
}

export async function createDay(userId, day, questions) {
  await query(
    `insert into prompts_shown (user_id, prompt_id, zone_id, selection_reason, shown_on, slot)
     select $1, p, z, r, $2, s
     from unnest($3::int[], $4::text[], $5::text[], $6::smallint[]) as t(p, z, r, s)
     on conflict do nothing`,
    [
      userId,
      day,
      questions.map((q) => q.promptId),
      questions.map((q) => q.zoneId),
      questions.map((q) => q.selectionReason),
      questions.map((q) => q.slot),
    ],
  );
  return listForDay(userId, day);
}

export async function findById(id) {
  const [row] = await query(`select ${COLS} from prompts_shown where id = $1`, [id]);
  return row ?? null;
}

export async function listForUser(userId) {
  return query(
    `select ${COLS} from prompts_shown where user_id = $1 order by shown_on desc, slot`,
    [userId],
  );
}

export async function choose(id) {
  const [row] = await query(
    `update prompts_shown set was_chosen = true, chosen_at = now()
     where id = $1 and not was_chosen returning ${COLS}`,
    [id],
  );
  if (row) return { row, first: true };
  return { row: await findById(id), first: false };
}

export async function linkEntry(id, entryId) {
  const [row] = await query(
    `update prompts_shown
     set was_chosen = true, chosen_at = coalesce(chosen_at, now()),
         was_answered = true, entry_id = $2
     where id = $1 returning ${COLS}`,
    [id, entryId],
  );
  return row ?? null;
}

export async function rate(id, relevant) {
  const [row] = await query(
    `update prompts_shown set relevance_rating = $2, rated_at = now() where id = $1 returning ${COLS}`,
    [id, relevant],
  );
  return row ?? null;
}

export async function markExplanationOpened(id) {
  const [row] = await query(
    `update prompts_shown set explanation_opened = true where id = $1 returning ${COLS}`,
    [id],
  );
  return row ?? null;
}

export async function removeAllForUser(userId) {
  await query('delete from prompts_shown where user_id = $1', [userId]);
}

export default {
  SELECTION_REASONS, createDay, findById, listForDay, listForUser, choose, linkEntry, rate,
  markExplanationOpened, removeAllForUser,
};
