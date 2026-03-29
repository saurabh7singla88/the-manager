/**
 * Sync routes — explicit Push / Pull with Turso as remote store.
 *
 * Architecture:
 *   - Prisma $queryRawUnsafe reads local tables (no extra deps).
 *   - Turso HTTP Pipeline API (fetch) handles all remote operations.
 *   - Zero native modules — works in packaged Electron on any platform.
 *
 * GET    /api/sync/status   — configured? last push/pull times
 * POST   /api/sync/push     — local → Turso (local wins, overrides remote)
 * POST   /api/sync/pull     — Turso → local (remote wins, overrides local)
 * POST   /api/sync/config   — save + verify credentials to turso.json
 * DELETE /api/sync/config   — remove credentials
 */

import express from 'express';
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// ── Config ────────────────────────────────────────────────────────────────────
const TURSO_CONFIG_DIR  = process.env.TURSO_CONFIG_DIR || process.env.HOME || '.';
const TURSO_CONFIG_FILE = path.join(TURSO_CONFIG_DIR, 'turso.json');

// ── Table order (FK-safe) ─────────────────────────────────────────────────────
const TABLE_INSERT_ORDER = [
  'app_settings',
  'users',
  'canvases',
  'initiatives',
  '_InitiativeAssignees',
  'links',
  'comments',
  'activity_logs',
  'brainstorm_canvases',
  'notes',
  'integration_items',
  'google_tokens',
  'meeting_notes',
];
const TABLE_DELETE_ORDER = [...TABLE_INSERT_ORDER].reverse();

// ── Turso HTTP helpers ────────────────────────────────────────────────────────

/**
 * Build the Turso pipeline endpoint URL.
 * Accepts either libsql:// or https:// URLs and normalises to https.
 */
function tursoEndpoint(databaseUrl) {
  const base = databaseUrl.replace(/^libsql:\/\//, 'https://');
  return `${base.replace(/\/$/, '')}/v2/pipeline`;
}

/**
 * Execute one or more SQL statements against Turso via the HTTP Pipeline API.
 * Statements: Array<{ sql: string, args?: Array<string|number|null|boolean> }>
 * Returns the array of result objects.
 */
async function tursoExec(statements, { databaseUrl, authToken } = {}) {
  const url   = databaseUrl || process.env.TURSO_DATABASE_URL;
  const token = authToken   || process.env.TURSO_AUTH_TOKEN;

  const requests = statements.map(s => ({
    type: 'execute',
    stmt: { sql: s.sql, args: (s.args || []).map(encodeTursoArg) },
  }));
  requests.push({ type: 'close' });

  const res = await fetch(tursoEndpoint(url), {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Turso HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  // Surface any per-statement errors
  for (const r of json.results) {
    if (r.type === 'error') throw new Error(`Turso error: ${r.error?.message || JSON.stringify(r.error)}`);
  }
  return json.results.filter(r => r.type === 'ok').map(r => r.response?.result);
}

/**
 * Encode a JS value to Turso's typed-value format.
 */
function encodeTursoArg(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'number' || typeof v === 'bigint') {
    return Number.isInteger(Number(v))
      ? { type: 'integer', value: String(v) }
      : { type: 'float',   value: Number(v) };
  }
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
  return { type: 'text', value: String(v) };
}

/**
 * Dump all tables from Turso into { tableName: rows[] }.
 */
async function dumpFromTurso() {
  const data = {};
  for (const table of TABLE_INSERT_ORDER) {
    try {
      const stmts  = [{ sql: `SELECT * FROM "${table}"` }];
      const results = await tursoExec(stmts);
      const result  = results[0];
      const cols    = result?.cols?.map(c => c.name) ?? [];
      const rows    = result?.rows ?? [];
      data[table] = rows.map(row =>
        Object.fromEntries(cols.map((col, i) => {
          const cell = row[i];
          // Turso returns typed values: { type, value } or null
          const val = cell == null ? null
            : typeof cell === 'object' && 'value' in cell
              ? (cell.type === 'null' ? null : cell.type === 'integer' ? Number(cell.value) : cell.value)
              : cell;
          return [col, val];
        }))
      );
    } catch {
      data[table] = [];
    }
  }
  return data;
}

/**
 * Dump all local tables via Prisma raw SQL into { tableName: rows[] }.
 */
async function dumpFromLocal() {
  const data = {};
  for (const table of TABLE_INSERT_ORDER) {
    try {
      const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${table}"`);
      data[table] = rows.map(row => {
        const out = {};
        for (const [k, v] of Object.entries(row)) {
          out[k] = typeof v === 'bigint' ? Number(v) : v;
        }
        return out;
      });
    } catch {
      data[table] = [];
    }
  }
  return data;
}

/**
 * Write a data dump into local DB via Prisma transaction.
 */
async function restoreToLocal(data) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
    for (const table of TABLE_DELETE_ORDER) {
      await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
    }
    for (const table of TABLE_INSERT_ORDER) {
      for (const row of (data[table] ?? [])) {
        const cols = Object.keys(row);
        if (!cols.length) continue;
        const quoted       = cols.map(c => `"${c}"`).join(', ');
        const placeholders = cols.map((_, i) => `?${i + 1}`).join(', ');
        const vals         = cols.map(c => row[c] ?? null);
        await tx.$executeRawUnsafe(
          `INSERT OR REPLACE INTO "${table}" (${quoted}) VALUES (${placeholders})`,
          ...vals
        );
      }
    }
    await tx.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  }, { timeout: 60_000 });
}

/**
 * Write a data dump into Turso via batched HTTP pipeline requests.
 */
async function restoreToTurso(data) {
  const stmts = [
    { sql: 'PRAGMA foreign_keys = OFF' },
    ...TABLE_DELETE_ORDER.map(t => ({ sql: `DELETE FROM "${t}"` })),
  ];

  for (const table of TABLE_INSERT_ORDER) {
    for (const row of (data[table] ?? [])) {
      const cols = Object.keys(row);
      if (!cols.length) continue;
      stmts.push({
        sql:  `INSERT OR REPLACE INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        args: cols.map(c => row[c] ?? null),
      });
    }
  }

  stmts.push({ sql: 'PRAGMA foreign_keys = ON' });

  // Batch to avoid hitting HTTP request size limits
  const BATCH = 200;
  for (let i = 0; i < stmts.length; i += BATCH) {
    await tursoExec(stmts.slice(i, i + BATCH));
  }
}

// ── In-memory state ───────────────────────────────────────────────────────────
let lastPushAt  = null;
let lastPushErr = null;
let lastPullAt  = null;
let lastPullErr = null;

// ── GET /api/sync/status ─────────────────────────────────────────────────────
router.get('/status', (_req, res) => {
  res.json({
    configured:    !!process.env.TURSO_DATABASE_URL,
    databaseUrl:   process.env.TURSO_DATABASE_URL ?? null,
    lastPushAt,    lastPushError: lastPushErr,
    lastPullAt,    lastPullError: lastPullErr,
  });
});

// ── POST /api/sync/push ───────────────────────────────────────────────────────
router.post('/push', async (_req, res) => {
  if (!process.env.TURSO_DATABASE_URL)
    return res.status(400).json({ error: 'Turso is not configured. Add credentials in Setup → Sync.' });

  try {
    const data = await dumpFromLocal();
    await restoreToTurso(data);
    lastPushAt  = new Date().toISOString();
    lastPushErr = null;
    res.json({ ok: true, pushedAt: lastPushAt, rowCounts: Object.fromEntries(TABLE_INSERT_ORDER.map(t => [t, data[t]?.length ?? 0])) });
  } catch (err) {
    lastPushErr = err.message || String(err);
    console.error('[sync/push]', err);
    res.status(500).json({ error: lastPushErr });
  }
});

// ── POST /api/sync/pull ───────────────────────────────────────────────────────
router.post('/pull', async (_req, res) => {
  if (!process.env.TURSO_DATABASE_URL)
    return res.status(400).json({ error: 'Turso is not configured. Add credentials in Setup → Sync.' });

  try {
    const data = await dumpFromTurso();
    await restoreToLocal(data);
    lastPullAt  = new Date().toISOString();
    lastPullErr = null;
    res.json({ ok: true, pulledAt: lastPullAt, rowCounts: Object.fromEntries(TABLE_INSERT_ORDER.map(t => [t, data[t]?.length ?? 0])) });
  } catch (err) {
    lastPullErr = err.message || String(err);
    console.error('[sync/pull]', err);
    res.status(500).json({ error: lastPullErr });
  }
});

// ── POST /api/sync/config ─────────────────────────────────────────────────────
router.post('/config', async (req, res) => {
  const { databaseUrl, authToken } = req.body;
  if (!databaseUrl || !authToken)
    return res.status(400).json({ error: 'databaseUrl and authToken are required.' });
  if (!databaseUrl.startsWith('libsql://') && !databaseUrl.startsWith('https://'))
    return res.status(400).json({ error: 'databaseUrl must start with libsql:// or https://' });

  // Verify before saving
  try {
    await tursoExec([{ sql: 'SELECT 1' }], { databaseUrl, authToken });
  } catch (err) {
    return res.status(400).json({ error: `Could not connect to Turso: ${err.message}` });
  }

  try {
    writeFileSync(TURSO_CONFIG_FILE, JSON.stringify({ databaseUrl, authToken }, null, 2), 'utf8');
  } catch (err) {
    return res.status(500).json({ error: `Failed to write config: ${err.message}` });
  }

  res.json({ ok: true, message: 'Credentials saved and verified. Restart the app to activate sync buttons.', restartRequired: true });
});

// ── DELETE /api/sync/config ───────────────────────────────────────────────────
router.delete('/config', (_req, res) => {
  try {
    if (existsSync(TURSO_CONFIG_FILE)) unlinkSync(TURSO_CONFIG_FILE);
  } catch (err) {
    return res.status(500).json({ error: `Failed to remove config: ${err.message}` });
  }
  res.json({ ok: true, message: 'Turso credentials removed. Restart to revert to local-only mode.' });
});

export default router;