import asyncHandler from '../utils/asyncHandler.js';
import * as profileService from '../services/profile.service.js';

/** GET /api/profile — the nine weights with their movement since the quiz. */
export const get = asyncHandler(async (req, res) => {
  res.json(profileService.getProfile(req.user.id));
});

/** PATCH /api/profile/weights — a manual edit from "Edit zones". */
export const updateWeights = asyncHandler(async (req, res) => {
  res.json(profileService.updateWeights(req.user.id, req.validated.body.zones));
});

/** GET /api/profile/trend?zone=work&days=30 — one zone over time. */
export const trend = asyncHandler(async (req, res) => {
  const { zone, days } = req.validated.query;
  res.json(profileService.trend(req.user.id, zone, days));
});

/** GET /api/profile/changes — the audit trail of every weight change. */
export const changes = asyncHandler(async (req, res) => {
  res.json({ changes: profileService.changeLog(req.user.id) });
});
