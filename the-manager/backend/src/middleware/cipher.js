/**
 * AES-256-GCM encrypt / decrypt for sensitive .env values.
 *
 * Encrypted format stored in .env:
 *   enc:<hex-iv>:<hex-authTag>:<hex-ciphertext>
 *
 * Required env var:
 *   TOKEN_ENCRYPTION_KEY – 64 hex chars (= 32 bytes)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO       = 'aes-256-gcm';
const ENC_PREFIX = 'enc:';

function getKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). ' +
      'Run: node scripts/encrypt-secret.js'
    );
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext) {
  const key    = getKey();
  const iv     = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * Decrypts a value encrypted by encrypt().
 * If the value doesn't start with "enc:" it's returned as-is (plaintext passthrough).
 */
export function decrypt(value) {
  if (!value || !value.startsWith(ENC_PREFIX)) return value;

  const parts = value.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted value in .env');

  const [ivHex, tagHex, cipherHex] = parts;
  const key      = getKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(cipherHex, 'hex')) + decipher.final('utf8');
}
