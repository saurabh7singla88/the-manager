import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /api/brainstorm — get the current user's brainstorm canvas
router.get('/', async (req, res, next) => {
  try {
    const canvas = await prisma.brainstormCanvas.findUnique({
      where: { userId: req.user.id },
    });
    res.json({ nodes: canvas?.nodes ?? [], edges: canvas?.edges ?? [] });
  } catch (err) { next(err); }
});

// PUT /api/brainstorm — upsert nodes + edges for the current user
router.put('/', async (req, res, next) => {
  try {
    const { nodes = [], edges = [] } = req.body;
    const canvas = await prisma.brainstormCanvas.upsert({
      where:  { userId: req.user.id },
      update: { nodes, edges },
      create: { userId: req.user.id, nodes, edges },
    });
    res.json({ nodes: canvas.nodes, edges: canvas.edges });
  } catch (err) { next(err); }
});

export default router;
