/**
 * The Supabase Auth client (Supabase driver only).
 *
 * Accounts — e-mail and password — live in Supabase Auth (`auth.users`), never
 * in the application's own tables. The server talks to Auth with the service
 * role key, which may create and delete users. That key is a server secret: it
 * is read from the environment and never leaves this process.
 */
import { createClient } from '@supabase/supabase-js';
import config from '../config/index.js';

const options = { auth: { persistSession: false, autoRefreshToken: false } };

let admin = null;

/** The client used for admin calls: create, look up and delete users. */
export function adminClient() {
  if (!admin) admin = createClient(config.supabase.url, config.supabase.serviceRoleKey, options);
  return admin;
}

/**
 * A short-lived client for checking one password. A sign-in stores a session
 * inside the client that made it, so each check gets its own client and two
 * log-ins at the same moment cannot see each other's session.
 */
export function freshClient() {
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, options);
}

export default { adminClient, freshClient };
