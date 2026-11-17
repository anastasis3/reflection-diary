import { Router } from 'express';
import * as controller from '../controllers/auth.controller.js';
import validate from '../middleware/validate.js';
import authenticate from '../middleware/authenticate.js';
import { registerSchema, loginSchema } from '../validators/schemas.js';

const router = Router();

router.post('/register', validate({ body: registerSchema }), controller.register);
router.post('/login', validate({ body: loginSchema }), controller.login);
router.get('/me', authenticate, controller.me);

export default router;
