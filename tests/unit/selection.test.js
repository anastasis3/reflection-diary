/**
 * Unit tests for the question-selection rule.
 *
 * The rule is probabilistic, so these tests do not run it a thousand times and
 * check a proportion — that would be slow and occasionally fail for no reason.
 * Instead each test hands `chooseZone` a scripted sequence of "random" numbers
 * and asserts which branch it must take. That is possible only because the
 * function takes its randomness as an argument, which is the reason it does.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseZone, choosePrompt } from '../../src/services/selection.service.js';
import { promptsForZone } from '../../src/data/prompts.js';

/** A fake Math.random that returns the given values in order. */
function scripted(values) {
  let i = 0;
  return () => {
    const value = values[i] ?? 0;
    i += 1;
    return value;
  };
}

const weights = [
  { zoneId: 'work', weight: 0.9, isMuted: false },
  { zoneId: 'energy', weight: 0.7, isMuted: false },
  { zoneId: 'emotion', weight: 0.6, isMuted: false },
  { zoneId: 'people', weight: 0.4, isMuted: false },
  { zoneId: 'meaning', weight: 0.1, isMuted: false },
];

const settings = { randomQuestionShare: 0.33, explorationRate: 0.15, topN: 3 };

test('draws a random question when the first coin falls below the share', () => {
  // first value 0.1 < 0.33 -> the control branch; second value picks from the pool
  const result = chooseZone({ weights, random: scripted([0.1, 0]), settings });
  assert.equal(result.reason, 'baseline_random');
});

test('a random question may come from any zone, not only the quiet ones', () => {
  // the second value indexes the pool; 0.99 reaches the last entry
  const result = chooseZone({ weights, random: scripted([0.1, 0.99]), settings });
  assert.equal(result.reason, 'baseline_random');
  assert.equal(result.zoneId, 'meaning');
});

test('explores the quietest zone when the second coin falls below the rate', () => {
  // 0.9 > 0.33 (not random), then 0.05 < 0.15 (explore)
  const result = chooseZone({ weights, random: scripted([0.9, 0.05]), settings });
  assert.equal(result.reason, 'exploration');
  assert.equal(result.zoneId, 'meaning', 'exploration picks the lowest weight');
});

test('otherwise chooses from the three highest weights', () => {
  // 0.9 > 0.33, 0.9 > 0.15, then 0 picks the first of the top three
  const result = chooseZone({ weights, random: scripted([0.9, 0.9, 0]), settings });
  assert.equal(result.reason, 'top_three');
  assert.equal(result.zoneId, 'work');
});

test('the adaptive branch never reaches below the top three', () => {
  // 0.99 as the index would reach the last zone if the slice were missing
  const result = chooseZone({ weights, random: scripted([0.9, 0.9, 0.99]), settings });
  assert.equal(result.reason, 'top_three');
  assert.ok(
    ['work', 'energy', 'emotion'].includes(result.zoneId),
    `expected one of the top three, got ${result.zoneId}`,
  );
});

test('a muted zone is never chosen, even when it has the highest weight', () => {
  const muted = [
    { zoneId: 'work', weight: 0.95, isMuted: true },
    { zoneId: 'energy', weight: 0.7, isMuted: false },
    { zoneId: 'people', weight: 0.4, isMuted: false },
    { zoneId: 'meaning', weight: 0.2, isMuted: false },
  ];
  // run every branch and check the muted zone never appears
  for (const script of [[0.1, 0.99], [0.9, 0.05], [0.9, 0.9, 0.99], [0.1, 0], [0.9, 0.9, 0]]) {
    const result = chooseZone({ weights: muted, random: scripted(script), settings });
    assert.notEqual(result.zoneId, 'work', `muted zone chosen via ${result.reason}`);
  }
});

test("yesterday's zone is excluded, so the same topic is not asked twice running", () => {
  const result = chooseZone({
    weights,
    excludeZone: 'work',
    random: scripted([0.9, 0.9, 0]),
    settings,
  });
  assert.notEqual(result.zoneId, 'work');
  assert.equal(result.reason, 'top_three');
});

test('the exclusion is dropped rather than leaving nothing to ask about', () => {
  const only = [
    { zoneId: 'work', weight: 0.8, isMuted: false },
    { zoneId: 'energy', weight: 0.5, isMuted: true },
  ];
  const result = chooseZone({ weights: only, excludeZone: 'work', random: scripted([0.9, 0.9, 0]), settings });
  assert.equal(result.zoneId, 'work', 'falls back rather than failing to ask');
});

test('refuses when every zone is muted, with a message that says what to do', () => {
  const allMuted = weights.map((w) => ({ ...w, isMuted: true }));
  assert.throws(
    () => chooseZone({ weights: allMuted, random: scripted([0.9]), settings }),
    (error) => error.code === 'NO_ACTIVE_ZONES' && error.status === 409,
  );
});

test('the chosen question always belongs to the chosen zone', () => {
  for (const zoneId of ['work', 'people', 'meaning']) {
    for (const r of [0, 0.5, 0.99]) {
      const prompt = choosePrompt(zoneId, () => r);
      assert.equal(prompt.zoneId, zoneId);
      assert.ok(promptsForZone(zoneId).some((p) => p.id === prompt.id));
    }
  }
});
