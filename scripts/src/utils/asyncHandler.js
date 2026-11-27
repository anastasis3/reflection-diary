/**
 * Wraps an async route handler so that a rejected promise reaches the global
 * error middleware instead of becoming an unhandled rejection.
 *
 * Express 5 forwards rejections on its own, but wrapping is explicit and keeps
 * the controllers readable: every handler is written as if nothing could go
 * wrong, and every failure ends up in one place.
 */
export function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export default asyncHandler;
