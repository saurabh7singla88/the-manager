/**
 * One-time helper to encrypt GMAIL_APP_PASSWORD directly in .env.
 *
 * Usage (from the backend/ folder):
 *   node setup-env.js
 *
 * Writes changes directly to .env — no copy-paste needed.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createCipheriv, randomBytes } from 'crypto';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath   = resolve(__dirname, '.env');
dotenv.config({ path: envPath });

const ALGO       = 'aes-256-gcm';
const ENC_PREFIX = 'enc:';

const rawPassword = process.env.GMAIL_APP_PASSWORD;
if (!rawPassword) {
  console.error('ERROR: GMAIL_APP_PASSWORD is not set in .env');
  process.exit(1);
}

if (rawPassword.startsWith(ENC_PREFIX)) {
  console.log('INFO: GMAIL_APP_PASSWORD is already encrypted. Nothing to do.');
  process.exit(0);
}

// Generate key if not present
let keyHex   = process.env.TOKEN_ENCRYPTION_KEY;
let freshKey = false;
if (!keyHex || keyHex.length !== 64) {
  keyHex   = randomBytes(32).toString('hex');
  freshKey = true;
}

const key    = Buffer.from(keyHex, 'hex');
const iv     = randomBytes(12);
const cipher = createCipheriv(ALGO, key, iv);
const enc    = Buffer.concat([cipher.update(rawPassword, 'utf8'), cipher.final()]);
const tag    = cipher.getAuthTag();
const encrypted = `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;

// Patch .env file directly
let envContent = readFileSync(envPath, 'utf8');

// Replace or append TOKEN_ENCRYPTION_KEY
if (freshKey) {
  if (/^TOKEN_ENCRYPTION_KEY=.*/m.test(envContent)) {
    envContent = envContent.replace(/^TOKEN_ENCRYPTION_KEY=.*/m, `TOKEN_ENCRYPTION_KEY=${keyHex}`);
  } else {
    envContent += `\nTOKEN_ENCRYPTION_KEY=${keyHex}\n`;
  }
}

// Replace GMAIL_APP_PASSWORD
envContent = envContent.replace(/^GMAIL_APP_PASSWORD=.*/m, `GMAIL_APP_PASSWORD=${encrypted}`);

writeFileSync(envPath, envContent, 'utf8');

console.log('Done! .env updated:');
if (freshKey) console.log('  + TOKEN_ENCRYPTION_KEY  (new key generated)');
console.log('  + GMAIL_APP_PASSWORD    (now encrypted with AES-256-GCM)');
console.log('\nRestart the backend server for changes to take effect.\n');
