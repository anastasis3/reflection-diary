import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import * as selectionService from '../services/selection.service.js';
import * as promptsShownRepo from '../repositories/promptsShown.repo.js';
import { getPrompt } from '../data/prompts.js';
import { getZone } from '../data/zones.js';

/** GET /api/prompts/today — the question of the day. */
export const today = asyncHandler(async (req, res) => {
  const { shown, isNew } = selectionService.questionOfTheDay(req.user.id);
  const prompt = getPrompt(shown.promptId);

  res.json({
    promptShownId: shown.id,
    text: prompt?.text ?? null,
    zone: getZone(shown.zoneId),
    shownAt: shown.shownAt,
    wasAnswered: shown.wasAnswered,
    relevanceRating: shown.relevanceRating,
    isNew,
    // The selection reason is NOT sent to the browser. A participant who could
    // see that today's question was drawn at random would rate it differently,
    // and the comparison the study rests on would be worthless. It is stored
    // and read only from the database, for the analysis.
  });
});

/** GET /api/prompts/:id/explanation — the "Why this question?" text. */
export const explanation = asyncHandler(async (req, res) => {
  const shown = promptsShownRepo.findById(req.validated.params.id);
  if (!shown || shown.userId !== req.user.id) {
    throw ApiError.notFound('That question does not belong to your account.');
  }

  promptsShownRepo.markExplanationOpened(shown.id);
  const explained = selectionService.explain(req.user.id, shown);

  res.json({
    zone: getZone(shown.zoneId),
    weight: explained.weight,
    text: explained.text,
  });
});

/** POST /api/prompts/:id/rating — "was this question relevant to you?" */
export const rate = asyncHandler(async (req, res) => {
  const shown = promptsShownRepo.findById(req.validated.params.id);
  if (!shown || shown.userId !== req.user.id) {
    throw ApiError.notFound('That question does not belong to your account.');
  }

  const updated = promptsShownRepo.rate(shown.id, req.validated.body.relevant);
  res.json({ promptShownId: updated.id, relevanceRating: updated.relevanceRating, ratedAt: updated.ratedAt });
});
