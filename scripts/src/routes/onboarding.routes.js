import { Router } from 'express';
import * as controller from '../controllers/onboarding.controller.js';
import validate from '../middleware/validate.js';
import authenticate from '../middleware/authenticate.js';
import { onboardingAnswerSchema } from '../validators/schemas.js';

const router = Router();

// The whole quiz is personal data, so the whole router is behind the token.
router.use(authenticate);

router.get('/', controller.getState);
router.post('/answers', validate({ body: onboardingAnswerSchema }), controller.saveAnswer);
router.post('/complete', controller.complete);

export default router;
