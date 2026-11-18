import asyncHandler from '../utils/asyncHandler.js';
import * as historyService from '../services/history.service.js';

/** GET /api/history/summary — totals per zone, for the filter pills. */
export const summary = asyncHandler(async (req, res) => {
  res.json(await historyService.zoneCounts(req.user.id));
});

/** GET /api/history/calendar?month=2026-11 — the month heat map. */
export const calendar = asyncHandler(async (req, res) => {
  res.json(await historyService.calendar(req.user.id, req.validated.query.month));
});

/** GET /api/history/day/2026-11-17 — one day in full. */
export const day = asyncHandler(async (req, res) => {
  res.json(await historyService.day(req.user.id, req.validated.params.day));
});
