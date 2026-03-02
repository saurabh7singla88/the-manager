import express from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { randomUUID } from 'crypto';

const router = express.Router();
const prisma = new PrismaClient();

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  role: true,
  createdAt: true,
  hasPassword: true,
};

router.use(authenticate);

// Get all users
router.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// Create a user (password optional — if omitted, user cannot log in until one is set)
router.post('/', async (req, res, next) => {
  try {
    const { name, email, role = 'VIEWER', password } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    // Email is required only when login is being enabled
    if (password?.trim() && !email?.trim()) {
      return res.status(400).json({ error: 'Email is required when login is enabled' });
    }

    const normalizedEmail = email?.trim() ? email.toLowerCase().trim() : null;

    if (normalizedEmail) {
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        return res.status(400).json({ error: 'Email already registered' });
      }
    }

    // If password provided, hash it. Otherwise hash a random unguessable string.
    const rawPassword = password?.trim() ? password.trim() : randomUUID();
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role,
        hasPassword: !!(password?.trim()),
      },
      select: USER_SELECT,
    });

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

// Update current user profile
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
      select: { id: true, email: true, name: true, role: true, avatar: true, preferences: true },
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Update a user (name, email, role, optionally set/reset password)
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, role, password } = req.body;

    const data = {};
    if (name?.trim()) data.name = name.trim();
    if (email !== undefined) {
      const normalizedEmail = email?.trim() ? email.toLowerCase().trim() : null;
      if (normalizedEmail) {
        const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing && existing.id !== id) {
          return res.status(400).json({ error: 'Email already in use' });
        }
      }
      data.email = normalizedEmail;
    }
    if (role) data.role = role;
    if (password?.trim()) {
      data.password = await bcrypt.hash(password.trim(), 10);
      data.hasPassword = true;
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Delete a user
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    await prisma.user.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
