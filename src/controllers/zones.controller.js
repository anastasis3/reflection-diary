import asyncHandler from '../utils/asyncHandler.js';
import { ZONES } from '../data/zones.js';

/**
 * GET /api/zones — the catalogue of the nine zones.
 *
 * Public: the front-end needs the names and colours before anyone has logged
 * in, and there is nothing personal in it. The colours live here rather than
 * only in the stylesheet so that the chart, the calendar dots and the filter
 * pills all read them from one source.
 */
export const list = asyncHandler(async (_req, res) => {
  res.json({ zones: ZONES });
});
