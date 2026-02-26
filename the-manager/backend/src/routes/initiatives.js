import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authenticate);

// Get all initiatives (with filtering)
router.get('/', async (req, res, next) => {
  try {
    const { status, priority, parentId, search } = req.query;

    const where = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    
    // If parentId is provided, filter by it; if 'null', get root items
    if (parentId === 'null') {
      where.parentId = null;
    } else if (parentId) {
      where.parentId = parentId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const initiatives = await prisma.initiative.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        assignees: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        _count: {
          select: {
            children: true,
            comments: true,
            links: true
          }
        }
      },
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    res.json(initiatives);
  } catch (error) {
    next(error);
  }
});

// Get single initiative with details
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const initiative = await prisma.initiative.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        assignees: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        parent: {
          select: {
            id: true,
            title: true
          }
        },
        children: {
          include: {
            assignees: {
              select: {
                id: true,
                name: true,
                avatar: true
              }
            },
            _count: {
              select: {
                children: true
              }
            }
          }
        },
        links: true,
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        _count: {
          select: {
            children: true,
            comments: true,
            links: true
          }
        }
      }
    });

    if (!initiative) {
      return res.status(404).json({ error: 'Initiative not found' });
    }

    res.json(initiative);
  } catch (error) {
    next(error);
  }
});

// Create new initiative
router.post('/',
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('type').optional().isIn(['INITIATIVE', 'TASK', 'SUBTASK']),
  body('status').optional().isIn(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
  body('priority').optional().isIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        title,
        description,
        type,
        parentId,
        status,
        priority,
        startDate,
        dueDate,
        tags,
        assigneeIds
      } = req.body;

      const data = {
        title,
        description,
        type: type || 'INITIATIVE',
        status: status || 'OPEN',
        priority: priority || 'MEDIUM',
        createdById: req.user.id,
        ...(parentId && { parentId }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(dueDate && { dueDate: new Date(dueDate) }),
        ...(tags && { tags })
      };

      if (assigneeIds && assigneeIds.length > 0) {
        data.assignees = {
          connect: assigneeIds.map(id => ({ id }))
        };
      }

      const initiative = await prisma.initiative.create({
        data,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true
            }
          },
          assignees: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true
            }
          }
        }
      });

      // Create activity log
      await prisma.activityLog.create({
        data: {
          action: 'created',
          initiativeId: initiative.id,
          userId: req.user.id,
          changes: { title, type, status, priority }
        }
      });

      res.status(201).json(initiative);
    } catch (error) {
      next(error);
    }
  }
);

// Update initiative
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      status,
      priority,
      startDate,
      dueDate,
      progress,
      tags,
      assigneeIds,
      positionX,
      positionY
    } = req.body;

    const existing = await prisma.initiative.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Initiative not found' });
    }

    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (status !== undefined) {
      data.status = status;
      if (status === 'COMPLETED' && !existing.completedAt) {
        data.completedAt = new Date();
        data.progress = 100;
      }
    }
    if (priority !== undefined) data.priority = priority;
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (progress !== undefined) data.progress = Math.min(100, Math.max(0, progress));
    if (tags !== undefined) data.tags = tags;
    if (positionX !== undefined) data.positionX = positionX;
    if (positionY !== undefined) data.positionY = positionY;

    if (assigneeIds !== undefined) {
      data.assignees = {
        set: assigneeIds.map(id => ({ id }))
      };
    }

    const initiative = await prisma.initiative.update({
      where: { id },
      data,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        assignees: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        }
      }
    });

    // Log changes
    const changes = {};
    Object.keys(data).forEach(key => {
      if (existing[key] !== data[key]) {
        changes[key] = { from: existing[key], to: data[key] };
      }
    });

    if (Object.keys(changes).length > 0) {
      await prisma.activityLog.create({
        data: {
          action: 'updated',
          initiativeId: id,
          userId: req.user.id,
          changes
        }
      });
    }

    res.json(initiative);
  } catch (error) {
    next(error);
  }
});

// Delete initiative
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const initiative = await prisma.initiative.findUnique({
      where: { id },
      include: {
        _count: {
          select: { children: true }
        }
      }
    });

    if (!initiative) {
      return res.status(404).json({ error: 'Initiative not found' });
    }

    // Delete will cascade to children
    await prisma.initiative.delete({
      where: { id }
    });

    res.json({ message: 'Initiative deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Update status
router.patch('/:id/status',
  body('status').isIn(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const data = { status };
      if (status === 'COMPLETED') {
        data.completedAt = new Date();
        data.progress = 100;
      }

      const initiative = await prisma.initiative.update({
        where: { id },
        data,
        include: {
          assignees: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          }
        }
      });

      await prisma.activityLog.create({
        data: {
          action: 'status_changed',
          initiativeId: id,
          userId: req.user.id,
          changes: { status }
        }
      });

      res.json(initiative);
    } catch (error) {
      next(error);
    }
  }
);

// Update priority
router.patch('/:id/priority',
  body('priority').isIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { priority } = req.body;

      const initiative = await prisma.initiative.update({
        where: { id },
        data: { priority },
        include: {
          assignees: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          }
        }
      });

      await prisma.activityLog.create({
        data: {
          action: 'priority_changed',
          initiativeId: id,
          userId: req.user.id,
          changes: { priority }
        }
      });

      res.json(initiative);
    } catch (error) {
      next(error);
    }
  }
);

// Update position (for mind map drag)
router.patch('/:id/position', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { positionX, positionY } = req.body;

    const initiative = await prisma.initiative.update({
      where: { id },
      data: { positionX, positionY }
    });

    res.json(initiative);
  } catch (error) {
    next(error);
  }
});

// Get children of an initiative
router.get('/:id/children', async (req, res, next) => {
  try {
    const { id } = req.params;

    const children = await prisma.initiative.findMany({
      where: { parentId: id },
      include: {
        assignees: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        },
        _count: {
          select: {
            children: true,
            comments: true
          }
        }
      },
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    res.json(children);
  } catch (error) {
    next(error);
  }
});

export default router;
