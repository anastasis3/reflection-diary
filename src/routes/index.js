/**
 * The API's table of contents.
 *
 * Reading this file should be enough to know what the application can do. Each
 * line is one resource; the file it points at lists that resource's endpoints
 * and the validation each one applies.
 */
import { Router } from 'express';

import authRoutes from './auth.routes.js';
import onboardingRoutes from './onboarding.routes.js';
import promptsRoutes from './prompts.routes.js';
import entriesRoutes from './entries.routes.js';
import profileRoutes from './profile.routes.js';
import historyRoutes from './history.routes.js';
import accountRoutes from './account.routes.js';
import researchRoutes from './research.routes.js';
import * as zonesController from '../controllers/zones.controller.js';

const router = Router();

/** Liveness check. Used by CI and by any deployment platform. */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()), time: new Date().toISOString() });
});

router.get('/zones', zonesController.list); //  the nine zones — public
router.use('/auth', authRoutes); //             register, log in, who am I
router.use('/onboarding', onboardingRoutes); // the nine-statement quiz
router.use('/prompts', promptsRoutes); //       question of the day, rating
router.use('/entries', entriesRoutes); //       writing and reading entries
router.use('/profile', profileRoutes); //       the nine weights and trends
router.use('/history', historyRoutes); //       calendar, totals, one day
router.use('/account', accountRoutes); //       consent, export, deletion
router.use('/research', researchRoutes); //     researcher console (password)

export default router;
