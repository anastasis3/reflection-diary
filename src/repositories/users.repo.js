/**
 * Accounts and credentials.
 *
 * In the production schema these rows live in Supabase's `auth.users`, which
 * the application never writes to directly. Here they are an ordinary
 * collection so the project runs without Supabase; the rest of the code only
 * ever sees the user id, exactly as it would there.
 */
import { randomUUID } from 'node:crypto';
import store from '../data/store.js';

export function findByEmail(email) {
  const needle = String(email).trim().toLowerCase();
  return store.state.users.find((u) => u.email === needle) ?? null;
}

export function findById(id) {
  return store.state.users.find((u) => u.id === id) ?? null;
}

export function create({ email, passwordHash }) {
  const user = {
    id: randomUUID(),
    email: String(email).trim().toLowerCase(),
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  store.state.users.push(user);
  store.save();
  return user;
}

/** Removes the account row itself. Related rows are removed by account.service. */
export function remove(id) {
  const { users } = store.state;
  const index = users.findIndex((u) => u.id === id);
  if (index !== -1) users.splice(index, 1);
  store.save();
}

export default { findByEmail, findById, create, remove };
