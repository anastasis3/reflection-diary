/**
 * Unit tests for the three-question selection rule.
 *
 * The rule is probabilistic, so each test hands `chooseThree` a scripted
 * sequence of "random" numbers and checks what it must produce, plus one
 * test that runs it many times and checks the invariants that must hold on
 * every single draw. Taking randomness as an argument is what makes this
 * possible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseThree, choosePrompt } from '../../src/services/selection.service.js';
import { promptsForZone } from '../../src/data/prompts.js';

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
  { zoneId: 'self', weight: 0.3, isMuted: false },
  { zoneId: 'meaning', weight: 0.1, isMuted: false },
  { zoneId: 'health', weight: 0.5, isMuted: true },
];
const settings = { explorationRate: 0.15, topN: 3 };
const byReason = (three, r) => three.filter((q) => q.reason === r).map((q) => q.zoneId);

test('slot A is weighted towards the highest zone', () => {
  // weights of the top three: 0.9 + 0.7 + 0.6 = 2.2; 0.1 * 2.2 = 0.22 < 0.9 → work
  const three = chooseThree({ weights, random: scripted([0.1, 0.9, 0.5, 0, 0, 0, 0]), settings });
  assert.ok(byReason(three, 'top_three').includes('work'));
});

test('slot B explores a quiet zone when the coin falls below the rate', () => {
  // A: work; coin 0.05 < 0.15 → explore; 0 → the first of the three quietest
  const three = chooseThree({ weights, random: scripted([0, 0.05, 0, 0, 0, 0, 0]), settings });
  assert.deepEqual(byReason(three, 'exploration'), ['people']);
  assert.equal(byReason(three, 'top_three').length, 1);
});

test('otherwise slot B is another of the top three', () => {
  const three = chooseThree({ weights, random: scripted([0, 0.9, 0, 0, 0, 0, 0]), settings });
  const adaptive = byReason(three, 'top_three');
  assert.equal(adaptive.length, 2);
  for (const z of adaptive) assert.ok(['work', 'energy', 'emotion'].includes(z));
});

test('slot C, the control, may be any other live zone', () => {
  // 0.99 indexes the end of the remaining list → the quietest zone
  const three = chooseThree({ weights, random: scripted([0, 0.9, 0, 0.99, 0, 0, 0]), settings });
  assert.deepEqual(byReason(three, 'baseline_random'), ['meaning']);
});

test('on every draw: three different zones, one control, no muted zone, slots 1-3', () => {
  for (let i = 0; i < 2000; i += 1) {
    const three = chooseThree({ weights, settings });
    assert.equal(three.length, 3);
    assert.equal(new Set(three.map((q) => q.zoneId)).size, 3);
    assert.equal(byReason(three, 'baseline_random').length, 1);
    assert.ok(!three.some((q) => q.zoneId === 'health'), 'a muted zone is never offered');
    assert.deepEqual(three.map((q) => q.slot), [1, 2, 3]);
  }
});

test('the control lands in each slot about equally often', () => {
  // If the random question always sat in the same place, a participant could
  // learn to spot it. Over 3000 draws each slot should get roughly a third.
  const counts = [0, 0, 0];
  for (let i = 0; i < 3000; i += 1) {
    const three = chooseThree({ weights, settings });
    counts[three.find((q) => q.reason === 'baseline_random').slot - 1] += 1;
  }
  for (const c of counts) assert.ok(c > 850 && c < 1150, `slot share ${c}/3000`);
});

test('fewer than three live zones is refused', () => {
  const two = weights.map((w, i) => ({ ...w, isMuted: i > 1 }));
  assert.throws(() => chooseThree({ weights: two, settings }), /Fewer than three/);
});

test('a question is drawn from the chosen zone', () => {
  const prompt = choosePrompt('people', () => 0.99);
  assert.equal(prompt.zoneId, 'people');
  assert.ok(promptsForZone('people').some((p) => p.id === prompt.id));
});
