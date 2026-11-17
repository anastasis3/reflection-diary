/**
 * Saving an entry — the one flow the whole product is built around.
 *
 * The order of the steps is the design, not an implementation detail:
 *
 *   1. save the text               the entry is safe from here on
 *   2. link it to the question     so the study knows which question it answers
 *   3. analyse it                  only now does the text leave the app (NFR-7)
 *   4. move the weights            only if step 3 produced scores
 *
 * Steps 3 and 4 can fail without taking step 1 with them. If the classifier
 * is unavailable, the entry stays, the profile does not move, and the
 * interface says so (screen S-04b). The participant never loses what they
 * wrote because a service was down.
 */
import ApiError from '../utils/ApiError.js';
import * as entriesRepo from '../repositories/entries.repo.js';
import * as promptsShownRepo from '../repositories/promptsShown.repo.js';
import * as consentsRepo from '../repositories/consents.repo.js';
import * as weightsRepo from '../repositories/weights.repo.js';
import { classify } from './classification.service.js';
import { applyEntryScores } from './adaptation.service.js';
import { getZone } from '../data/zones.js';
import { getPrompt } from '../data/prompts.js';

/** Adds the zone, the scores and the question to a stored entry row. */
export function present(entry) {
  const scores = entriesRepo.scoresFor(entry.id);
  const topZoneId = entriesRepo.topZoneOf(entry.id);
  const shown = promptsShownRepo
    .listForUser(entry.userId)
    .find((p) => p.entryId === entry.id);

  return {
    id: entry.id,
    text: entry.text,
    status: entry.status,
    createdAt: entry.createdAt,
    classifiedAt: entry.classifiedAt,
    day: entry.createdAt.slice(0, 10),
    zone: topZoneId ? getZone(topZoneId) : null,
    scores,
    prompt: shown
      ? {
          promptShownId: shown.id,
          zoneId: shown.zoneId,
          text: getPrompt(shown.promptId)?.text ?? null,
          relevanceRating: shown.relevanceRating,
        }
      : null,
  };
}

export async function create(userId, { text, promptShownId }) {
  // --- 1. the text is saved before anything else can go wrong -------------
  const entry = entriesRepo.create({ userId, text: text.trim() });

  // --- 2. tie it to the question it answers -------------------------------
  if (promptShownId) {
    const shown = promptsShownRepo.findById(promptShownId);
    if (!shown || shown.userId !== userId) {
      throw ApiError.notFound('That question does not belong to your account.');
    }
    promptsShownRepo.linkEntry(promptShownId, entry.id);
  }

  // --- 3. analysis, only with consent and only now ------------------------
  if (!consentsRepo.isActive(userId, 'ai_processing')) {
    // Consent was withdrawn in Settings. The entry is kept and stays
    // unanalysed; the profile deliberately stops moving.
    return {
      entry: present(entriesRepo.findById(entry.id)),
      analysis: 'skipped_no_consent',
      weightChanges: [],
    };
  }

  let scores;
  try {
    scores = await classify(entry.text);
  } catch {
    entriesRepo.markFailed(entry.id);
    return {
      entry: present(entriesRepo.findById(entry.id)),
      analysis: 'failed',
      weightChanges: [],
    };
  }

  entriesRepo.saveScores(entry.id, scores);

  // --- 4. the profile moves ------------------------------------------------
  const weightChanges = applyEntryScores(userId, scores);

  return {
    entry: present(entriesRepo.findById(entry.id)),
    analysis: 'classified',
    weightChanges: weightChanges.map((c) => ({
      ...c,
      zone: getZone(c.zoneId),
      delta: Math.round((c.to - c.from) * 1000) / 1000,
    })),
  };
}

export function list(userId, filters) {
  return entriesRepo.listForUser(userId, filters).map(present);
}

export function getById(userId, entryId) {
  const entry = entriesRepo.findById(entryId);
  if (!entry || entry.userId !== userId) throw ApiError.notFound('Entry not found.');
  return present(entry);
}

/** Everything the Today screen needs after a save, in one object. */
export function todaySummary(userId) {
  return {
    entryCount: entriesRepo.countForUser(userId),
    weights: weightsRepo.listForUser(userId),
  };
}

export default { create, list, getById, present, todaySummary };
