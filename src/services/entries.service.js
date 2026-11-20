/**
 * Saving an entry — the one flow the whole product is built around.
 *
 * The order of the steps is the design, not an implementation detail:
 *
 *   0. check the question          before anything is stored
 *   1. save the text               the entry is safe from here on
 *   2. link it to the question     picks it too, if the client skipped that
 *   3. analyse it                  only now does the text leave the app (NFR-7)
 *   4. move the weights            only if step 3 produced scores
 *
 * Steps 3 and 4 can fail without taking step 1 with them. If the classifier
 * is unavailable, the entry stays, the profile does not move, and the
 * interface says so (screen S-04b). Nobody loses what they wrote because a
 * service was down.
 */
import ApiError from '../utils/ApiError.js';
import {
  entriesRepo, promptsShownRepo, consentsRepo, weightsRepo,
} from '../repositories/index.js';
import { classify } from './classification.service.js';
import { applyEntryScores, applyChoiceBoost } from './adaptation.service.js';
import { ownQuestion } from './questions.service.js';
import { getZone } from '../data/zones.js';
import { getPrompt } from '../data/prompts.js';
import { toDay } from '../utils/dates.js';

/** An entry as the API returns it. */
export function present(entry) {
  return {
    id: entry.id,
    text: entry.text,
    status: entry.status,
    createdAt: entry.createdAt,
    classifiedAt: entry.classifiedAt,
    day: entry.createdAt.slice(0, 10),
    zone: entry.topZoneId ? getZone(entry.topZoneId) : null,
    scores: entry.scores,
    prompt: entry.question
      ? {
          promptShownId: entry.question.promptShownId,
          zoneId: entry.question.zoneId,
          zone: getZone(entry.question.zoneId),
          text: entry.question.promptText ?? getPrompt(entry.question.promptId)?.text ?? null,
          relevanceRating: entry.question.relevanceRating,
        }
      : null,
  };
}

export async function create(userId, { text, promptShownId }) {
  // --- 0. the question must be today's, this person's, and still open ------
  let shown = null;
  if (promptShownId) {
    shown = await ownQuestion(userId, promptShownId);
    if (shown.shownOn !== toDay()) {
      throw ApiError.conflict('QUESTION_EXPIRED', 'That question was for another day.');
    }
    if (shown.wasAnswered) {
      throw ApiError.conflict('ALREADY_ANSWERED', 'You have already answered this question today.');
    }
  }

  // --- 1. the text is saved before anything else can go wrong -------------
  const entry = await entriesRepo.create({ userId, text: text.trim() });

  // --- 2. tie it to the question it answers -------------------------------
  let boost = null;
  if (shown) {
    if (!shown.wasChosen) {
      // The client went straight to saving without the "choose" call. The
      // pick still happened, so it is recorded and moves the zone once.
      const { first } = await promptsShownRepo.choose(shown.id);
      if (first) boost = await applyChoiceBoost(userId, shown.zoneId);
    }
    await promptsShownRepo.linkEntry(shown.id, entry.id);
  }

  // --- 3. analysis, only with consent and only now ------------------------
  if (!(await consentsRepo.isActive(userId, 'ai_processing'))) {
    // Consent withdrawn in Settings: the entry is kept, unanalysed, and the
    // profile deliberately stops moving.
    return { entry: present(await entriesRepo.findById(entry.id)), analysis: 'skipped_no_consent', weightChanges: [], boost };
  }

  let scores;
  try {
    scores = await classify(entry.text);
  } catch {
    await entriesRepo.markFailed(entry.id);
    return { entry: present(await entriesRepo.findById(entry.id)), analysis: 'failed', weightChanges: [], boost };
  }

  await entriesRepo.saveScores(entry.id, scores);

  // --- 4. the profile moves ------------------------------------------------
  const weightChanges = await applyEntryScores(userId, scores);

  return {
    entry: present(await entriesRepo.findById(entry.id)),
    analysis: 'classified',
    weightChanges: weightChanges.map((c) => ({
      ...c,
      zone: getZone(c.zoneId),
      delta: Math.round((c.to - c.from) * 1000) / 1000,
    })),
    boost: boost ? { zone: getZone(boost.zoneId), from: boost.from, to: boost.to } : null,
  };
}

export async function list(userId, filters) {
  return (await entriesRepo.listForUser(userId, filters)).map(present);
}

export async function getById(userId, entryId) {
  const entry = await entriesRepo.findById(entryId);
  if (!entry || entry.userId !== userId) throw ApiError.notFound('Entry not found.');
  return present(entry);
}

/** Everything the Today screen needs after a save, in one object. */
export async function todaySummary(userId) {
  return {
    entryCount: await entriesRepo.countForUser(userId),
    weights: await weightsRepo.listForUser(userId),
  };
}

export default { create, list, getById, present, todaySummary };
