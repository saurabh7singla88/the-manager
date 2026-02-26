import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// Get all users (for assignment dropdowns)
router.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    res.json(users);
  } catch (error) {
    next(error);
  }
});

// Update current user
router.put('/me', async (req, res, next) => {
  try {
    const { name, avatar, preferences } = req.body;

    const data = {};
    if (name) data.name = name;
    if (avatar !== undefined) data.avatar = avatar;
    if (preferences) data.preferences = preferences;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        preferences: true
      }
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
});

export default router;
