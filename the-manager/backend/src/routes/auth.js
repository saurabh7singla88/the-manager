import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Register
router.post('/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, name } = req.body;

      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: 'MANAGER'
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatar: true,
          createdAt: true
        }
      });

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.status(201).json({ user, token });
    } catch (error) {
      next(error);
    }
  }
);

// Login
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatar: user.avatar
        },
        token
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get current user
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        preferences: true,
        createdAt: true,
        lastLogin: true
      }
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Forgot password — generates a reset token and returns it directly (no email)
router.post('/forgot-password',
  body('email').isEmail().normalizeEmail(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: 'Valid email required' });

      const { email } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });

      // Always respond the same way to avoid user enumeration
      if (!user) return res.json({ message: 'If that email exists, a reset token has been generated.' });

      const plainToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: tokenHash, resetTokenExpiry: expiry },
      });

      console.log(`\n🔑  PASSWORD RESET TOKEN for ${email}:\n    plain: ${plainToken}\n    hash:  ${tokenHash}\n    expires: ${expiry}\n`);

      res.json({ resetToken: plainToken });
    } catch (error) {
      next(error);
    }
  }
);

// Reset password — consumes the token
router.post('/reset-password',
  body('token').notEmpty(),
  body('password').isLength({ min: 6 }),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: 'Token and password (min 6 chars) required' });

      const { token, password } = req.body;
      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

      console.log(`\n🔍  RESET ATTEMPT:\n    submitted token: "${token.trim()}"\n    computed hash:   ${tokenHash}\n`);

      const user = await prisma.user.findFirst({
        where: { resetToken: tokenHash },
      });

      console.log(`    DB lookup result: ${user ? `found user ${user.email}` : 'NOT FOUND'}\n`);

      if (!user) return res.status(400).json({ error: 'Reset token is invalid' });
      if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
        return res.status(400).json({ error: 'Reset token has expired — please request a new one' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, resetToken: null, resetTokenExpiry: null },
      });

      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
