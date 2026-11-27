/**
 * Anything under /api that matched no route.
 *
 * It throws rather than answering, so that a wrong URL produces the same
 * response shape as every other error and the front-end needs no special case.
 */
import ApiError from '../utils/ApiError.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`No endpoint matches ${req.method} ${req.originalUrl}.`));
}

export default notFound;
