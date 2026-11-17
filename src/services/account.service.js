/**
 * Consent, export and deletion — the Settings screen (S-07).
 *
 * These three are a single subject. A participant who is told they may
 * withdraw, take their data and leave has to be able to do all three without
 * writing to anybody, and deletion has to actually delete.
 */
import * as usersRepo from '../repositories/users.repo.js';
import * as profilesRepo from '../repositories/profiles.repo.js';
import * as consentsRepo from '../repositories/consents.repo.js';
import * as onboardingRepo from '../repositories/onboarding.repo.js';
import * as weightsRepo from '../repositories/weights.repo.js';
import * as entriesRepo from '../repositories/entries.repo.js';
import * as promptsShownRepo from '../repositories/promptsShown.repo.js';
import { getPrompt } from '../data/prompts.js';
import ApiError from '../utils/ApiError.js';

export function listConsents(userId) {
  return consentsRepo.listForUser(userId).map((c) => ({
    purpose: c.purpose,
    textVersion: c.textVersion,
    grantedAt: c.grantedAt,
    withdrawnAt: c.withdrawnAt,
    active: !c.withdrawnAt,
  }));
}

/**
 * Withdrawing consent to analysis.
 *
 * Nothing is deleted and the diary keeps working: entries are still saved, and
 * the profile simply stops changing because nothing is analysed any more.
 */
export function withdrawAiConsent(userId) {
  const consent = consentsRepo.find(userId, 'ai_processing');
  if (!consent) throw ApiError.notFound('No AI processing consent is recorded for this account.');
  consentsRepo.withdraw(userId, 'ai_processing');
  return listConsents(userId);
}

export function grantAiConsent(userId) {
  consentsRepo.grant(userId, 'ai_processing');
  return listConsents(userId);
}

/**
 * The participant's own copy of everything stored about them.
 *
 * It is assembled from the same repositories the application reads, not from a
 * separate summary, so it cannot quietly omit something.
 */
export function exportData(userId) {
  const user = usersRepo.findById(userId);
  if (!user) throw ApiError.notFound('Account not found.');

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      profile: profilesRepo.findById(userId),
    },
    consents: listConsents(userId),
    onboardingAnswers: onboardingRepo.listForUser(userId),
    weights: weightsRepo.listForUser(userId),
    weightHistory: weightsRepo.historyForUser(userId),
    weightChanges: weightsRepo.changesForUser(userId),
    entries: entriesRepo.listForUser(userId).map((entry) => ({
      ...entry,
      scores: entriesRepo.scoresFor(entry.id),
    })),
    questionsShown: promptsShownRepo.listForUser(userId).map((p) => ({
      ...p,
      promptText: getPrompt(p.promptId)?.text ?? null,
    })),
  };
}

/**
 * Deletes the account and everything attached to it.
 *
 * In PostgreSQL this is one DELETE and the foreign keys cascade. Here each
 * collection is cleared explicitly, in the same order, and the count is
 * returned so that the operation can be shown to have done something.
 */
export function deleteAccount(userId) {
  const before = {
    entries: entriesRepo.countForUser(userId),
    questionsShown: promptsShownRepo.listForUser(userId).length,
    weights: weightsRepo.listForUser(userId).length,
  };

  entriesRepo.removeAllForUser(userId);
  promptsShownRepo.removeAllForUser(userId);
  weightsRepo.removeAllForUser(userId);
  onboardingRepo.removeAllForUser(userId);
  consentsRepo.removeAllForUser(userId);
  profilesRepo.remove(userId);
  usersRepo.remove(userId);

  return { deleted: true, removed: before };
}

export default {
  listConsents,
  withdrawAiConsent,
  grantAiConsent,
  exportData,
  deleteAccount,
};
