/**
 * Consents — PostgreSQL driver. Table: consents.
 * Withdrawal sets withdrawn_at; consenting again inserts a new row (the
 * partial unique index allows one active row per purpose).
 */
import { query } from '../../data/db.js';

const COLS = `id, user_id as "userId", purpose, text_version as "textVersion",
  granted_at as "grantedAt", withdrawn_at as "withdrawnAt"`;

export async function listForUser(userId) {
  return query(
    `select distinct on (purpose) ${COLS} from consents
     where user_id = $1 order by purpose, granted_at desc, id desc`,
    [userId],
  );
}

export async function find(userId, purpose) {
  const [row] = await query(
    `select ${COLS} from consents where user_id = $1 and purpose = $2
     order by granted_at desc, id desc limit 1`,
    [userId, purpose],
  );
  return row ?? null;
}

export async function grant(userId, purpose, textVersion = 'v1.0') {
  const current = await find(userId, purpose);
  if (current && !current.withdrawnAt) return current;
  const [row] = await query(
    `insert into consents (user_id, purpose, text_version) values ($1, $2, $3) returning ${COLS}`,
    [userId, purpose, textVersion],
  );
  return row;
}

export async function withdraw(userId, purpose) {
  await query(
    `update consents set withdrawn_at = now()
     where user_id = $1 and purpose = $2 and withdrawn_at is null`,
    [userId, purpose],
  );
  return find(userId, purpose);
}

export async function isActive(userId, purpose) {
  const consent = await find(userId, purpose);
  return Boolean(consent && !consent.withdrawnAt);
}

export async function removeAllForUser(userId) {
  await query('delete from consents where user_id = $1', [userId]);
}

export default { listForUser, find, grant, withdraw, isActive, removeAllForUser };
