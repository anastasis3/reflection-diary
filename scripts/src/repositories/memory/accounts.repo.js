/**
 * Accounts — memory driver.
 *
 * Stands in for Supabase Auth: e-mail plus a scrypt password hash, in the
 * `users` collection of the JSON file. The rest of the code only ever sees
 * `{ id, email, createdAt }`, exactly what the Supabase driver returns.
 */
import { randomUUID, randomBytes } from 'node:crypto';
import store from '../../data/store.js';
import ApiError from '../../utils/ApiError.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';

const clean = (email) => String(email).trim().toLowerCase();
const pub = (u) => (u ? { id: u.id, email: u.email, createdAt: u.createdAt } : null);

export async function createUser({ email, password }) {
  if (store.state.users.some((u) => u.email === clean(email))) {
    throw ApiError.conflict('EMAIL_TAKEN', 'An account with this e-mail already exists.');
  }
  const user = {
    id: randomUUID(),
    email: clean(email),
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  store.state.users.push(user);
  store.save();
  return pub(user);
}

/** The account if the password is right, otherwise null. */
export async function verifyCredentials(email, password) {
  const user = store.state.users.find((u) => u.email === clean(email));
  if (!user) {
    // Spend the same time as a real check, so a missing account is not
    // detectably faster than a wrong password.
    await hashPassword(password);
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? pub(user) : null;
}

/*
 * Password reset without e-mail: the memory driver has no mail server, so the
 * link is printed in the server log instead. A token works once, for an hour.
 */
const resets = new Map(); // token -> { userId, expires }
let lastLink = null;

export async function sendPasswordReset(email, redirectTo) {
  const user = store.state.users.find((u) => u.email === clean(email));
  if (!user) return; // same answer as for a real account
  const token = randomBytes(24).toString('hex');
  resets.set(token, { userId: user.id, expires: Date.now() + 60 * 60 * 1000 });
  lastLink = `${redirectTo}#access_token=${token}&type=recovery`;
  if (process.env.NODE_ENV !== 'test') console.log(`Password reset link (memory driver, no e-mail sent): ${lastLink}`);
}

/** For the tests: the last link that would have been e-mailed. */
export function lastResetLink() {
  return lastLink;
}

export async function resetPassword(token, password) {
  const reset = resets.get(token);
  resets.delete(token);
  if (!reset || reset.expires < Date.now()) return null;
  const user = store.state.users.find((u) => u.id === reset.userId);
  if (!user) return null;
  user.passwordHash = await hashPassword(password);
  store.save();
  return pub(user);
}

export async function findById(id) {
  return pub(store.state.users.find((u) => u.id === id));
}

export async function remove(id) {
  store.state.users = store.state.users.filter((u) => u.id !== id);
  store.save();
}

export default { createUser, verifyCredentials, sendPasswordReset, resetPassword, lastResetLink, findById, remove };
