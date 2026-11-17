import asyncHandler from '../utils/asyncHandler.js';
import * as onboardingService from '../services/onboarding.service.js';

export const getState = asyncHandler(async (req, res) => {
  res.json(onboardingService.getState(req.user.id));
});

export const saveAnswer = asyncHandler(async (req, res) => {
  const { zoneId, value } = req.validated.body;
  res.json(onboardingService.saveAnswer(req.user.id, zoneId, value));
});

export const complete = asyncHandler(async (req, res) => {
  res.json(onboardingService.complete(req.user.id));
});
