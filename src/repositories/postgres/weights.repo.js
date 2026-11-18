/**
 * Topic weights — PostgreSQL driver.
 *
 * Only user_topic_weights is written here. weight_changes and weight_history
 * are filled by the trigger record_weight_change(), so the audit trail
 * cannot be skipped by any code path, including a manual SQL edit.
 */
import { query } from '../../data/db.js';
import { ZONE_IDS } from '../../data/zones.js';

const round3 = (w) => Math.round(Math.min(1, Math.max(0, w)) * 1000) / 1000;
const COLS = `user_id as "userId", zone_id as "zoneId", weight, is_muted as "isMuted",
  source, updated_at as "updatedAt"`;

export async function listForUser(userId) {
  return query(`select ${COLS} from user_topic_weights where user_id = $1`, [userId]);
}

export async function find(userId, zoneId) {
  const [row] = await query(
    `select ${COLS} from user_topic_weights where user_id = $1 and zone_id = $2`,
    [userId, zoneId],
  );
  return row ?? null;
}

/** @param {{weight?: number, isMuted?: boolean, source: string}} patch */
export async function set(userId, zoneId, patch) {
  const weight = patch.weight === undefined ? null : round3(patch.weight);
  const muted = patch.isMuted === undefined ? null : Boolean(patch.isMuted);
  const [row] = await query(
    `insert into user_topic_weights (user_id, zone_id, weight, is_muted, source)
     values ($1, $2, coalesce($3::numeric, 0), coalesce($4::boolean, false), $5)
     on conflict (user_id, zone_id) do update set
       weight   = coalesce($3::numeric, user_topic_weights.weight),
       is_muted = coalesce($4::boolean, user_topic_weights.is_muted),
       source   = excluded.source
     returning ${COLS}`,
    [userId, zoneId, weight, muted, patch.source],
  );
  return row;
}

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

export async function historyForZone(userId, zoneId, fromDay) {
  return query(
    `select user_id as "userId", zone_id as "zoneId", as_of as "asOf", weight
     from weight_history
     where user_id = $1 and zone_id = $2 and ($3::date is null or as_of >= $3::date)
     order by as_of`,
    [userId, zoneId, fromDay ?? null],
  );
}

export async function historyForUser(userId) {
  return query(
    `select user_id as "userId", zone_id as "zoneId", as_of as "asOf", weight
     from weight_history where user_id = $1 order by as_of, zone_id`,
    [userId],
  );
}

export async function changesForUser(userId) {
  return query(
    `select id::int, user_id as "userId", zone_id as "zoneId", old_weight as "oldWeight",
            new_weight as "newWeight", old_muted as "oldMuted", new_muted as "newMuted",
            source, changed_at as "changedAt"
     from weight_changes where user_id = $1 order by changed_at desc, id desc`,
    [userId],
  );
}

export async function removeAllForUser(userId) {
  await query('delete from user_topic_weights where user_id = $1', [userId]);
  await query('delete from weight_history where user_id = $1', [userId]);
  await query('delete from weight_changes where user_id = $1', [userId]);
}

export default {
  listForUser, find, set, seedFromQuiz, historyForZone, historyForUser, changesForUser, removeAllForUser,
};
