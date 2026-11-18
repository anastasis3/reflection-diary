/**
 * Entries — PostgreSQL driver. Tables: entries, entry_topic_scores.
 *
 * The text is encrypted here, on the way in, and decrypted on the way out
 * (AES-256-GCM, utils/crypto.js). The database holds ciphertext only, which
 * is why there is no text search in SQL and filtering uses the stored
 * classification.
 *
 * Reads return the same shape as the memory driver: the entry with `scores`,
 * `topZoneId` and `question` attached, from a single query.
 */
import { query, transaction } from '../../data/db.js';
import { encrypt, decrypt } from '../../utils/crypto.js';

const SELECT = `
  select e.id, e.user_id as "userId", e.text_encrypted as "textEncrypted", e.status,
         e.created_at as "createdAt", e.classified_at as "classifiedAt",
         coalesce((select jsonb_object_agg(s.zone_id, s.score)
                   from entry_topic_scores s where s.entry_id = e.id), '{}'::jsonb) as scores,
         ps.id as "psId", ps.prompt_id as "psPromptId", ps.zone_id as "psZoneId",
         ps.relevance_rating as "psRating"
  from entries e
  left join prompts_shown ps on ps.entry_id = e.id`;

function topOf(scores) {
  const list = Object.entries(scores).filter(([, v]) => v > 0);
  if (list.length === 0) return null;
  return list.sort((a, b) => b[1] - a[1])[0][0];
}

function hydrate(row) {
  if (!row) return null;
  const scores = Object.fromEntries(Object.entries(row.scores).map(([k, v]) => [k, Number(v)]));
  return {
    id: row.id,
    userId: row.userId,
    text: decrypt(row.textEncrypted),
    status: row.status,
    createdAt: row.createdAt,
    classifiedAt: row.classifiedAt,
    scores,
    topZoneId: topOf(scores),
    question: row.psId
      ? { promptShownId: row.psId, promptId: row.psPromptId, zoneId: row.psZoneId,
          relevanceRating: row.psRating }
      : null,
  };
}

export async function findById(id) {
  const [row] = await query(`${SELECT} where e.id = $1`, [id]);
  return hydrate(row);
}

export async function create({ userId, text }) {
  const [row] = await query(
    `insert into entries (user_id, text_encrypted, status) values ($1, $2, 'saved') returning id`,
    [userId, encrypt(text)],
  );
  return findById(row.id);
}

export async function listForUser(userId, { zoneId, from, to } = {}) {
  const rows = await query(
    `${SELECT}
     where e.user_id = $1
       and ($2::date is null or (e.created_at at time zone 'UTC')::date >= $2::date)
       and ($3::date is null or (e.created_at at time zone 'UTC')::date <= $3::date)
     order by e.created_at desc`,
    [userId, from ?? null, to ?? null],
  );
  const out = rows.map(hydrate);
  return zoneId ? out.filter((e) => e.topZoneId === zoneId) : out;
}

export async function saveScores(entryId, scores) {
  await transaction(async (client) => {
    await client.query(
      `update entries set status = 'classified', classified_at = now() where id = $1`,
      [entryId],
    );
    await client.query('delete from entry_topic_scores where entry_id = $1', [entryId]);
    const zones = Object.keys(scores);
    if (zones.length > 0) {
      await client.query(
        `insert into entry_topic_scores (entry_id, zone_id, score)
         select $1, z, s from unnest($2::text[], $3::numeric[]) as t(z, s)`,
        [entryId, zones, zones.map((z) => Math.round(scores[z] * 1000) / 1000)],
      );
    }
  });
  return findById(entryId);
}

export async function markFailed(entryId) {
  await query(
    `update entries set status = 'classification_failed', classified_at = null where id = $1`,
    [entryId],
  );
  return findById(entryId);
}

export async function countForUser(userId) {
  const [row] = await query('select count(*)::int as n from entries where user_id = $1', [userId]);
  return row.n;
}

export async function removeAllForUser(userId) {
  await query('delete from entries where user_id = $1', [userId]); // scores cascade
}

export default { create, findById, listForUser, saveScores, markFailed, countForUser, removeAllForUser };
