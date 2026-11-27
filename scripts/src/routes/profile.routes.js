import { Router } from 'express';
import * as controller from '../controllers/profile.controller.js';
import validate from '../middleware/validate.js';
import authenticate from '../middleware/authenticate.js';
import { updateWeightsSchema, trendQuerySchema, snapshotQuerySchema } from '../validators/schemas.js';

const router = Router();
router.use(authenticate);

router.get('/', controller.get);
router.get('/insight', controller.insight);
router.get('/history', validate({ query: snapshotQuerySchema }), controller.history);
router.patch('/weights', validate({ body: updateWeightsSchema }), controller.updateWeights);
router.get('/trend', validate({ query: trendQuerySchema }), controller.trend);
router.get('/changes', controller.changes);

export default router;
