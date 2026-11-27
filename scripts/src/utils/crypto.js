/**
 * Encryption of entry text (NFR-6).
 *
 * AES-256-GCM from the Node standard library. Each entry gets its own random
 * 12-byte IV; the 16-byte authentication tag makes any tampering with the
 * stored value fail loudly on decryption instead of returning garbage.
 *
 * Stored format: `v1:<base64 of iv | tag | ciphertext>`. The version prefix
 * means the scheme can be changed later without guessing which rows use which.
 *
 * The key is ENTRY_ENCRYPTION_KEY (64 hex characters). It is not in the
 * database, so a copy of the database alone reveals no entry text.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import config from '../config/index.js';

function key() {
  const hex = config.encryptionKey;
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error('ENTRY_ENCRYPTION_KEY must be 64 hex characters (32 bytes).');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

export function decrypt(stored) {
  if (!stored.startsWith('v1:')) throw new Error('Unknown encryption format.');
  const raw = Buffer.from(stored.slice(3), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

export default { encrypt, decrypt };
