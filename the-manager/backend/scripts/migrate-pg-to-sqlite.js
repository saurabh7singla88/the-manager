/**
 * One-time migration script: PostgreSQL → SQLite
 *
 * Reads every table from the local PostgreSQL database and upserts all rows
 * into the SQLite database.  Run ONCE after switching the datasource.
 *
 * Usage:
 *   node --experimental-vm-modules scripts/migrate-pg-to-sqlite.js
 *   # or simply:
 *   node scripts/migrate-pg-to-sqlite.js
 */

import pg from 'pg';
import { prisma } from '../src/lib/prisma.js';

const { Pool } = pg;

const PG_URL =
  'postgresql://postgres:password@localhost:5432/initiative_tracker?schema=public';

const pool = new Pool({ connectionString: PG_URL });

async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Pretty progress line */
const log = (label, n) =>
  console.log(`  ✓  ${label.padEnd(24)} ${String(n).padStart(5)} row(s)`);

/** Silently upsert – skip rows that already exist in SQLite */
async function upsertMany(model, rows, idField = 'id') {
  let count = 0;
  for (const row of rows) {
    try {
      await prisma[model].upsert({
        where: { [idField]: row[idField] },
        update: row,
        create: row,
      });
      count++;
    } catch (e) {
      console.warn(`  ⚠  ${model} id=${row[idField]} skipped: ${e.message}`);
    }
  }
  return count;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔌  Connecting to PostgreSQL…');
  await pool.query('SELECT 1'); // verify connection
  console.log('✅  PostgreSQL OK\n');

  // ── 1. users ──────────────────────────────────────────────────────────────
  const pgUsers = await query('SELECT * FROM users');
  const userRows = pgUsers.map((u) => ({
    id:                u.id,
    email:             u.email,
    password:          u.password,
    name:              u.name,
    avatar:            u.avatar ?? null,
    role:              u.role,               // enum string, e.g. 'MANAGER'
    preferences:       u.preferences,        // object|null — wrapper stringifies
    hasPassword:       u.has_password ?? u.hasPassword ?? true,
    notesPasswordHash: u.notes_password_hash ?? u.notesPasswordHash ?? null,
    resetToken:        u.reset_token ?? u.resetToken ?? null,
    resetTokenExpiry:  u.reset_token_expiry ?? u.resetTokenExpiry ?? null,
    createdAt:         new Date(u.created_at ?? u.createdAt),
    updatedAt:         new Date(u.updated_at ?? u.updatedAt),
    lastLogin:         u.last_login ?? u.lastLogin ? new Date(u.last_login ?? u.lastLogin) : null,
  }));
  const c1 = await upsertMany('user', userRows);
  log('users', c1);

  // ── 2. canvases ───────────────────────────────────────────────────────────
  const pgCanvases = await query('SELECT * FROM canvases');
  const canvasRows = pgCanvases.map((c) => ({
    id:          c.id,
    name:        c.name,
    description: c.description ?? null,
    color:       c.color ?? '#6366f1',
    createdById: c.created_by_id ?? c.createdById,
    createdAt:   new Date(c.created_at ?? c.createdAt),
    updatedAt:   new Date(c.updated_at ?? c.updatedAt),
  }));
  const c2 = await upsertMany('canvas', canvasRows);
  log('canvases', c2);

  // ── 3. brainstorm_canvases ────────────────────────────────────────────────
  const pgBrainstorm = await query('SELECT * FROM brainstorm_canvases');
  const brainstormRows = pgBrainstorm.map((b) => ({
    id:        b.id,
    nodes:     b.nodes ?? [],   // jsonb → JS array — wrapper stringifies
    edges:     b.edges ?? [],
    userId:    b.user_id ?? b.userId,
    createdAt: new Date(b.created_at ?? b.createdAt),
    updatedAt: new Date(b.updated_at ?? b.updatedAt),
  }));
  const c3 = await upsertMany('brainstormCanvas', brainstormRows);
  log('brainstorm_canvases', c3);

  // ── 4a. initiatives (first pass — without self-referential FKs) ──────────
  const pgInitiatives = await query('SELECT * FROM initiatives');
  const initRows = pgInitiatives.map((i) => ({
    id:               i.id,
    title:            i.title,
    description:      i.description ?? null,
    type:             i.type,
    parentId:         null,              // set in pass 2
    status:           i.status,
    priority:         i.priority,
    startDate:        i.start_date ?? i.startDate ? new Date(i.start_date ?? i.startDate) : null,
    dueDate:          i.due_date ?? i.dueDate ? new Date(i.due_date ?? i.dueDate) : null,
    completedAt:      i.completed_at ?? i.completedAt ? new Date(i.completed_at ?? i.completedAt) : null,
    progress:         i.progress ?? 0,
    tags:             i.tags ?? [],      // PG array | null — wrapper stringifies
    isStandaloneTask: i.is_standalone_task ?? i.isStandaloneTask ?? false,
    linkedInitiativeId: null,            // set in pass 2
    canvasId:         i.canvas_id ?? i.canvasId ?? null,
    positionX:        i.position_x ?? i.positionX ?? null,
    positionY:        i.position_y ?? i.positionY ?? null,
    createdById:      i.created_by_id ?? i.createdById,
    createdAt:        new Date(i.created_at ?? i.createdAt),
    updatedAt:        new Date(i.updated_at ?? i.updatedAt),
  }));
  const c4a = await upsertMany('initiative', initRows);
  log('initiatives (pass 1)', c4a);

  // ── 4b. initiatives (second pass — restore FK columns) ───────────────────
  let fkFixed = 0;
  for (const i of pgInitiatives) {
    const parentId            = i.parent_id ?? i.parentId ?? null;
    const linkedInitiativeId  = i.linked_initiative_id ?? i.linkedInitiativeId ?? null;
    if (parentId !== null || linkedInitiativeId !== null) {
      await prisma.initiative.update({
        where: { id: i.id },
        data: {
          ...(parentId           ? { parentId }           : {}),
          ...(linkedInitiativeId ? { linkedInitiativeId } : {}),
        },
      });
      fkFixed++;
    }
  }
  log('initiatives (pass 2 FKs)', fkFixed);

  // ── 5. notes ──────────────────────────────────────────────────────────────
  const pgNotes = await query('SELECT * FROM notes');
  const noteRows = pgNotes.map((n) => ({
    id:           n.id,
    title:        n.title,
    content:      n.content ?? '',
    isProtected:  n.is_protected ?? n.isProtected ?? false,
    passwordHash: n.password_hash ?? n.passwordHash ?? null,
    canvasId:     n.canvas_id ?? n.canvasId ?? null,
    createdById:  n.created_by_id ?? n.createdById,
    createdAt:    new Date(n.created_at ?? n.createdAt),
    updatedAt:    new Date(n.updated_at ?? n.updatedAt),
  }));
  const c5 = await upsertMany('note', noteRows);
  log('notes', c5);

  // ── 6. links ──────────────────────────────────────────────────────────────
  const pgLinks = await query('SELECT * FROM links');
  const linkRows = pgLinks.map((l) => ({
    id:           l.id,
    url:          l.url,
    title:        l.title ?? null,
    description:  l.description ?? null,
    category:     l.category ?? null,
    tags:         l.tags ?? [],          // PG array — wrapper stringifies
    initiativeId: l.initiative_id ?? l.initiativeId,
    createdById:  l.created_by_id ?? l.createdById,
    createdAt:    new Date(l.created_at ?? l.createdAt),
    updatedAt:    new Date(l.updated_at ?? l.updatedAt),
  }));
  const c6 = await upsertMany('link', linkRows);
  log('links', c6);

  // ── 7. comments ───────────────────────────────────────────────────────────
  const pgComments = await query('SELECT * FROM comments');
  const commentRows = pgComments.map((c) => ({
    id:           c.id,
    content:      c.content,
    initiativeId: c.initiative_id ?? c.initiativeId,
    userId:       c.user_id ?? c.userId,
    createdAt:    new Date(c.created_at ?? c.createdAt),
    updatedAt:    new Date(c.updated_at ?? c.updatedAt),
  }));
  const c7 = await upsertMany('comment', commentRows);
  log('comments', c7);

  // ── 8. activity_logs ──────────────────────────────────────────────────────
  const pgLogs = await query('SELECT * FROM activity_logs');
  const logRows = pgLogs.map((a) => ({
    id:           a.id,
    action:       a.action,
    changes:      a.changes ?? null,     // jsonb → JS object — wrapper stringifies
    initiativeId: a.initiative_id ?? a.initiativeId,
    userId:       a.user_id ?? a.userId,
    timestamp:    new Date(a.timestamp),
  }));
  const c8 = await upsertMany('activityLog', logRows);
  log('activity_logs', c8);

  // ── 9. _InitiativeAssignees (M2M join table) ──────────────────────────────
  const pgAssignees = await query('SELECT * FROM "_InitiativeAssignees"');
  let c9 = 0;
  for (const row of pgAssignees) {
    try {
      await prisma.$executeRaw`
        INSERT OR IGNORE INTO "_InitiativeAssignees" ("A","B") VALUES (${row.A},${row.B})
      `;
      c9++;
    } catch (e) {
      console.warn(`  ⚠  assignee A=${row.A} B=${row.B} skipped: ${e.message}`);
    }
  }
  log('_InitiativeAssignees', c9);

  console.log('\n✅  Migration complete!\n');
}

main()
  .catch((e) => {
    console.error('\n❌  Migration failed:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });
