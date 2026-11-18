/**
 * Unit tests for the weight update.
 *
 * The properties asserted here are the ones the thesis claims about the model:
 * that it moves towards the evidence, that it moves slowly, that it is
 * bounded, and that a muted zone does not move at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { nextWeight } from '../../src/services/adaptation.service.js';

const ALPHA = 0.3;

test('new = 0.3 * score + 0.7 * old', () => {
  assert.equal(nextWeight(0.5, 1, ALPHA), 0.65);
  assert.equal(nextWeight(0.5, 0, ALPHA), 0.35);
  assert.equal(nextWeight(0.2, 0.8, ALPHA), 0.38);
});

test('a weight already equal to the score does not move', () => {
  assert.equal(nextWeight(0.42, 0.42, ALPHA), 0.42);
});

test('one entry moves a weight by at most a third of the distance', () => {
  // the whole point of the moving average: no single day rewrites the profile
  const moved = nextWeight(0, 1, ALPHA);
  assert.ok(moved <= 0.3 + 1e-9, `moved too far in one step: ${moved}`);
});

test('the value stays inside 0 and 1 whatever it is given', () => {
  assert.equal(nextWeight(1, 5, ALPHA), 1, 'clamped above');
  assert.equal(nextWeight(0, -5, ALPHA), 0, 'clamped below');
});

test('results are rounded to three decimals, as the database stores them', () => {
  const value = nextWeight(0.3333, 0.6666, ALPHA);
  assert.equal(value, Math.round(value * 1000) / 1000);
});

test('repeated evidence converges without ever overshooting', () => {
  let weight = 0.1;
  for (let i = 0; i < 40; i += 1) weight = nextWeight(weight, 1, ALPHA);

  assert.ok(weight > 0.95, `should approach the evidence, reached ${weight}`);
  assert.ok(weight <= 1, 'must never pass 1');
});

test('a topic that stops appearing fades back on its own', () => {
  let weight = 0.9;
  for (let i = 0; i < 20; i += 1) weight = nextWeight(weight, 0, ALPHA);

  assert.ok(weight < 0.05, `should decay towards zero, reached ${weight}`);
});

test('a larger alpha reacts faster, a smaller one slower', () => {
  const fast = nextWeight(0.2, 1, 0.6);
  const slow = nextWeight(0.2, 1, 0.1);
  assert.ok(fast > slow, 'alpha controls how quickly the profile follows evidence');
});

test('the choice boost is small, applied once per call, and never to a muted zone', async () => {
  process.env.NODE_ENV = 'test';
  const { default: store } = await import('../../src/data/store.js');
  const { weightsRepo } = await import('../../src/repositories/index.js');
  const { applyChoiceBoost } = await import('../../src/services/adaptation.service.js');
  const path = await import('node:path');
  store.useFile(path.resolve('tests/.tmp/adaptation-unit.json'));
  store.reset();

  await weightsRepo.set('u1', 'health', { weight: 0.44, source: 'quiz' });
  await weightsRepo.set('u1', 'work', { weight: 0.99, source: 'quiz' });
  await weightsRepo.set('u1', 'self', { weight: 0.5, isMuted: true, source: 'manual' });

  assert.deepEqual(await applyChoiceBoost('u1', 'health'), { zoneId: 'health', from: 0.44, to: 0.47 });
  assert.equal((await applyChoiceBoost('u1', 'work')).to, 1, 'clamped at 1');
  assert.equal(await applyChoiceBoost('u1', 'self'), null, 'muted zones do not move');
  assert.equal((await weightsRepo.find('u1', 'health')).source, 'choice');
});
