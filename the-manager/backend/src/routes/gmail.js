import { Router } from 'express';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { authenticate } from '../middleware/auth.js';
import { decrypt } from '../middleware/cipher.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

// ── GET /api/gmail/test-config  ───────────────────────────────────────────────
// Quick connection test — returns success/error without exposing credentials.
router.get('/test-config', async (req, res) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(503).json({ ok: false, error: 'GMAIL_USER or GMAIL_APP_PASSWORD not set in .env' });
  }
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY || '';
  const pwRaw  = process.env.GMAIL_APP_PASSWORD;
  const isEncrypted = pwRaw.startsWith('enc:');
  if (isEncrypted && keyHex.length !== 64) {
    return res.status(503).json({ ok: false, error: 'TOKEN_ENCRYPTION_KEY is missing or wrong length (need 64 hex chars)' });
  }
  let pass;
  try { pass = decrypt(pwRaw); } catch (e) {
    return res.status(503).json({ ok: false, error: `Decryption failed: ${e.message}` });
  }
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: process.env.GMAIL_USER, pass },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
    return res.json({ ok: true, user: process.env.GMAIL_USER, encrypted: isEncrypted });
  } catch (e) {
    return res.status(401).json({ ok: false, error: e.message });
  }
});

// ── connect & return client ───────────────────────────────────────────────────
function makeClient() {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: decrypt(process.env.GMAIL_APP_PASSWORD),
    },
    logger: false,
  });
}

// ── GET /api/gmail/meeting-notes  ─────────────────────────────────────────────
// Query params:
//   date   – "YYYY-MM-DD", defaults to today
//   label  – Gmail label name to open as mailbox (e.g. "Gemini Notes")
//            if omitted, falls back to INBOX + subject/sender text filter
//   search – text filter applied when label is NOT set (default: "gemini")
router.get('/meeting-notes', async (req, res, next) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(503).json({ error: 'Gmail credentials not configured.' });
  }

  const dateParam  = req.query.date;
  const labelParam = req.query.label ? req.query.label.trim() : null;   // e.g. "Gemini Notes"
  const searchTerm = labelParam ? null : (req.query.search ?? 'gemini').toLowerCase();
  const mailbox    = labelParam || 'INBOX';

  // Build date boundaries (local midnight)
  const base   = dateParam ? new Date(dateParam + 'T00:00:00') : new Date();
  const since  = new Date(base); since.setHours(0, 0, 0, 0);
  const before = new Date(base); before.setHours(0, 0, 0, 0); before.setDate(before.getDate() + 1);

  const client = makeClient();
  try {
    await client.connect();

    // Open the requested mailbox/label
    let lock;
    try {
      lock = await client.getMailboxLock(mailbox);
    } catch (e) {
      const boxes = [];
      for await (const mb of client.list()) boxes.push(mb.path);
      return res.status(404).json({
        error: `Gmail label "${mailbox}" not found. Available mailboxes: ${boxes.join(', ')}`,
        availableMailboxes: boxes,
      });
    }

    const emails = [];
    try {
      const uids = await client.search({ since, before });

      if (uids.length === 0) {
        return res.json({ emails: [], date: since.toISOString(), mailbox, searchTerm });
      }

      const toFetch = uids.slice(-100);

      let skipped = 0;
      for await (const msg of client.fetch(toFetch, { source: true })) {
        try {
          const parsed   = await simpleParser(msg.source);
          const from     = (parsed.from?.text || '').toLowerCase();
          const subject  = (parsed.subject   || '').toLowerCase();
          const textBody = parsed.text || '';

          // Only apply text filter when NOT using a label (label itself is the filter)
          if (searchTerm && !from.includes(searchTerm) && !subject.includes(searchTerm)) {
            skipped++;
            continue;
          }

          emails.push({
            uid:       msg.uid,
            messageId: parsed.messageId || String(msg.uid),
            from:      parsed.from?.text || 'Unknown',
            subject:   parsed.subject   || '(no subject)',
            date:      parsed.date?.toISOString() || null,
            text:      textBody.trim(),
            html:      null,
            snippet:   textBody.trim().slice(0, 200),
          });
        } catch { /* skip unparseable messages */ }
      }
    } finally {
      lock.release();
    }

    emails.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ emails, date: since.toISOString(), mailbox, searchTerm });
  } catch (err) {
    if (err.message?.includes('AUTHENTICATIONFAILED') || err.message?.includes('Invalid credentials')) {
      logger.error('Gmail IMAP authentication failed', { user: process.env.GMAIL_USER });
      return res.status(401).json({ error: 'Gmail authentication failed. Check GMAIL_USER and GMAIL_APP_PASSWORD in .env.' });
    }
    logger.error('Gmail IMAP error', err);
    next(err);
  } finally {
    await client.logout().catch(() => {});
  }
});

export default router;
