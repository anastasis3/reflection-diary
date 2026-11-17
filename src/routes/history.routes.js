import { Router } from 'express';
import * as controller from '../controllers/history.controller.js';
import validate from '../middleware/validate.js';
import authenticate from '../middleware/authenticate.js';
import { monthQuerySchema, dayParamSchema } from '../validators/schemas.js';

const router = Router();
router.use(authenticate);

router.get('/summary', controller.summary);
router.get('/calendar', validate({ query: monthQuerySchema }), controller.calendar);
router.get('/day/:day', validate({ params: dayParamSchema }), controller.day);

export default router;
