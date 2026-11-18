/**
 * The storage seam.
 *
 * Every service imports its repositories from here and nowhere else. Which
 * implementation answers is decided once, by DB_DRIVER:
 *
 *   memory   (default)  src/repositories/memory/    a JSON file; tests and CI
 *   supabase            src/repositories/postgres/  PostgreSQL + Supabase Auth
 *
 * Both sets export the same async functions and return the same shapes, so
 * no service, controller or route knows which one it is talking to.
 */
import config from '../config/index.js';
import { replaceCatalog } from '../data/prompts.js';

const dir = config.storage.driver === 'supabase' ? './postgres' : './memory';
// Each repository is exported as a plain object (a copy of the module), so a
// test can replace one function — e.g. Supabase Auth, which has no local
// equivalent — without touching the rest. Production code never does that.
const load = async (name) => ({ ...(await import(`${dir}/${name}.repo.js`)) });

export const accountsRepo = await load('accounts');
export const profilesRepo = await load('profiles');
export const consentsRepo = await load('consents');
export const onboardingRepo = await load('onboarding');
export const weightsRepo = await load('weights');
export const entriesRepo = await load('entries');
export const promptsShownRepo = await load('promptsShown');

/**
 * Start-up work for the chosen driver. For Supabase: check the connection
 * and load the question bank from the `prompts` table.
 */
export async function initStorage() {
  if (config.storage.driver !== 'supabase') return { driver: 'memory', file: config.storage.dataFile };
  const { query } = await import('../data/db.js');
  const rows = await query(
    'select id, zone_id as "zoneId", text, is_active as "isActive" from prompts order by id',
  );
  if (rows.length === 0) {
    throw new Error('The prompts table is empty. Run the migrations in supabase/migrations first.');
  }
  replaceCatalog(rows);
  return { driver: 'supabase', prompts: rows.length };
}

export default {
  accountsRepo, profilesRepo, consentsRepo, onboardingRepo, weightsRepo, entriesRepo,
  promptsShownRepo, initStorage,
};
