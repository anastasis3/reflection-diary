/**
 * Unit tests for the offline classifier.
 *
 * These are not a measure of accuracy — KPI3 (macro-F1 >= 0.70) is measured
 * separately against hand-labelled entries. What they check is that the
 * function keeps the contract the rest of the application relies on: nine
 * scores, always, each between 0 and 1, and a top zone that is not absurd.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyWithLexicon, classify } from '../../src/services/classification.service.js';
import { ZONE_IDS } from '../../src/data/zones.js';

const top = (scores) => Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];

test('always returns a score for every one of the nine zones', () => {
  for (const text of ['', 'work work work', 'xyzzy', 'I slept badly']) {
    const scores = classifyWithLexicon(text);
    assert.deepEqual(Object.keys(scores).sort(), [...ZONE_IDS].sort());
    for (const [zone, value] of Object.entries(scores)) {
      assert.ok(value >= 0 && value <= 1, `${zone} out of range: ${value}`);
    }
  }
});

test('an entry about work scores work highest', () => {
  const scores = classifyWithLexicon(
    'Three meetings at the office that could have been one message, and the deadline moved again.',
  );
  assert.equal(top(scores), 'work');
});

test('an entry about sleep scores energy highest', () => {
  const scores = classifyWithLexicon(
    'I slept four hours again and woke up exhausted. No energy left by the afternoon.',
  );
  assert.equal(top(scores), 'energy');
});

test('an entry about a sister scores close people highest', () => {
  const scores = classifyWithLexicon(
    'Called my sister for the first time in three weeks. We talked for an hour.',
  );
  assert.equal(top(scores), 'people');
});

test('ordinary words do not create signal', () => {
  // "the" contains "he" and "great" contains "eat": matching on substrings
  // instead of word starts used to score `people` and `health` from these.
  const scores = classifyWithLexicon('The weather was great and the day went by.');
  assert.ok(
    Object.values(scores).every((v) => v === 0),
    'connecting words must not make a zone look relevant',
  );
});

test('a text with nothing recognisable scores every zone at zero', () => {
  // Zero means "this entry says nothing about any zone", and the adaptation
  // then leaves the profile alone. A small invented value would make the
  // profile drift on entries the classifier did not understand.
  const scores = classifyWithLexicon('qqq zzz wwww');
  assert.ok(Object.values(scores).every((v) => v === 0));
});

test('scores are relative, so a long entry does not push every weight up', () => {
  const short = classifyWithLexicon('Work was heavy today.');
  const long = classifyWithLexicon(`Work was heavy today. ${'The work continued. '.repeat(20)}`);
  assert.equal(short.work, 1);
  assert.equal(long.work, 1, 'the strongest zone is always 1, whatever the length');
});

test('the failing strategy throws, so the degraded path can be exercised', async () => {
  await assert.rejects(() => classify('anything', { strategy: 'failing' }));
});

test('the default strategy resolves with nine scores', async () => {
  const scores = await classify('I went for a walk and my back stopped hurting.');
  assert.equal(Object.keys(scores).length, 9);
});
