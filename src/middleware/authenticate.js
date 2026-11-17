/**
 * Reads the bearer token and puts the account on the request.
 *
 * Every route that touches personal data is behind this. The controllers
 * below it never read an account id out of the request body or the URL —
 * they use `req.user.id`, which came from a signed token. That is the single
 * rule that makes it impossible for one participant to ask for another's
 * entries by guessing an id, and it is the application-side counterpart of
 * the row level security policies in the database.
 */
import ApiError from '../utils/ApiError.js';
import { verifyToken } from '../services/auth.service.js';
import * as usersRepo from '../repositories/users.repo.js';

export function authenticate(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return next(ApiError.unauthorized('Log in to continue.'));
  }

  try {
    const payload = verifyToken(token);
    const user = usersRepo.findById(payload.sub);
    if (!user) return next(ApiError.unauthorized('This account no longer exists.'));

    req.user = { id: user.id, email: user.email };
    return next();
  } catch (error) {
    return next(error);
  }
}

export default authenticate;
