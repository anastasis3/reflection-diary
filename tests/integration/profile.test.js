/**
 * The topic profile and editing it by hand (US-5.x).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshApp, registerAndOnboard, request } from '../helpers/testApp.js';

const { app } = freshApp('profile');

test('the profile lists nine zones, sorted, with their movement since the quiz', async () => {
  const session = await registerAndOnboard(app);
  const { status, body } = await session.auth(request(app).get('/api/profile'));

  assert.equal(status, 200);
  assert.equal(body.zones.length, 9);
  assert.equal(body.totalZones, 9);
  assert.equal(body.askedAbout.length, 3, 'three zones are asked about');

  const weights = body.zones.map((z) => z.weight);
  assert.deepEqual(weights, [...weights].sort((a, b) => b - a), 'highest first');

  // Straight after the quiz nothing has moved yet.
  assert.ok(body.zones.every((z) => z.delta === 0));
});

test('the three zones asked about are the three highest that are not muted', async () => {
  const session = await registerAndOnboard(app);
  const { body } = await session.auth(request(app).get('/api/profile'));

  const expected = body.zones
    .filter((z) => !z.isMuted)
    .slice(0, 3)
    .map((z) => z.zone.id);

  assert.deepEqual([...body.askedAbout].sort(), [...expected].sort());
});

test('a weight can be set by hand and is recorded as a manual change', async () => {
  const session = await registerAndOnboard(app);
  const response = await session.auth(
    request(app).patch('/api/profile/weights').send({ zones: [{ zoneId: 'meaning', weight: 0.9 }] }),
  );

  assert.equal(response.status, 200);
  const meaning = response.body.zones.find((z) => z.zone.id === 'meaning');
  assert.equal(meaning.weight, 0.9);
  assert.equal(meaning.source, 'manual');

  const changes = await session.auth(request(app).get('/api/profile/changes'));
  const logged = changes.body.changes.find((c) => c.zoneId === 'meaning' && c.source === 'manual');
  assert.ok(logged, 'every change is recorded for the study');
  assert.equal(logged.newWeight, 0.9);
});

test('a weight outside 0 to 1 is rejected before it reaches the model', async () => {
  const session = await registerAndOnboard(app);
  const response = await session.auth(
    request(app).patch('/api/profile/weights').send({ zones: [{ zoneId: 'work', weight: 1.4 }] }),
  );
  assert.equal(response.status, 422);
});

test('a zone can be muted, and is then never asked about', async () => {
  const session = await registerAndOnboard(app);
  const { body: before } = await session.auth(request(app).get('/api/profile'));
  const top = before.askedAbout[0];

  const response = await session.auth(
    request(app).patch('/api/profile/weights').send({ zones: [{ zoneId: top, isMuted: true }] }),
  );

  assert.equal(response.status, 200);
  assert.ok(!response.body.askedAbout.includes(top), 'a muted zone drops out of the questions');
  assert.equal(response.body.mutedCount, 1);
});

test('fewer than three active zones is refused, with the rule stated', async () => {
  const session = await registerAndOnboard(app);
  const { body } = await session.auth(request(app).get('/api/profile'));

  // Mute seven of the nine, leaving two.
  const zones = body.zones.slice(0, 7).map((z) => ({ zoneId: z.zone.id, isMuted: true }));
  const response = await session.auth(request(app).patch('/api/profile/weights').send({ zones }));

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'TOO_FEW_ACTIVE_ZONES');
  assert.match(response.body.error.message, /at least 3/i);
});

test('a refused edit changes nothing at all', async () => {
  const session = await registerAndOnboard(app);
  const { body: before } = await session.auth(request(app).get('/api/profile'));

  const zones = before.zones.slice(0, 7).map((z) => ({ zoneId: z.zone.id, isMuted: true }));
  await session.auth(request(app).patch('/api/profile/weights').send({ zones }));

  const { body: after } = await session.auth(request(app).get('/api/profile'));
  assert.equal(after.mutedCount, before.mutedCount, 'the whole edit is rejected, not part of it');
});

test('a muted zone keeps its weight when an entry is classified', async () => {
  const session = await registerAndOnboard(app);
  await session.auth(
    request(app).patch('/api/profile/weights').send({ zones: [{ zoneId: 'work', isMuted: true }] }),
  );

  const { body: before } = await session.auth(request(app).get('/api/profile'));
  const workBefore = before.zones.find((z) => z.zone.id === 'work').weight;

  await session.auth(
    request(app).post('/api/entries').send({
      text: 'All about the office, the deadline and three meetings at work.',
    }),
  );

  const { body: after } = await session.auth(request(app).get('/api/profile'));
  const workAfter = after.zones.find((z) => z.zone.id === 'work').weight;

  assert.equal(workAfter, workBefore, 'muting means the diary leaves the zone alone entirely');
});

test('a zone the entry says nothing about keeps its weight', async () => {
  // Silence is not evidence of irrelevance. If an unmentioned zone were
  // pulled towards zero, then with two or three zones per entry every weight
  // would be dragged down on most days and the profile would collapse within
  // a month.
  const session = await registerAndOnboard(app);
  const { body: before } = await session.auth(request(app).get('/api/profile'));
  const meaningBefore = before.zones.find((z) => z.zone.id === 'meaning').weight;

  await session.auth(
    request(app).post('/api/entries').send({
      text: 'The office deadline moved and I sat through three meetings about it.',
    }),
  );

  const { body: after } = await session.auth(request(app).get('/api/profile'));
  const meaningAfter = after.zones.find((z) => z.zone.id === 'meaning').weight;
  const workAfter = after.zones.find((z) => z.zone.id === 'work').weight;
  const workBefore = before.zones.find((z) => z.zone.id === 'work').weight;

  assert.equal(meaningAfter, meaningBefore, 'an unmentioned zone must not move');
  assert.notEqual(workAfter, workBefore, 'the zone the entry was about must move');
});

test('an entry the classifier understands nothing of moves nothing', async () => {
  const session = await registerAndOnboard(app);
  const { body: before } = await session.auth(request(app).get('/api/profile'));

  const response = await session.auth(
    request(app).post('/api/entries').send({ text: 'qqq zzz wwww.' }),
  );

  assert.equal(response.body.analysis, 'classified');
  assert.deepEqual(response.body.weightChanges, []);

  const { body: after } = await session.auth(request(app).get('/api/profile'));
  assert.deepEqual(
    after.zones.map((z) => z.weight),
    before.zones.map((z) => z.weight),
  );
});

test('the trend of a zone is recorded day by day', async () => {
  const session = await registerAndOnboard(app);
  const response = await session.auth(request(app).get('/api/profile/trend?zone=work&days=30'));

  assert.equal(response.status, 200);
  assert.equal(response.body.zone.id, 'work');
  assert.ok(response.body.points.length >= 1, 'the quiz itself writes the first point');
  assert.ok(response.body.points.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.day)));
});

test('an unknown zone in the trend query is rejected', async () => {
  const session = await registerAndOnboard(app);
  const response = await session.auth(request(app).get('/api/profile/trend?zone=astrology'));
  assert.equal(response.status, 422);
});
