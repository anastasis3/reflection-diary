import { Router } from 'express';
import * as controller from '../controllers/account.controller.js';
import authenticate from '../middleware/authenticate.js';
import validate from '../middleware/validate.js';
import { nameSchema } from '../validators/schemas.js';

const router = Router();
router.use(authenticate);

router.get('/consents', controller.consents);
router.post('/consents/ai-processing', controller.grantAiConsent);
router.delete('/consents/ai-processing', controller.withdrawAiConsent);

router.patch('/name', validate({ body: nameSchema }), controller.setName);
router.get('/export', controller.exportData);
router.delete('/', controller.remove);

export default router;
