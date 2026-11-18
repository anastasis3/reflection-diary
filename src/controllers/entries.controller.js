import asyncHandler from '../utils/asyncHandler.js';
import * as entriesService from '../services/entries.service.js';

/** POST /api/entries — save an entry, then analyse it. */
export const create = asyncHandler(async (req, res) => {
  const result = await entriesService.create(req.user.id, req.validated.body);
  // 201: the entry exists even when `analysis` says the classifier failed.
  res.status(201).json(result);
});

/** GET /api/entries?zone=&from=&to= */
export const list = asyncHandler(async (req, res) => {
  const { zone, from, to } = req.validated.query;
  res.json({ entries: await entriesService.list(req.user.id, { zoneId: zone, from, to }) });
});

/** GET /api/entries/:id */
export const getOne = asyncHandler(async (req, res) => {
  res.json({ entry: await entriesService.getById(req.user.id, req.validated.params.id) });
});
