/**
 * One line per request: method, path, status, duration.
 *
 * It deliberately logs no request body. Bodies here contain diary entries, and
 * writing those into a server log would undo the promise the registration
 * screen makes about where the text goes.
 */
import config from '../config/index.js';

export function requestLogger(req, res, next) {
  if (config.isTest) return next(); // keep the test output readable

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`,
    );
  });
  return next();
}

export default requestLogger;
