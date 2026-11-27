import { Router } from 'express';
import * as controller from '../controllers/entries.controller.js';
import validate from '../middleware/validate.js';
import authenticate from '../middleware/authenticate.js';
import {
  createEntrySchema,
  entryFiltersSchema,
  idParamSchema,
} from '../validators/schemas.js';

const router = Router();
router.use(authenticate);

router.post('/', validate({ body: createEntrySchema }), controller.create);
router.get('/', validate({ query: entryFiltersSchema }), controller.list);
router.get('/:id', validate({ params: idParamSchema }), controller.getOne);

export default router;
