/**
 * The one place an error turns into a response.
 *
 * No controller sends an error itself. They throw, Express routes the throw
 * here, and the shape of an error response is therefore identical everywhere:
 *
 *     { "error": { "code": "...", "message": "...", "details": [...] } }
 *
 * An ApiError was anticipated by the code, so its message is written for the
 * participant and is safe to show. Anything else is a bug: it is logged with
 * its stack on the server and answered with a flat 500, because an unexpected
 * message may contain a file path, a query or a value from someone's entry.
 */
import ApiError from '../utils/ApiError.js';
import config from '../config/index.js';

// eslint-disable-next-line no-unused-vars -- Express needs all four parameters
export function errorHandler(error, req, res, _next) {
  if (error instanceof ApiError) {
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }

  // Body parser failures arrive as a SyntaxError with a status.
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      error: { code: 'MALFORMED_JSON', message: 'The request body is not valid JSON.' },
    });
  }

  if (!config.isTest) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Your data is safe — please try again.',
    },
  });
}

export default errorHandler;
