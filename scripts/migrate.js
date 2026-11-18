#!/usr/bin/env node
/**
 * Applies the SQL files in supabase/migrations to the database in
 * SUPABASE_DB_URL, in file-name order, each in its own transaction.
 *
 *     npm run db:migrate
 *
 * Applied files are remembered in private.schema_migrations, so running it
 * again applies only what is new. The `private` schema is not exposed by
 * Supabase's REST API, so the bookkeeping table is not reachable from outside.
 *
 * What it does NOT run: supabase/local/00_auth_stub.sql (Supabase already has
 * auth) and supabase/seed/*.sql (test data must never go into the pilot
 * database). Equivalent by hand: paste each migration into the SQL Editor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set. Put it in .env (see docs/supabase.md, step 4).');
  process.exit(1);
}

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(`create schema if not exists private;
    create table if not exists private.schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await client.query('select name from private.schema_migrations')).rows.map((r) => r.name));

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) { console.log(`  skip   ${file}`); continue; }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into private.schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`  apply  ${file}`);
      applied += 1;
    } catch (error) {
      await client.query('rollback');
      console.error(`\n  FAILED ${file}\n  ${error.message}\n\nNothing from this file was applied. Fix it and run again.`);
      process.exit(1);
    }
  }
  const [{ zones }] = (await client.query('select count(*)::int as zones from zones')).rows;
  const [{ prompts }] = (await client.query('select count(*)::int as prompts from prompts')).rows;
  console.log(`\n${applied} new migration(s). Catalogue: ${zones} zones, ${prompts} questions.`);
} catch (error) {
  console.error(`Could not connect: ${error.message}\nCheck SUPABASE_DB_URL (Session pooler URI, password filled in).`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
