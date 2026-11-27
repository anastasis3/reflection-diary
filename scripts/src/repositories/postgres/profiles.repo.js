/** Profiles — PostgreSQL driver. Table: profiles. */
import { query } from '../../data/db.js';

const COLS = `id, display_name as "displayName",
  onboarding_started_at as "onboardingStartedAt",
  onboarding_completed_at as "onboardingCompletedAt", created_at as "createdAt"`;

export async function findById(userId) {
  const [row] = await query(`select ${COLS} from profiles where id = $1`, [userId]);
  return row ?? null;
}

export async function create(userId, { displayName = null } = {}) {
  const [row] = await query(
    `insert into profiles (id, display_name, onboarding_started_at)
     values ($1, $2, now()) returning ${COLS}`,
    [userId, displayName],
  );
  return row;
}

export async function setDisplayName(userId, displayName) {
  const [row] = await query(
    `update profiles set display_name = $2 where id = $1 returning ${COLS}`,
    [userId, displayName],
  );
  return row ?? null;
}

export async function markOnboardingComplete(userId) {
  const [row] = await query(
    `update profiles set onboarding_completed_at = now() where id = $1 returning ${COLS}`,
    [userId],
  );
  return row ?? null;
}

export async function remove(userId) {
  await query('delete from profiles where id = $1', [userId]);
}

export default { findById, create, setDisplayName, markOnboardingComplete, remove };
