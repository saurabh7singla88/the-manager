import express from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// ── Global password settings ───────────────────────────────
// GET /settings — does the user have a notes password set?
router.get('/settings', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { notesPasswordHash: true },
    });
    res.json({ hasPassword: !!user.notesPasswordHash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /unlock — verify global notes password
router.post('/unlock', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { notesPasswordHash: true },
    });
    if (!user.notesPasswordHash) return res.status(400).json({ error: 'No password set' });

    const match = await bcrypt.compare(password, user.notesPasswordHash);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

// PUT /password — set, change, or remove global notes password
// body: { action: 'set'|'change'|'remove', password?, currentPassword? }
router.put('/password', async (req, res) => {
  try {
    const { action, password, currentPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { notesPasswordHash: true },
    });

    if (action === 'set') {
      if (!password) return res.status(400).json({ error: 'Password required' });
      const hash = await bcrypt.hash(password, 10);
      await prisma.user.update({ where: { id: req.user.id }, data: { notesPasswordHash: hash } });

    } else if (action === 'change' || action === 'remove') {
      if (!user.notesPasswordHash) return res.status(400).json({ error: 'No password set' });
      if (!currentPassword) return res.status(400).json({ error: 'Current password required' });

      const match = await bcrypt.compare(currentPassword, user.notesPasswordHash);
      if (!match) return res.status(401).json({ error: 'Incorrect current password' });

      if (action === 'remove') {
        await prisma.user.update({ where: { id: req.user.id }, data: { notesPasswordHash: null } });
      } else {
        if (!password) return res.status(400).json({ error: 'New password required' });
        const hash = await bcrypt.hash(password, 10);
        await prisma.user.update({ where: { id: req.user.id }, data: { notesPasswordHash: hash } });
      }
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// ── List notes (no content) ───────────────────────────────
// Returns all notes for the user (flat, with parentId).
// Canvas filtering and tree assembly is handled client-side.
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const where = { createdById: req.user.id };
    if (search) where.title = { contains: search };

    const notes = await prisma.note.findMany({
      where,
      select: {
        id: true,
        title: true,
        parentId: true,
        canvasId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(notes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// ── Create note ────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { title, content = '', canvasId, parentId } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    // Validate parentId belongs to same user
    if (parentId) {
      const parent = await prisma.note.findFirst({ where: { id: parentId, createdById: req.user.id } });
      if (!parent) return res.status(404).json({ error: 'Parent note not found' });
    }

    const note = await prisma.note.create({
      data: {
        title: title.trim(),
        content,
        parentId: parentId || null,
        canvasId: canvasId || null,
        createdById: req.user.id,
      },
      select: { id: true, title: true, parentId: true, canvasId: true, createdAt: true, updatedAt: true },
    });
    res.status(201).json(note);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// ── Get single note ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const note = await prisma.note.findFirst({
      where: { id: req.params.id, createdById: req.user.id },
      select: { id: true, title: true, content: true, parentId: true, canvasId: true, createdAt: true, updatedAt: true },
    });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

// ── Update note ────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { title, content, canvasId, parentId } = req.body;
    const note = await prisma.note.findFirst({ where: { id: req.params.id, createdById: req.user.id } });
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const data = {};
    if (title !== undefined) data.title = title.trim();
    if (content !== undefined) data.content = content;
    if (canvasId !== undefined) data.canvasId = canvasId || null;
    if (parentId !== undefined) data.parentId = parentId || null;

    const updated = await prisma.note.update({
      where: { id: req.params.id },
      data,
      select: { id: true, title: true, content: true, parentId: true, canvasId: true, createdAt: true, updatedAt: true },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// ── Delete note ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const note = await prisma.note.findFirst({ where: { id: req.params.id, createdById: req.user.id } });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    await prisma.note.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

export default router;
