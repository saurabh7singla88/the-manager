import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// ── GET /meeting-notes?initiativeId=xxx  (all saved notes, or filtered by initiative) ──
router.get('/', async (req, res) => {
  try {
    const { initiativeId } = req.query;
    const where = { createdById: req.user.id };
    if (initiativeId) where.initiativeId = initiativeId;

    const notes = await prisma.meetingNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        initiative: { select: { id: true, title: true } },
      },
    });
    res.json(notes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch meeting notes' });
  }
});

// ── POST /meeting-notes  (save an email as a meeting note) ──────────────────
router.post('/', async (req, res) => {
  try {
    const { subject, fromEmail, date, body, initiativeId } = req.body;
    if (!subject) return res.status(400).json({ error: 'subject is required' });

    const note = await prisma.meetingNote.create({
      data: {
        subject,
        fromEmail: fromEmail || null,
        date:      date ? new Date(date) : null,
        body:      body || '',
        initiativeId: initiativeId || null,
        createdById:  req.user.id,
        updatedAt: new Date(),
      },
      include: { initiative: { select: { id: true, title: true } } },
    });
    res.status(201).json(note);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save meeting note' });
  }
});

// ── PATCH /meeting-notes/:id  (update initiative link or body) ──────────────
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.meetingNote.findFirst({ where: { id, createdById: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { initiativeId, body, subject, date } = req.body;
    const data = { updatedAt: new Date() };
    if (initiativeId !== undefined) data.initiativeId = initiativeId || null;
    if (body        !== undefined) data.body = body;
    if (subject     !== undefined) data.subject = subject;
    if (date        !== undefined) data.date = date ? new Date(date) : null;

    const updated = await prisma.meetingNote.update({
      where: { id },
      data,
      include: { initiative: { select: { id: true, title: true } } },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update meeting note' });
  }
});

// ── DELETE /meeting-notes/:id ───────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.meetingNote.findFirst({ where: { id, createdById: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.meetingNote.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete meeting note' });
  }
});

export default router;
