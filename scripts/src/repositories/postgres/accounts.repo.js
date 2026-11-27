/**
 * Accounts — Supabase driver.
 *
 * E-mail and password live in Supabase Auth (auth.users). The application
 * never sees a password hash: it asks Auth to create a user, to check a
 * password, or to delete a user. Deleting the auth user removes the profile
 * and, through ON DELETE CASCADE, every row that belongs to it.
 *
 * Users are created already confirmed (email_confirm: true). The pilot has no
 * e-mail confirmation step; if one is wanted later, drop that flag and turn on
 * "Confirm email" in Supabase → Authentication → Sign In / Providers.
 */
import { adminClient, freshClient } from '../../data/supabase.js';
import ApiError from '../../utils/ApiError.js';

const pub = (u) => (u ? { id: u.id, email: u.email, createdAt: u.created_at } : null);

export async function createUser({ email, password }) {
  const { data, error } = await adminClient().auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password,
    email_confirm: true,
  });
  if (error) {
    if (error.code === 'email_exists' || error.status === 422) {
      throw ApiError.conflict('EMAIL_TAKEN', 'An account with this e-mail already exists.');
    }
    throw new Error(`Supabase Auth could not create the user: ${error.message}`);
  }
  return pub(data.user);
}

export async function verifyCredentials(email, password) {
  const { data, error } = await freshClient().auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password,
  });
  if (error) {
    if (error.status === 400) return null; // wrong e-mail or password
    throw new Error(`Supabase Auth is unavailable: ${error.message}`);
  }
  return pub(data.user);
}

/**
 * Supabase Auth sends the e-mail. The link goes through Supabase and lands on
 * redirectTo with #access_token=…&type=recovery. Supabase answers the same for
 * an unknown address, so nothing here reveals who has an account.
 * The address must be listed in Authentication → URL Configuration → Redirect URLs.
 */
export async function sendPasswordReset(email, redirectTo) {
  const { error } = await freshClient().auth.resetPasswordForEmail(String(email).trim().toLowerCase(), { redirectTo });
  if (error) {
    if (error.status === 429) {
      throw new ApiError(429, 'TOO_MANY_REQUESTS', 'Too many reset e-mails were sent. Please try again later.');
    }
    throw new Error(`Supabase Auth could not send the reset e-mail: ${error.message}`);
  }
}

/** The account whose password was changed, or null if the link's token is not valid. */
export async function resetPassword(accessToken, password) {
  const { data, error } = await adminClient().auth.getUser(accessToken);
  if (error || !data?.user) return null;
  const { data: updated, error: updateError } = await adminClient().auth.admin.updateUserById(data.user.id, { password });
  if (updateError) {
    if (updateError.code === 'same_password' || updateError.code === 'weak_password') {
      throw ApiError.validation([{ field: 'password', message: 'Choose a different, stronger password.' }]);
    }
    throw new Error(`Supabase Auth could not change the password: ${updateError.message}`);
  }
  return pub(updated.user);
}

export async function findById(id) {
  const { data, error } = await adminClient().auth.admin.getUserById(id);
  if (error) return null;
  return pub(data.user);
}

export async function remove(id) {
  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) throw new Error(`Supabase Auth could not delete the user: ${error.message}`);
}

export default { createUser, verifyCredentials, sendPasswordReset, resetPassword, findById, remove };
