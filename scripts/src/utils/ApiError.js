/**
 * The one error type the application throws on purpose.
 *
 * Anything that reaches the global error handler as an ApiError is a situation
 * the code anticipated, and its `status`, `code` and `message` are safe to send
 * to the client. Anything else is a bug, and the handler answers 500 without
 * leaking its message. That split is what keeps error responses predictable.
 */
export class ApiError extends Error {
  /**
   * @param {number} status  HTTP status code
   * @param {string} code    stable machine-readable code, e.g. EMAIL_TAKEN
   * @param {string} message human-readable message, shown in the interface
   * @param {object} [details] extra fields, e.g. per-field validation errors
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message, details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static validation(details) {
    return new ApiError(422, 'VALIDATION_FAILED', 'Some fields need correcting.', details);
  }

  static unauthorized(message = 'You need to log in to do that.') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'This is not available for your account.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Not found.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(code, message) {
    return new ApiError(409, code, message);
  }
}

export default ApiError;
