/**
 * Registration, log in, and the access token.
 *
 * Registration does four things in one step, because an account that exists
 * without them is not usable: it creates the credentials, the profile row, the
 * two consent rows, and nothing else — the nine weights are created later, by
 * the onboarding quiz, from the participant's own answers.
 */
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import ApiError from '../utils/ApiError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import * as usersRepo from '../repositories/users.repo.js';
import * as profilesRepo from '../repositories/profiles.repo.js';
import * as consentsRepo from '../repositories/consents.repo.js';

/** What the client is allowed to see about an account. Never the hash. */
export function publicUser(user) {
  const profile = profilesRepo.findById(user.id);
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    onboardingCompleted: Boolean(profile?.onboardingCompletedAt),
    aiProcessingConsent: consentsRepo.isActive(user.id, 'ai_processing'),
  };
}

export function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.auth.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please log in again.');
  }
}

export async function register({ email, password, acceptPrivacyNotice, acceptAiProcessing }) {
  if (usersRepo.findByEmail(email)) {
    // Deliberately explicit. Hiding it would not protect anything here: the
    // registration form has to tell the person why the button does nothing.
    throw ApiError.conflict('EMAIL_TAKEN', 'An account with this e-mail already exists.');
  }
  if (!acceptPrivacyNotice || !acceptAiProcessing) {
    throw ApiError.badRequest(
      'Both consents are required: the diary cannot choose questions without analysing the text of your entries.',
    );
  }

  const passwordHash = await hashPassword(password);
  const user = usersRepo.create({ email, passwordHash });

  profilesRepo.create(user.id);
  consentsRepo.grant(user.id, 'study');
  consentsRepo.grant(user.id, 'ai_processing');

  return { user: publicUser(user), token: issueToken(user) };
}

export async function login({ email, password }) {
  const user = usersRepo.findByEmail(email);

  // The same message either way, so the response cannot be used to find out
  // which e-mail addresses are registered.
  const invalid = ApiError.unauthorized('E-mail or password is incorrect.');
  if (!user) {
    // Still spend the time hashing, so a missing account is not detectably
    // faster than a wrong password.
    await hashPassword(password);
    throw invalid;
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw invalid;

  return { user: publicUser(user), token: issueToken(user) };
}

export function currentUser(userId) {
  const user = usersRepo.findById(userId);
  if (!user) throw ApiError.unauthorized('This account no longer exists.');
  return publicUser(user);
}

export default { register, login, currentUser, issueToken, verifyToken, publicUser };
