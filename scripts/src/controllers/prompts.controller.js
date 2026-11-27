/**
 * The three questions of the day. Thin: validated input in, one service
 * call, JSON out. The rules live in services/questions.service.js.
 */
import asyncHandler from '../utils/asyncHandler.js';
import * as questions from '../services/questions.service.js';

/** GET /api/prompts/today — today's three questions (created on first call). */
export const today = asyncHandler(async (req, res) => {
  res.json(await questions.today(req.user.id));
});

/** POST /api/prompts/:id/choose — the participant picked this one to write about. */
export const choose = asyncHandler(async (req, res) => {
  res.json(await questions.choose(req.user.id, req.validated.params.id));
});

/** GET /api/prompts/:id/explanation — the "Why this question?" text. */
export const explanation = asyncHandler(async (req, res) => {
  res.json(await questions.explanation(req.user.id, req.validated.params.id));
});

/** POST /api/prompts/:id/rating — "was this question relevant to you?" (after answering) */
export const rate = asyncHandler(async (req, res) => {
  res.json(await questions.rate(req.user.id, req.validated.params.id, req.validated.body.relevant));
});
