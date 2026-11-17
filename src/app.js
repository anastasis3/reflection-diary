/**
 * Assembles the Express application.
 *
 * It is deliberately separate from server.js: this module builds an app and
 * returns it, and never opens a port. That is what lets the integration tests
 * import the real application — the same middleware, the same routes, the same
 * error handling — and drive it over HTTP without starting a server anyone has
 * to remember to stop.
 *
 * The order below is the request's path through the application and matters:
 * CORS and body parsing before anything reads a body, routes next, then the
 * 404, and the error handler last, because Express only treats a middleware
 * with four parameters as an error handler if everything else is already
 * registered.
 */
import path from 'node:path';
import express from 'express';
import cors from 'cors';

import config, { rootDir } from './config/index.js';
import apiRoutes from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';
import notFound from './middleware/notFound.js';
import requestLogger from './middleware/requestLogger.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use(requestLogger);

  // --- cross-origin requests ------------------------------------------------
  // Mounted on /api and nowhere else. The front-end in /public is served by
  // this same process, so it is same-origin and needs no CORS at all; putting
  // the check in front of the static files instead would make the application
  // refuse to serve its own stylesheets whenever the port changed.
  //
  // An origin that is not on the list gets the response without the
  // Access-Control-Allow-Origin header, and the browser refuses it. That is
  // what CORS is: a rule the browser enforces. Throwing here instead would
  // turn a policy decision into a 500 and tell the caller nothing useful.
  const corsPolicy = cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // same-origin, curl, a test
      return callback(null, config.corsOrigins.includes(origin));
    },
    credentials: true,
  });

  // --- the API --------------------------------------------------------------
  // The limit is generous for an entry and small enough that a large body
  // cannot be used to exhaust memory.
  app.use('/api', corsPolicy, express.json({ limit: '256kb' }), apiRoutes);
  app.use('/api', notFound); // only /api 404s as JSON

  // --- the front-end and the API documentation ------------------------------
  app.use('/docs', express.static(path.join(rootDir, 'docs')));
  app.use(express.static(path.join(rootDir, 'public')));

  // The front-end is a single page with a hash router, so any other GET that
  // is not a file returns index.html. Written as a middleware rather than a
  // wildcard route because Express 5 changed wildcard path syntax.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    return res.sendFile(path.join(rootDir, 'public', 'index.html'));
  });

  // --- errors, last ---------------------------------------------------------
  app.use(errorHandler);

  return app;
}

export default createApp;
