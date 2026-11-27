/**
 * The adaptation model: how an entry moves the topic profile.
 *
 * For every zone:
 *
 *     new = alpha * score + (1 - alpha) * old        alpha = 0.3
 *
 * This is an exponential moving average. Two properties matter and both are
 * deliberate:
 *
 *   - it is slow. A single entry moves a weight by at most a third of the
 *     distance to the new evidence, so one unusual day does not rewrite the
 *     profile, and the participant sees a profile that is recognisably theirs
 *     from one day to the next;
 *   - it is reversible. Nothing is accumulated, so a topic whose mentions
 *     become weaker falls back on its own, without any special "decay" rule.
 *
 * Two zones are skipped. A zone the entry says nothing about is left alone —
 * silence is not evidence, and treating it as a score of zero collapses the
 * whole profile within a month (see `applyEntryScores`). And a muted zone is
 * left alone entirely: the participant said not to ask about it, and silently
 * moving its weight behind their back would make the Profile screen lie.
 */
import config from '../config/index.js';
import { weightsRepo } from '../repositories/index.js';

/** The update rule itself, as a pure function. */
export function nextWeight(oldWeight, score, alpha = config.adaptation.alpha) {
  const next = alpha * score + (1 - alpha) * oldWeight;
  return Math.round(Math.min(1, Math.max(0, next)) * 1000) / 1000;
}

/**
 * Applies one classified entry to the participant's weights.
 *
 * @returns {Array<{zoneId: string, from: number, to: number}>} what moved
 */
export async function applyEntryScores(userId, scores, { alpha = config.adaptation.alpha } = {}) {
  const changes = [];

  for (const row of await weightsRepo.listForUser(userId)) {
    if (row.isMuted) continue;

    const score = scores[row.zoneId];

    // No evidence is not evidence of irrelevance. A zone the entry says
    // nothing about is left untouched, rather than pulled towards zero.
    //
    // This matters more than it looks. A person writes about two or three
    // zones a day, so if silence pulled a weight down, every zone would be
    // dragged towards zero on roughly eight days in nine and the whole
    // profile would collapse within a month — which is exactly what happened
    // before this check existed. A weight falls when the entries that *do*
    // mention the zone score it low, which is a real signal; it does not fall
    // because today happened to be about something else.
    if (!score) continue;

    const from = row.weight;
    const to = nextWeight(from, score, alpha);
    if (to === from) continue;

    await weightsRepo.set(userId, row.zoneId, { weight: to, source: 'learned' });
    changes.push({ zoneId: row.zoneId, from, to });
  }

  // Largest movement first: this is the order the interface reports them in.
  return changes.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
}

/**
 * A manual edit from the Profile screen (US-5.3).
 *
 * The participant may set a value by hand and may mute zones, but at least
 * three must stay active or there is nothing left to ask about. The check
 * lives here rather than in the controller because it is a rule of the model,
 * not of the HTTP layer.
 */
export async function applyManualEdit(userId, edits) {
  const current = await weightsRepo.listForUser(userId);
  const after = new Map(current.map((w) => [w.zoneId, { ...w }]));

  for (const edit of edits) {
    const row = after.get(edit.zoneId);
    if (!row) continue;
    if (edit.weight !== undefined) row.weight = edit.weight;
    if (edit.isMuted !== undefined) row.isMuted = edit.isMuted;
  }

  const activeCount = [...after.values()].filter((w) => !w.isMuted).length;
  if (activeCount < config.adaptation.minActiveZones) {
    return {
      ok: false,
      code: 'TOO_FEW_ACTIVE_ZONES',
      message: `At least ${config.adaptation.minActiveZones} zones must stay on — the diary needs something to ask about.`,
    };
  }

  const changes = [];
  for (const edit of edits) {
    const before = current.find((w) => w.zoneId === edit.zoneId);
    if (!before) continue;
    const row = after.get(edit.zoneId);
    if (before.weight === row.weight && before.isMuted === row.isMuted) continue;

    await weightsRepo.set(userId, edit.zoneId, {
      weight: row.weight,
      isMuted: row.isMuted,
      source: 'manual',
    });
    changes.push({ zoneId: edit.zoneId, from: before.weight, to: row.weight });
  }

  return { ok: true, changes };
}

/**
 * Picking a question is a small signal of its own (source = choice).
 *
 * When the participant picks one of the three questions, its zone moves up
 * by CHOICE_BOOST (0.03) once, before anything is written. A concern that is
 * new — a broken leg, say — then reaches the top three a day or two sooner
 * than it would from entries alone. The step is small on purpose: three
 * picks in a row move a weight by less than one entry about it does.
 *
 * Muted zones are left alone, as everywhere else in the model.
 *
 * @returns {{zoneId: string, from: number, to: number} | null}
 */
export async function applyChoiceBoost(userId, zoneId, boost = config.adaptation.choiceBoost) {
  const row = await weightsRepo.find(userId, zoneId);
  if (!row || row.isMuted || boost <= 0) return null;
  const to = Math.round(Math.min(1, row.weight + boost) * 1000) / 1000;
  if (to === row.weight) return null;
  await weightsRepo.set(userId, zoneId, { weight: to, source: 'choice' });
  return { zoneId, from: row.weight, to };
}

export default { nextWeight, applyEntryScores, applyManualEdit, applyChoiceBoost };
