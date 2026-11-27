/**
 * /api/research — the researcher console's data. Not for participants.
 * Protected by RESEARCH_PASSWORD from .env, sent in the header
 * x-research-password. Without a password in .env the console is off.
 */
import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import config from '../config/index.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as research from '../services/research.service.js';

const digest = (s) => createHash('sha256').update(String(s)).digest();

function researcherOnly(req, _res, next) {
  if (!config.research.password) return next(ApiError.notFound('The researcher console is turned off.'));
  const given = req.get('x-research-password') ?? '';
  if (!timingSafeEqual(digest(given), digest(config.research.password))) {
    return next(ApiError.unauthorized('Wrong researcher password.'));
  }
  return next();
}

const router = Router();
router.use(researcherOnly);

router.get('/summary', asyncHandler(async (_req, res) => {
  res.set('cache-control', 'no-store').json(await research.summary());
}));

router.get('/export.csv', asyncHandler(async (_req, res) => {
  res.set('content-type', 'text/csv; charset=utf-8')
    .set('content-disposition', `attachment; filename="pilot-${new Date().toISOString().slice(0, 10)}.csv"`)
    .send(await research.exportCsv());
}));

export default router;