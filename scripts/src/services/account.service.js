/**
 * Consent, export and deletion — the Settings screen (S-07).
 *
 * These three are a single subject. A participant who is told they may
 * withdraw, take their data and leave has to be able to do all three without
 * writing to anybody, and deletion has to actually delete.
 */
import {
  accountsRepo, profilesRepo, consentsRepo, onboardingRepo, weightsRepo, entriesRepo,
  promptsShownRepo,
} from '../repositories/index.js';
import { getPrompt } from '../data/prompts.js';
import ApiError from '../utils/ApiError.js';

export async function listConsents(userId) {
  return (await consentsRepo.listForUser(userId)).map((c) => ({
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
export async function withdrawAiConsent(userId) {
  const consent = await consentsRepo.find(userId, 'ai_processing');
  if (!consent) throw ApiError.notFound('No AI processing consent is recorded for this account.');
  await consentsRepo.withdraw(userId, 'ai_processing');
  return listConsents(userId);
}

export async function grantAiConsent(userId) {
  await consentsRepo.grant(userId, 'ai_processing');
  return listConsents(userId);
}

/**
 * The participant's own copy of everything stored about them.
 *
 * It is assembled from the same repositories the application reads, not from a
 * separate summary, so it cannot quietly omit something.
 */
export async function exportData(userId) {
  const user = await accountsRepo.findById(userId);
  if (!user) throw ApiError.notFound('Account not found.');

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      profile: await profilesRepo.findById(userId),
    },
    consents: await listConsents(userId),
    onboardingAnswers: await onboardingRepo.listForUser(userId),
    weights: await weightsRepo.listForUser(userId),
    weightHistory: await weightsRepo.historyForUser(userId),
    weightChanges: await weightsRepo.changesForUser(userId),
    entries: (await entriesRepo.listForUser(userId)).map(({ question, ...entry }) => entry),
    // The participant's own data includes why each question was offered:
    // the export is read after the fact, so it cannot bias a choice.
    questionsShown: (await promptsShownRepo.listForUser(userId)).map((p) => ({
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
export async function deleteAccount(userId) {
  const before = {
    entries: await entriesRepo.countForUser(userId),
    questionsShown: (await promptsShownRepo.listForUser(userId)).length,
    weights: (await weightsRepo.listForUser(userId)).length,
  };

  // With Supabase the last line alone would do: deleting the auth user
  // cascades through every table. The explicit steps keep both drivers on
  // the same path and make the order visible.
  await promptsShownRepo.removeAllForUser(userId);
  await entriesRepo.removeAllForUser(userId);
  await weightsRepo.removeAllForUser(userId);
  await onboardingRepo.removeAllForUser(userId);
  await consentsRepo.removeAllForUser(userId);
  await profilesRepo.remove(userId);
  await accountsRepo.remove(userId);

  return { deleted: true, removed: before };
}

export default {
  listConsents,
  withdrawAiConsent,
  grantAiConsent,
  exportData,
  deleteAccount,
};
