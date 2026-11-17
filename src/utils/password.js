/**
 * Password hashing with scrypt from the Node standard library.
 *
 * scrypt is deliberately slow and memory-hard, which is what a password hash
 * has to be. Using the built-in implementation means one less dependency to
 * keep patched. The stored value is `scrypt$<N>$<salt>$<hash>`, so the cost
 * parameter travels with the hash and old hashes stay verifiable if it is
 * raised later.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

const KEY_LENGTH = 64;
const COST = 16384; // 2^14

export async function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(plain, salt, KEY_LENGTH, { N: COST });
  return `scrypt$${COST}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, cost, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !cost || !salt || !hash) return false;

  const derived = await scrypt(plain, salt, KEY_LENGTH, { N: Number(cost) });
  const expected = Buffer.from(hash, 'hex');
  // Lengths must match before timingSafeEqual, which throws otherwise.
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export default { hashPassword, verifyPassword };
