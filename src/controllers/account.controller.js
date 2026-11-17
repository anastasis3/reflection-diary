import asyncHandler from '../utils/asyncHandler.js';
import * as accountService from '../services/account.service.js';

/** GET /api/account/consents */
export const consents = asyncHandler(async (req, res) => {
  res.json({ consents: accountService.listConsents(req.user.id) });
});

/** DELETE /api/account/consents/ai-processing — stop the analysis. */
export const withdrawAiConsent = asyncHandler(async (req, res) => {
  res.json({ consents: accountService.withdrawAiConsent(req.user.id) });
});

/** POST /api/account/consents/ai-processing — give it again. */
export const grantAiConsent = asyncHandler(async (req, res) => {
  res.json({ consents: accountService.grantAiConsent(req.user.id) });
});

/** GET /api/account/export — the participant's own copy of everything. */
export const exportData = asyncHandler(async (req, res) => {
  const data = accountService.exportData(req.user.id);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="reflection-diary-${data.exportedAt.slice(0, 10)}.json"`,
  );
  res.json(data);
});

/** DELETE /api/account — remove the account and everything attached to it. */
export const remove = asyncHandler(async (req, res) => {
  res.json(accountService.deleteAccount(req.user.id));
});
