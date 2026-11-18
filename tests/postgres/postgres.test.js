/**
 * The Supabase driver against a real PostgreSQL database.
 *
 * Skipped unless TEST_DATABASE_URL is set. CI sets it (job "postgres"): it
 * starts PostgreSQL 16, applies supabase/local/00_auth_stub.sql and every
 * migration, then runs this file. Locally:
 *
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/rd_test \
 *     node --test tests/postgres/
 *
 * Supabase Auth cannot run locally, so `accountsRepo` is replaced by a stub
 * that writes to the stub auth.users table. Everything else — every SQL
 * query, the triggers, the CHECK and UNIQUE constraints, the encryption — is
 * the real code that runs on Supabase.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  test('postgres driver (skipped: TEST_DATABASE_URL is not set)', { skip: true }, () => {});
} else {
  process.env.NODE_ENV = 'test';
  process.env.DB_DRIVER = 'supabase';
  process.env.SUPABASE_DB_URL = url;
  process.env.ENTRY_ENCRYPTION_KEY = 'ab'.repeat(32);

  const { default: request } = await import('supertest');
  const repos = await import('../../src/repositories/index.js');
  const db = await import('../../src/data/db.js');
  const { createApp } = await import('../../src/app.js');

  // --- Supabase Auth stand-in: auth.users from 00_auth_stub.sql ----------
  const passwords = new Map();
  Object.assign(repos.accountsRepo, {
    async createUser({ email, password }) {
      const id = randomUUID();
      await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
      passwords.set(email, { id, password });
      return { id, email, createdAt: new Date().toISOString() };
    },
    async verifyCredentials(email, password) {
      const p = passwords.get(email);
      return p && p.password === password ? { id: p.id, email, createdAt: null } : null;
    },
    async findById(id) {
      const [row] = await db.query('select id, email from auth.users where id = $1', [id]);
      return row ? { ...row, createdAt: null } : null;
    },
    async remove(id) {
      await db.query('delete from auth.users where id = $1', [id]);
    },
  });

  await repos.initStorage();
  const app = createApp();
  test.after(() => db.close());

  const register = async (name) => {
    const email = `pg.${randomUUID()}@example.test`;
    const r = await request(app).post('/api/auth/register').send({
      email, password: 'correct horse battery', name,
      acceptPrivacyNotice: true, acceptAiProcessing: true,
    });
    assert.equal(r.status, 201, r.text);
    const auth = (req) => req.set('authorization', `Bearer ${r.body.token}`);
    const { body: state } = await auth(request(app).get('/api/onboarding'));
    for (const [i, s] of state.statements.entries()) {
      await auth(request(app).post('/api/onboarding/answers').send({ zoneId: s.zoneId, value: (i % 5) + 1 }));
    }
    await auth(request(app).post('/api/onboarding/complete'));
    return { auth, user: r.body.user };
  };

  test('register, quiz and profile go through PostgreSQL', async () => {
    const s = await register('Mia');
    assert.equal(s.user.displayName, 'Mia');
    const [p] = await db.query('select display_name from profiles where id = $1', [s.user.id]);
    assert.equal(p.display_name, 'Mia');
    const profile = await s.auth(request(app).get('/api/profile'));
    assert.equal(profile.body.zones.length, 9);
  });

  test('three questions, a pick, an entry and a rating satisfy every constraint', async () => {
    const s = await register();
    const { body } = await s.auth(request(app).get('/api/prompts/today'));
    assert.equal(body.questions.length, 3);
    const again = await s.auth(request(app).get('/api/prompts/today'));
    assert.deepEqual(again.body.questions.map((q) => q.promptShownId), body.questions.map((q) => q.promptShownId));

    const q = body.questions[0];
    const pick = await s.auth(request(app).post(`/api/prompts/${q.promptShownId}/choose`));
    assert.equal(pick.status, 200, pick.text);
    assert.ok(pick.body.boost);

    const saved = await s.auth(request(app).post('/api/entries').send({
      text: 'Long day at the office, the deadline moved.', promptShownId: q.promptShownId,
    }));
    assert.equal(saved.status, 201, saved.text);
    assert.equal(saved.body.analysis, 'classified');

    const rated = await s.auth(request(app).post(`/api/prompts/${q.promptShownId}/rating`).send({ relevant: true }));
    assert.equal(rated.status, 200, rated.text);

    const [row] = await db.query('select * from prompts_shown where id = $1', [q.promptShownId]);
    assert.equal(row.was_chosen, true);
    assert.equal(row.was_answered, true);
    assert.equal(row.relevance_rating, true);

    const sources = await db.query('select distinct source from weight_changes where user_id = $1', [s.user.id]);
    assert.deepEqual(sources.map((r) => r.source).sort(), ['choice', 'learned', 'quiz']);
  });

  test('entry text is stored encrypted and read back in plain text', async () => {
    const s = await register();
    const saved = await s.auth(request(app).post('/api/entries').send({ text: 'A private sentence.' }));
    const [row] = await db.query('select text_encrypted from entries where id = $1', [saved.body.entry.id]);
    assert.match(row.text_encrypted, /^v1:/);
    assert.ok(!row.text_encrypted.includes('private'));
    const read = await s.auth(request(app).get(`/api/entries/${saved.body.entry.id}`));
    assert.equal(read.body.entry.text, 'A private sentence.');
  });

  test('the history day and the insight read from PostgreSQL', async () => {
    const s = await register();
    const { body } = await s.auth(request(app).get('/api/prompts/today'));
    await s.auth(request(app).post('/api/entries').send({ text: 'Worked late again.', promptShownId: body.questions[1].promptShownId }));
    const day = await s.auth(request(app).get(`/api/history/day/${body.day}`));
    assert.equal(day.body.questions.length, 3);
    assert.equal(day.body.entries.length, 1);
    const insight = await s.auth(request(app).get('/api/profile/insight'));
    assert.equal(insight.status, 200, insight.text);
    assert.equal(insight.body.insight.totalEntries, 1);
  });

  test('consent can be withdrawn and given again (a new row each time)', async () => {
    const s = await register();
    await s.auth(request(app).delete('/api/account/consents/ai-processing'));
    await s.auth(request(app).post('/api/account/consents/ai-processing'));
    const rows = await db.query(
      `select withdrawn_at from consents where user_id = $1 and purpose = 'ai_processing' order by id`,
      [s.user.id],
    );
    assert.equal(rows.length, 2);
    assert.ok(rows[0].withdrawn_at);
    assert.equal(rows[1].withdrawn_at, null);
  });

  test('deleting the account removes every row', async () => {
    const s = await register();
    const { body } = await s.auth(request(app).get('/api/prompts/today'));
    await s.auth(request(app).post('/api/entries').send({ text: 'Bye.', promptShownId: body.questions[0].promptShownId }));
    const del = await s.auth(request(app).delete('/api/account'));
    assert.equal(del.status, 200, del.text);
    const [left] = await db.query(
      `select (select count(*) from profiles where id = $1)
            + (select count(*) from entries where user_id = $1)
            + (select count(*) from prompts_shown where user_id = $1)
            + (select count(*) from user_topic_weights where user_id = $1) as n`,
      [s.user.id],
    );
    assert.equal(Number(left.n), 0);
  });
}
