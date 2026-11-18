/** Onboarding answers — PostgreSQL driver. Table: onboarding_answers. */
import { query } from '../../data/db.js';

const COLS = `user_id as "userId", zone_id as "zoneId", value, answered_at as "answeredAt"`;

export async function listForUser(userId) {
  return query(`select ${COLS} from onboarding_answers where user_id = $1`, [userId]);
}

export async function upsert(userId, zoneId, value) {
  const [row] = await query(
    `insert into onboarding_answers (user_id, zone_id, value) values ($1, $2, $3)
     on conflict (user_id, zone_id) do update set value = excluded.value, answered_at = now()
     returning ${COLS}`,
    [userId, zoneId, value],
  );
  return row;
}

export async function removeAllForUser(userId) {
  await query('delete from onboarding_answers where user_id = $1', [userId]);
}

export default { listForUser, upsert, removeAllForUser };
