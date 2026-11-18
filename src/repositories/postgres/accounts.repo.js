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

export async function findById(id) {
  const { data, error } = await adminClient().auth.admin.getUserById(id);
  if (error) return null;
  return pub(data.user);
}

export async function remove(id) {
  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) throw new Error(`Supabase Auth could not delete the user: ${error.message}`);
}

export default { createUser, verifyCredentials, findById, remove };
