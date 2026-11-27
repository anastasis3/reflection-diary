/**
 * The PostgreSQL connection (Supabase driver only).
 *
 * One pool for the whole process. The server connects with the connection
 * string from Supabase (role `postgres`), which bypasses row level security:
 * the API is the only client, and it enforces "your own rows only" itself by
 * always filtering on the id from the signed token (see middleware/
 * authenticate.js). RLS stays on as the second line of defence for anything
 * that reaches the database through Supabase's own REST API.
 */
import pg from 'pg';
import config from '../config/index.js';

// numeric(4,3) comes back from pg as a string by default ("0.430"), because a
// JavaScript number cannot hold every numeric exactly. Three decimals fit
// easily, so weights and scores are parsed as numbers.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
// `date` columns stay as 'YYYY-MM-DD' strings instead of becoming a Date at
// local midnight, which would shift the day in some time zones.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
// timestamptz as an ISO string ("2026-11-18T08:00:00.000Z"), the same shape
// the memory driver stores, so the services never see two kinds of time.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (v) =>
  v === null ? null : new Date(v).toISOString(),
);

let pool = null;

export function getPool() {
  if (!pool) {
    const url = config.storage.databaseUrl;
    pool = new pg.Pool({
      connectionString: url,
      max: 5,
      // Supabase requires TLS; a local PostgreSQL usually has none.
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

/** Runs one query and returns the rows. */
export async function query(text, params = []) {
  const result = await getPool().query(text, params);
  return result.rows;
}

/** Runs `fn(client)` inside BEGIN … COMMIT, rolling back on any error. */
export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function close() {
  if (pool) await pool.end();
  pool = null;
}

export default { getPool, query, transaction, close };
