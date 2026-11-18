/**
 * Registration, log in, and the access token.
 *
 * Registration creates, in one step, everything an account needs to be
 * usable: the account itself (memory driver: a password hash; Supabase: a
 * user in Supabase Auth), the profile row with the optional name, and the two
 * consent rows. The nine weights come later, from the onboarding quiz.
 *
 * The access token is this API's own JWT whichever driver is used. With
 * Supabase, Auth checks the password and the API then issues its token, so
 * every later request is verified locally, without a call to Supabase.
 */
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import ApiError from '../utils/ApiError.js';
import { accountsRepo, profilesRepo, consentsRepo } from '../repositories/index.js';

/** What the client may see about an account. */
export async function publicUser(account) {
  const profile = await profilesRepo.findById(account.id);
  return {
    id: account.id,
    email: account.email,
    // null = no name given; the greeting then simply has no name in it
    displayName: profile?.displayName ?? null,
    createdAt: account.createdAt,
    onboardingCompleted: Boolean(profile?.onboardingCompletedAt),
    aiProcessingConsent: await consentsRepo.isActive(account.id, 'ai_processing'),
  };
}

export function issueToken(account) {
  return jwt.sign({ sub: account.id, email: account.email }, config.auth.jwtSecret, {
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

/** '' or spaces → null; otherwise trimmed. Length is checked by the schema. */
export function cleanName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed === '' ? null : trimmed;
}

export async function register({ email, password, name, acceptPrivacyNotice, acceptAiProcessing }) {
  if (!acceptPrivacyNotice || !acceptAiProcessing) {
    throw ApiError.badRequest(
      'Both consents are required: the diary cannot choose questions without analysing the text of your entries.',
    );
  }

  // Throws EMAIL_TAKEN (409) if the address is already registered. That is
  // deliberately explicit: the form has to say why the button did nothing.
  const account = await accountsRepo.createUser({ email, password });

  await profilesRepo.create(account.id, { displayName: cleanName(name) });
  await consentsRepo.grant(account.id, 'study');
  await consentsRepo.grant(account.id, 'ai_processing');

  return { user: await publicUser(account), token: issueToken(account) };
}

export async function login({ email, password }) {
  const account = await accountsRepo.verifyCredentials(email, password);
  // One message for both cases, so the response cannot be used to find out
  // which e-mail addresses are registered.
  if (!account) throw ApiError.unauthorized('E-mail or password is incorrect.');
  return { user: await publicUser(account), token: issueToken(account) };
}

export async function currentUser(userId, email) {
  const profile = await profilesRepo.findById(userId);
  if (!profile) throw ApiError.unauthorized('This account no longer exists.');
  return publicUser({ id: userId, email, createdAt: profile.createdAt });
}

/** Settings → "What should the diary call you?" */
export async function setName(userId, email, name) {
  await profilesRepo.setDisplayName(userId, cleanName(name));
  return currentUser(userId, email);
}

export default { register, login, currentUser, setName, issueToken, verifyToken, publicUser, cleanName };
