/**
 * Reads the bearer token and puts the account on the request.
 *
 * Every route that touches personal data is behind this. The controllers
 * never read an account id from the body or the URL — they use `req.user.id`,
 * which came from a signed token. That single rule is what stops one
 * participant asking for another's entries by guessing an id; it is the
 * application-side twin of the row level security policies in the database.
 *
 * The account is checked against the profiles table, not against the auth
 * provider: a profile exists exactly as long as the account does (it is
 * deleted with it), and a local query is much cheaper than a call to
 * Supabase Auth on every request.
 */
import ApiError from '../utils/ApiError.js';
import { verifyToken } from '../services/auth.service.js';
import { profilesRepo } from '../repositories/index.js';

export async function authenticate(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return next(ApiError.unauthorized('Log in to continue.'));
  }

  try {
    const payload = verifyToken(token);
    const profile = await profilesRepo.findById(payload.sub);
    if (!profile) return next(ApiError.unauthorized('This account no longer exists.'));

    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (error) {
    return next(error);
  }
}

export default authenticate;
