import express from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import User from '../models/User.js';
import Ticket from '../models/Ticket.js';
import { authenticateToken, allowRoles } from '../middleware/auth.js';
import { TICKET_STATUSES } from '../constants/tickets.js';

const router = express.Router();

router.use(authenticateToken, allowRoles('ADMIN'));

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive !== false,
    phone: user.phone || null,
    phoneVerified: Boolean(user.phoneVerified),
    createdAt: user.createdAt,
  };
}

router.get('/users', async (req, res) => {
  try {
    const filter = {};
    if (['CUSTOMER', 'SUPPORT', 'ADMIN'].includes(req.query.role)) {
      filter.role = req.query.role;
    }

    const users = await User.find(filter)
      .select('name email role isActive phone phoneVerified createdAt')
      .sort({ createdAt: -1 });

    return res.json({ users: users.map(publicUser) });
  } catch (error) {
    console.error('List users error:', error.message);
    return res.status(500).json({ message: 'Failed to list users' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const normalizedEmail = typeof email === 'string'
      ? email.trim().toLowerCase()
      : '';

    if (!name?.trim() || !normalizedEmail || !password) {
      return res.status(400).json({
        message: 'Name, email and password are required',
      });
    }

    if (!['SUPPORT', 'ADMIN'].includes(role)) {
      return res.status(400).json({
        message: 'Admin can only create SUPPORT or ADMIN accounts',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must contain at least 8 characters',
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 12),
      role,
      isActive: true,
    });

    return res.status(201).json({
      message: 'User created successfully',
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    console.error('Create user error:', error.message);
    return res.status(500).json({ message: 'Failed to create user' });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (typeof req.body.isActive === 'boolean') {
      if (user._id.toString() === req.user.sub && req.body.isActive === false) {
        return res.status(400).json({
          message: 'You cannot deactivate your own account',
        });
      }
      user.isActive = req.body.isActive;
    }

    if (req.body.role) {
      if (!['CUSTOMER', 'SUPPORT', 'ADMIN'].includes(req.body.role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      if (user._id.toString() === req.user.sub) {
        return res.status(400).json({
          message: 'You cannot change your own role',
        });
      }
      user.role = req.body.role;
    }

    await user.save();
    return res.json({
      message: 'User updated successfully',
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Update user error:', error.message);
    return res.status(500).json({ message: 'Failed to update user' });
  }
});

router.get('/metrics', async (_req, res) => {
  try {
    const [total, grouped, unassigned] = await Promise.all([
      Ticket.countDocuments(),
      Ticket.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Ticket.countDocuments({ assignedAgentId: null }),
    ]);

    const byStatus = Object.fromEntries(
      TICKET_STATUSES.map((status) => [status, 0]),
    );
    grouped.forEach((row) => {
      if (row._id) byStatus[row._id] = row.count;
    });

    return res.json({
      total,
      unassigned,
      open: byStatus.OPEN,
      inProgress: byStatus.IN_PROGRESS,
      waiting: byStatus.WAITING_FOR_CUSTOMER,
      resolved: byStatus.RESOLVED,
      closed: byStatus.CLOSED,
      byStatus,
    });
  } catch (error) {
    console.error('Metrics error:', error.message);
    return res.status(500).json({ message: 'Failed to load metrics' });
  }
});

router.get('/reports/workload', async (_req, res) => {
  try {
    const agents = await User.find({ role: 'SUPPORT' })
      .select('name email isActive');

    const counts = await Ticket.aggregate([
      { $match: { assignedAgentId: { $ne: null } } },
      {
        $group: {
          _id: '$assignedAgentId',
          total: { $sum: 1 },
          open: {
            $sum: { $cond: [{ $eq: ['$status', 'OPEN'] }, 1, 0] },
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] },
          },
          waiting: {
            $sum: {
              $cond: [{ $eq: ['$status', 'WAITING_FOR_CUSTOMER'] }, 1, 0],
            },
          },
        },
      },
    ]);

    const countMap = new Map(
      counts.map((row) => [row._id.toString(), row]),
    );

    const workload = agents.map((agent) => {
      const row = countMap.get(agent._id.toString()) || {
        total: 0,
        open: 0,
        inProgress: 0,
        waiting: 0,
      };

      return {
        agentId: agent._id.toString(),
        name: agent.name,
        email: agent.email,
        isActive: agent.isActive !== false,
        assignedTotal: row.total,
        open: row.open,
        inProgress: row.inProgress,
        waiting: row.waiting,
      };
    });

    return res.json({ workload });
  } catch (error) {
    console.error('Workload error:', error.message);
    return res.status(500).json({ message: 'Failed to load workload report' });
  }
});

export default router;
