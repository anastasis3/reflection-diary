import { Router } from 'express';
import * as controller from '../controllers/prompts.controller.js';
import validate from '../middleware/validate.js';
import authenticate from '../middleware/authenticate.js';
import { idParamSchema, ratingSchema } from '../validators/schemas.js';

const router = Router();
router.use(authenticate);

router.get('/today', controller.today);
router.post('/:id/choose', validate({ params: idParamSchema }), controller.choose);
router.get('/:id/explanation', validate({ params: idParamSchema }), controller.explanation);
router.post(
  '/:id/rating',
  validate({ params: idParamSchema, body: ratingSchema }),
  controller.rate,
);

export default router;
