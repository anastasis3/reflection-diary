import asyncHandler from '../utils/asyncHandler.js';
import * as profileService from '../services/profile.service.js';

/** GET /api/profile — the nine weights with their movement since the quiz. */
export const get = asyncHandler(async (req, res) => {
  res.json(await profileService.getProfile(req.user.id));
});

/** GET /api/profile/insight — the one-sentence card above the weights. */
export const insight = asyncHandler(async (req, res) => {
  res.json({ insight: await profileService.insight(req.user.id) });
});

/** GET /api/profile/history?days=7 — the profile on each past day. */
export const history = asyncHandler(async (req, res) => {
  res.json(await profileService.snapshots(req.user.id, req.validated.query.days));
});

/** PATCH /api/profile/weights — a manual edit from "Edit zones". */
export const updateWeights = asyncHandler(async (req, res) => {
  res.json(await profileService.updateWeights(req.user.id, req.validated.body.zones));
});

/** GET /api/profile/trend?zone=work&days=30 — one zone over time. */
export const trend = asyncHandler(async (req, res) => {
  const { zone, days } = req.validated.query;
  res.json(await profileService.trend(req.user.id, zone, days));
});

/** GET /api/profile/changes — the audit trail of every weight change. */
export const changes = asyncHandler(async (req, res) => {
  res.json({ changes: await profileService.changeLog(req.user.id) });
});
