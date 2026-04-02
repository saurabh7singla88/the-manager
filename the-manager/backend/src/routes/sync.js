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
import { writeFileSync, existsSync, unlinkSync, copyFileSync } from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

// ── DB path helper ────────────────────────────────────────────────────────────
function getLocalDbPath() {
  const raw = process.env.DATABASE_URL || '';
  // Strip file: prefix and normalise
  return raw.replace(/^file:/, '');
}

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
  }).catch(err => {
    const cause = err.cause?.message || err.cause?.code || String(err.cause ?? '');
    throw new Error(`fetch failed${cause ? ` (${cause})` : ''}`);
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
  if (v instanceof Date) return { type: 'text', value: v.toISOString() };
  if (typeof v === 'number' || typeof v === 'bigint') {
    return Number.isInteger(Number(v))
      ? { type: 'integer', value: String(v) }
      : { type: 'float',   value: Number(v) };
  }
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
  return { type: 'text', value: String(v) };
}

/**
 * Read all CREATE TABLE statements from local SQLite and replay them in Turso
 * using IF NOT EXISTS so it's idempotent (safe to call every push).
 */
async function ensureSchemaInTurso() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT name, sql FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE '_prisma_%'
       AND sql IS NOT NULL
     ORDER BY rowid`
  );

  if (!rows.length) return;

  const stmts = rows.map(r => ({
    // Convert "CREATE TABLE" → "CREATE TABLE IF NOT EXISTS"
    sql: r.sql.replace(/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE TABLE IF NOT EXISTS '),
  }));

  // Batch to stay under HTTP limits
  const BATCH = 50;
  for (let i = 0; i < stmts.length; i += BATCH) {
    await tursoExec(stmts.slice(i, i + BATCH));
  }
}

/**
 * Dump all tables from Turso into { tableName: rows[] }.
 * Only silently skips "no such table" — all other errors are thrown.
 */
async function dumpFromTurso() {
  const data = {};
  for (const table of TABLE_INSERT_ORDER) {
    try {
      const results = await tursoExec([{ sql: `SELECT * FROM "${table}"` }]);
      const result  = results[0];
      const cols    = result?.cols?.map(c => c.name) ?? [];
      const rows    = result?.rows ?? [];
      data[table] = rows.map(row =>
        Object.fromEntries(cols.map((col, i) => {
          const cell = row[i];
          // Turso typed values: {type:"text"|"integer"|"float"|"blob"|"null", value?:...}
          if (cell == null || cell?.type === 'null') return [col, null];
          if (typeof cell !== 'object') return [col, cell]; // plain value (older API)
          if (cell.type === 'integer') return [col, Number(cell.value)];
          if (cell.type === 'float')   return [col, parseFloat(cell.value)];
          return [col, cell.value ?? null]; // text, blob
        }))
      );
    } catch (err) {
      const msg = String(err?.message ?? err);
      // Silently skip tables that don't exist in Turso yet
      if (msg.includes('no such table') || msg.includes('does not exist')) {
        data[table] = [];
      } else {
        throw new Error(`Failed to dump table "${table}" from Turso: ${msg}`);
      }
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
 * Write a data dump into local DB.
 * Creates an auto-backup first and restores it automatically on any failure.
 * Only operates on tables that actually exist locally.
 */
async function restoreToLocal(data) {
  // ── 1. Auto-backup before touching anything ───────────────────────────────
  const dbPath = getLocalDbPath();
  let backupPath = null;
  if (dbPath && existsSync(dbPath)) {
    backupPath = `${dbPath}.pre-pull-${Date.now()}`;
    copyFileSync(dbPath, backupPath);
  }

  // ── 2. Discover which tables exist locally ────────────────────────────────
  const existingRows = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'`
  );
  const existingTables = new Set(existingRows.map(r => r.name));

  // ── 3. Wipe + restore inside a transaction ────────────────────────────────
  // PRAGMA foreign_keys must be set OUTSIDE a transaction in SQLite.
  // We also set it again at the start of the transaction as a belt-and-suspenders
  // measure in case Prisma uses a different connection for the transaction.
  try {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('PRAGMA foreign_keys = OFF');

      for (const table of TABLE_DELETE_ORDER) {
        if (!existingTables.has(table)) continue;
        await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
      }

      for (const table of TABLE_INSERT_ORDER) {
        if (!existingTables.has(table)) continue;
        let rows = data[table] ?? [];
        if (rows.length && rows[0] && 'parentId' in rows[0]) rows = topoSort(rows);
        for (const row of rows) {
          const cols = Object.keys(row);
          if (!cols.length) continue;
          await tx.$executeRawUnsafe(
            `INSERT OR REPLACE INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')})`,
            ...cols.map(c => row[c] ?? null)
          );
        }
      }
    }, { timeout: 60_000 });

    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

    // Success — delete the auto-backup
    if (backupPath && existsSync(backupPath)) unlinkSync(backupPath);

  } catch (err) {
    // Restore from auto-backup so data is never permanently lost
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON').catch(() => {});
    if (backupPath && existsSync(backupPath) && dbPath) {
      try {
        copyFileSync(backupPath, dbPath);
        unlinkSync(backupPath);
      } catch { /* ignore secondary errors */ }
    }
    throw err;
  }
}

/**
 * Write a data dump into Turso.
 *
 * Phase 1: DELETE all existing rows in a single atomic request (small payload).
 * Phase 2: INSERT rows in batches of INSERT_BATCH to avoid oversized HTTP
 *          requests that cause "fetch failed" connection resets.
 *
 * Each batch is wrapped in its own BEGIN/COMMIT so Turso auto-rolls back that
 * batch on error. If a batch fails the push route catches, logs, and returns
 * an error — the next push will retry from scratch.
 */
async function restoreToTurso(data) {
  const INSERT_BATCH = 200; // rows per pipeline request

  // Build all INSERT statements in FK-safe order
  const allInserts = [];
  for (const table of TABLE_INSERT_ORDER) {
    let rows = data[table] ?? [];
    if (!rows.length) continue;
    if (rows[0] && 'parentId' in rows[0]) rows = topoSort(rows);
    for (const row of rows) {
      const cols = Object.keys(row);
      if (!cols.length) continue;
      allInserts.push({
        sql:  `INSERT OR REPLACE INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        args: cols.map(c => row[c] ?? null),
      });
    }
  }

  // Find which tables actually exist in Turso (may differ from local schema
  // e.g. google_tokens only exists if Gmail was ever connected).
  const existsResult = await tursoExec([{
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
  }]);
  const tursoTables = new Set(
    (existsResult[0]?.rows ?? []).map(r => (typeof r[0] === 'object' ? r[0].value : r[0]))
  );

  // Phase 1: wipe all existing data (one small atomic request)
  await tursoExec([
    { sql: 'BEGIN' },
    ...TABLE_DELETE_ORDER.filter(t => tursoTables.has(t)).map(t => ({ sql: `DELETE FROM "${t}"` })),
    { sql: 'COMMIT' },
  ]);

  // Phase 2: insert in batches to keep each HTTP request small
  for (let i = 0; i < allInserts.length; i += INSERT_BATCH) {
    const batch = allInserts.slice(i, i + INSERT_BATCH);
    await tursoExec([{ sql: 'BEGIN' }, ...batch, { sql: 'COMMIT' }]);
  }
}

/**
 * Topological sort for self-referential rows (parentId → id).
 * Rows with no parent (or whose parent isn't in the set) come first.
 */
function topoSort(rows) {
  const byId = new Map(rows.map(r => [r.id, r]));
  const visited = new Set();
  const result = [];

  function visit(row) {
    if (visited.has(row.id)) return;
    visited.add(row.id);
    if (row.parentId && byId.has(row.parentId)) visit(byId.get(row.parentId));
    result.push(row);
  }

  for (const row of rows) visit(row);
  return result;
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
    await ensureSchemaInTurso();   // create tables in Turso if this is the first push
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

    // Safety check: refuse to overwrite local data if Turso is empty or has no users.
    // This prevents data loss if pull is triggered before a push has ever been done.
    const remoteUserCount = data['users']?.length ?? 0;
    const remoteTotalRows = TABLE_INSERT_ORDER.reduce((n, t) => n + (data[t]?.length ?? 0), 0);
    if (remoteUserCount === 0 || remoteTotalRows === 0) {
      return res.status(400).json({
        error: `Remote database appears to be empty (${remoteTotalRows} total rows, ${remoteUserCount} users). ` +
               `Push your data first from the source machine before pulling here.`,
      });
    }

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