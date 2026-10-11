import express from 'express';
import mongoose from 'mongoose';

import Ticket from '../models/Ticket.js';
import TicketMessage from '../models/TicketMessage.js';
import User from '../models/User.js';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  canTransition,
  normalizeStatus,
} from '../constants/tickets.js';
import { authenticateToken, allowRoles } from '../middleware/auth.js';
import {
  HISTORY_ACTIONS,
  MESSAGE_VISIBILITY,
  canMutateTicket,
  canReadTicket,
  customerReplyAllowed,
  findTicketForRequest,
  loadTicketBundle,
  nextTicketNumber,
  populateTicket,
  recordHistory,
} from '../services/ticketService.js';

const router = express.Router();

function isObjectId(value) {
  return mongoose.isValidObjectId(value);
}

function listFilterForRole(req) {
  const { role, sub } = req.user;
  const queue = typeof req.query.queue === 'string' ? req.query.queue : '';

  if (role === 'CUSTOMER') {
    return { createdBy: sub };
  }

  if (role === 'SUPPORT') {
    if (queue === 'unassigned') {
      return { assignedAgentId: null };
    }
    return { assignedAgentId: sub };
  }

  const filter = {};
  if (queue === 'unassigned') filter.assignedAgentId = null;
  if (queue === 'assigned' && isObjectId(req.query.assignedAgentId)) {
    filter.assignedAgentId = req.query.assignedAgentId;
  }
  return filter;
}

function applyCommonFilters(filter, query) {
  const status = normalizeStatus(query.status);
  if (status) filter.status = status;

  if (TICKET_PRIORITIES.includes(query.priority)) {
    filter.priority = query.priority;
  }

  if (TICKET_CATEGORIES.includes(query.category)) {
    filter.category = query.category;
  }

  if (isObjectId(query.customerId)) {
    filter.createdBy = query.customerId;
  }

  if (isObjectId(query.assignedAgentId) && query.queue !== 'unassigned') {
    filter.assignedAgentId = query.assignedAgentId;
  }

  if (typeof query.search === 'string' && query.search.trim()) {
    const search = query.search.trim();
    filter.$or = [
      { ticketId: { $regex: search, $options: 'i' } },
      { subject: { $regex: search, $options: 'i' } },
      { customer: { $regex: search, $options: 'i' } },
    ];
  }

  return filter;
}

router.get('/', authenticateToken, async (req, res) => {
  try {
    const filter = applyCommonFilters(listFilterForRole(req), req.query);
    const tickets = await populateTicket(
      Ticket.find(filter).sort({ createdAt: -1 }),
    );
    return res.status(200).json(tickets);
  } catch (error) {
    console.error('Fetch tickets error:', error.message);
    return res.status(500).json({ message: 'Failed to fetch tickets' });
  }
});

router.post(
  '/',
  authenticateToken,
  allowRoles('CUSTOMER'),
  async (req, res) => {
    try {
      const { subject, priority, description, category } = req.body;

      if (typeof subject !== 'string' || !subject.trim()) {
        return res.status(400).json({ message: 'Subject is required' });
      }

      const user = await User.findById(req.user.sub);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      const selectedPriority = TICKET_PRIORITIES.includes(priority)
        ? priority
        : 'Medium';
      const selectedCategory = TICKET_CATEGORIES.includes(category)
        ? category
        : 'Other';
      const details = typeof description === 'string' ? description.trim() : '';

      const ticketId = await nextTicketNumber();
      const ticket = await Ticket.create({
        ticketId,
        subject: subject.trim(),
        description: details,
        category: selectedCategory,
        customer: user.name,
        createdBy: user._id,
        priority: selectedPriority,
        status: 'OPEN',
      });

      if (details) {
        await TicketMessage.create({
          ticketId: ticket._id,
          authorId: user._id,
          message: details,
          visibility: MESSAGE_VISIBILITY.PUBLIC,
        });
      }

      await recordHistory({
        ticketId: ticket._id,
        actorId: user._id,
        action: HISTORY_ACTIONS.CREATED,
        newValue: ticket.status,
      });

      const created = await populateTicket(Ticket.findById(ticket._id));
      return res.status(201).json({
        message: 'Ticket created successfully',
        ticket: created,
      });
    } catch (error) {
      console.error('Create ticket error:', error.message);

      if (error.code === 11000) {
        return res.status(409).json({
          message: 'Duplicate ticket ID. Please retry.',
        });
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          message: 'Ticket validation failed',
          error: error.message,
        });
      }

      return res.status(500).json({ message: 'Failed to create ticket' });
    }
  },
);

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ticket document ID' });
    }

    const ticket = await findTicketForRequest(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    if (!canReadTicket(req.user, ticket)) {
      return res.status(req.user.role === 'CUSTOMER' ? 404 : 403).json({
        message: req.user.role === 'CUSTOMER'
          ? 'Ticket not found'
          : 'You do not have permission to access this ticket',
      });
    }

    const includeInternal = req.user.role !== 'CUSTOMER';
    const bundle = await loadTicketBundle(ticket, { includeInternal });
    return res.status(200).json(bundle);
  } catch (error) {
    console.error('Fetch ticket error:', error.message);
    return res.status(500).json({ message: 'Failed to fetch ticket' });
  }
});

router.patch(
  '/:id',
  authenticateToken,
  allowRoles('SUPPORT', 'ADMIN'),
  async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid ticket document ID' });
      }

      const status = normalizeStatus(req.body.status);
      if (!status) {
        return res.status(400).json({ message: 'Invalid ticket status' });
      }

      const ticket = await findTicketForRequest(req.params.id);
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      if (!canMutateTicket(req.user, ticket)) {
        return res.status(403).json({
          message: 'You do not have permission to update this ticket',
        });
      }

      if (!canTransition(ticket.status, status)) {
        return res.status(400).json({
          message: `Cannot change status from ${ticket.status} to ${status}`,
        });
      }

      const previous = ticket.status;
      ticket.status = status;
      await ticket.save();

      await recordHistory({
        ticketId: ticket._id,
        actorId: req.user.sub,
        action: HISTORY_ACTIONS.STATUS_CHANGED,
        previousValue: previous,
        newValue: status,
      });

      const updated = await populateTicket(Ticket.findById(ticket._id));
      return res.status(200).json({
        message: 'Ticket status updated successfully',
        ticket: updated,
      });
    } catch (error) {
      console.error('Update ticket error:', error.message);
      return res.status(500).json({ message: 'Failed to update ticket' });
    }
  },
);

router.post(
  '/:id/assign',
  authenticateToken,
  allowRoles('ADMIN'),
  async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid ticket document ID' });
      }

      const agentId = req.body.agentId || req.body.assignedAgentId || null;
      if (agentId && !isObjectId(agentId)) {
        return res.status(400).json({ message: 'Invalid agent ID' });
      }

      const ticket = await findTicketForRequest(req.params.id);
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      let agent = null;
      if (agentId) {
        agent = await User.findOne({
          _id: agentId,
          role: 'SUPPORT',
          isActive: true,
        });

        if (!agent) {
          return res.status(400).json({
            message: 'Assigned user must be an active support agent',
          });
        }
      }

      const previous = ticket.assignedAgentId?.toString() || '';
      ticket.assignedAgentId = agent ? agent._id : null;
      await ticket.save();

      await recordHistory({
        ticketId: ticket._id,
        actorId: req.user.sub,
        action: HISTORY_ACTIONS.ASSIGNED,
        previousValue: previous,
        newValue: agent ? agent._id.toString() : '',
      });

      const updated = await populateTicket(Ticket.findById(ticket._id));
      return res.status(200).json({
        message: agent ? 'Ticket assigned successfully' : 'Ticket unassigned',
        ticket: updated,
      });
    } catch (error) {
      console.error('Assign ticket error:', error.message);
      return res.status(500).json({ message: 'Failed to assign ticket' });
    }
  },
);

router.post(
  '/:id/resolve',
  authenticateToken,
  allowRoles('SUPPORT', 'ADMIN'),
  async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid ticket document ID' });
      }

      const summary = typeof req.body.resolutionSummary === 'string'
        ? req.body.resolutionSummary.trim()
        : '';

      if (!summary) {
        return res.status(400).json({
          message: 'Resolution summary is required',
        });
      }

      const ticket = await findTicketForRequest(req.params.id);
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      if (!canMutateTicket(req.user, ticket)) {
        return res.status(403).json({
          message: 'You do not have permission to resolve this ticket',
        });
      }

      if (!canTransition(ticket.status, 'RESOLVED')) {
        return res.status(400).json({
          message: `Cannot resolve a ticket in ${ticket.status} status`,
        });
      }

      const previous = ticket.status;
      ticket.status = 'RESOLVED';
      ticket.resolutionSummary = summary;
      await ticket.save();

      await recordHistory({
        ticketId: ticket._id,
        actorId: req.user.sub,
        action: HISTORY_ACTIONS.RESOLVED,
        previousValue: previous,
        newValue: 'RESOLVED',
      });

      const updated = await populateTicket(Ticket.findById(ticket._id));
      return res.status(200).json({
        message: 'Ticket resolved successfully',
        ticket: updated,
      });
    } catch (error) {
      console.error('Resolve ticket error:', error.message);
      return res.status(500).json({ message: 'Failed to resolve ticket' });
    }
  },
);

router.post(
  '/:id/replies',
  authenticateToken,
  async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid ticket document ID' });
      }

      const text = typeof req.body.message === 'string'
        ? req.body.message.trim()
        : '';

      if (!text) {
        return res.status(400).json({ message: 'Reply message is required' });
      }

      const ticket = await findTicketForRequest(req.params.id);
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }
      if (!canReadTicket(req.user, ticket)) {
        return res.status(req.user.role === 'CUSTOMER' ? 404 : 403).json({
          message: req.user.role === 'CUSTOMER'
            ? 'Ticket not found'
            : 'You do not have permission to access this ticket',
        });
      }

      let visibility = MESSAGE_VISIBILITY.PUBLIC;
      if (req.user.role === 'CUSTOMER') {
        if (!customerReplyAllowed(ticket)) {
          return res.status(403).json({
            message: 'This ticket is closed and cannot receive customer replies',
          });
        }
      } else if (req.user.role === 'SUPPORT' || req.user.role === 'ADMIN') {
        if (!canMutateTicket(req.user, ticket) && req.user.role !== 'ADMIN') {
          return res.status(403).json({
            message: 'You do not have permission to reply to this ticket',
          });
        }
        if (req.body.visibility === MESSAGE_VISIBILITY.INTERNAL) {
          visibility = MESSAGE_VISIBILITY.INTERNAL;
        }
      } else {
        return res.status(403).json({
          message: 'You do not have permission to access this resource',
        });
      }

      const created = await TicketMessage.create({
        ticketId: ticket._id,
        authorId: req.user.sub,
        message: text,
        visibility,
      });

      await recordHistory({
        ticketId: ticket._id,
        actorId: req.user.sub,
        action: HISTORY_ACTIONS.REPLY_ADDED,
        newValue: visibility,
      });

      const populated = await created.populate('authorId', 'name role');
      return res.status(201).json({
        message: 'Reply added',
        reply: {
          id: populated._id.toString(),
          ticketId: ticket._id.toString(),
          author: {
            id: populated.authorId._id.toString(),
            name: populated.authorId.name,
            role: populated.authorId.role,
          },
          message: populated.message,
          visibility: populated.visibility,
          createdAt: populated.createdAt,
        },
      });
    } catch (error) {
      console.error('Add reply error:', error.message);
      return res.status(500).json({ message: 'Failed to add reply' });
    }
  },
);

export default router;
