/**
 * Turns a Zod schema into Express middleware.
 *
 * On success the parsed values are put on `req.validated`, never back onto
 * `req.query` — in Express 5 that property is a getter and assigning to it
 * throws. Controllers therefore always read `req.validated.*`, which also
 * makes it obvious at a glance that the value has been checked.
 *
 * On failure it produces one 422 with a list of fields, which is exactly what
 * the forms in the interface need to mark the inputs that are wrong.
 */
import ApiError from '../utils/ApiError.js';

export function validate(schemas) {
  return function validateRequest(req, _res, next) {
    req.validated = req.validated ?? {};
    const fieldErrors = [];

    for (const source of ['body', 'params', 'query']) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source] ?? {});
      if (result.success) {
        req.validated[source] = result.data;
        continue;
      }
      for (const issue of result.error.issues) {
        fieldErrors.push({
          field: issue.path.join('.') || source,
          message: issue.message,
          in: source,
        });
      }
    }

    if (fieldErrors.length > 0) return next(ApiError.validation(fieldErrors));
    return next();
  };
}

export default validate;
