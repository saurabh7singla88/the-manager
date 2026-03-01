import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// All routes require auth
router.use(authenticate);

// GET /api/canvases — list all canvases for the logged-in user
router.get('/', async (req, res, next) => {
  try {
    const canvases = await prisma.canvas.findMany({
      where: { createdById: req.user.id },
      include: {
        _count: { select: { initiatives: true } }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(canvases);
  } catch (error) { next(error); }
});

// POST /api/canvases — create a canvas
router.post('/',
  body('name').trim().notEmpty().withMessage('Name is required'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { name, description, color } = req.body;
      const canvas = await prisma.canvas.create({
        data: {
          name,
          description: description || null,
          color: color || '#6366f1',
          createdById: req.user.id
        },
        include: { _count: { select: { initiatives: true } } }
      });
      res.status(201).json(canvas);
    } catch (error) { next(error); }
  }
);

// PUT /api/canvases/:id — update a canvas
router.put('/:id',
  body('name').optional().trim().notEmpty(),
  async (req, res, next) => {
    try {
      const canvas = await prisma.canvas.findUnique({ where: { id: req.params.id } });
      if (!canvas) return res.status(404).json({ error: 'Canvas not found' });
      if (canvas.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      const { name, description, color } = req.body;
      const data = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;
      if (color !== undefined) data.color = color;

      const updated = await prisma.canvas.update({
        where: { id: req.params.id },
        data,
        include: { _count: { select: { initiatives: true } } }
      });
      res.json(updated);
    } catch (error) { next(error); }
  }
);

// DELETE /api/canvases/:id — delete a canvas (unlinks initiatives, doesn't delete them)
router.delete('/:id', async (req, res, next) => {
  try {
    const canvas = await prisma.canvas.findUnique({ where: { id: req.params.id } });
    if (!canvas) return res.status(404).json({ error: 'Canvas not found' });
    if (canvas.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    // Unlink all initiatives from this canvas before deleting
    await prisma.initiative.updateMany({
      where: { canvasId: req.params.id },
      data: { canvasId: null }
    });

    await prisma.canvas.delete({ where: { id: req.params.id } });
    res.json({ message: 'Canvas deleted' });
  } catch (error) { next(error); }
});

export default router;
