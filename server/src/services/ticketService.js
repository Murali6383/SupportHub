import mongoose from 'mongoose';
import Counter from '../models/Counter.js';
import Ticket from '../models/Ticket.js';
import TicketHistory from '../models/TicketHistory.js';
import TicketMessage from '../models/TicketMessage.js';
import {
  HISTORY_ACTIONS,
  MESSAGE_VISIBILITY,
  STATUS_LABELS,
} from '../constants/tickets.js';

const TICKET_START = 10000;

export async function nextTicketNumber() {
  const existing = await Counter.findById('ticketNumber');

  if (!existing) {
    try {
      await Counter.create({ _id: 'ticketNumber', seq: TICKET_START });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  const counter = await Counter.findByIdAndUpdate(
    'ticketNumber',
    { $inc: { seq: 1 } },
    { new: true },
  );

  return `SH-${counter.seq}`;
}

export function populateTicket(query) {
  return query
    .populate('createdBy', 'name email role')
    .populate('assignedAgentId', 'name email role');
}

export function canReadTicket(user, ticket) {
  const customerId = ticket.createdBy?._id?.toString() || ticket.createdBy?.toString();
  const assignedId = ticket.assignedAgentId?._id?.toString()
    || ticket.assignedAgentId?.toString()
    || null;

  if (user.role === 'CUSTOMER') {
    return customerId === user.sub;
  }

  if (user.role === 'SUPPORT') {
    return assignedId === user.sub || assignedId === null;
  }

  return user.role === 'ADMIN';
}

export function canMutateTicket(user, ticket) {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'SUPPORT') return false;

  const assignedId = ticket.assignedAgentId?._id?.toString()
    || ticket.assignedAgentId?.toString()
    || null;

  return assignedId === user.sub;
}

export function customerReplyAllowed(ticket) {
  return ticket.status !== 'CLOSED';
}

export async function recordHistory({ ticketId, actorId, action, previousValue = '', newValue = '' }) {
  return TicketHistory.create({
    ticketId,
    actorId,
    action,
    previousValue,
    newValue,
  });
}

export function serializeMessage(message, includeInternal) {
  if (!includeInternal && message.visibility === MESSAGE_VISIBILITY.INTERNAL) {
    return null;
  }

  const author = message.authorId && typeof message.authorId === 'object'
    ? {
        id: message.authorId._id?.toString(),
        name: message.authorId.name,
        role: message.authorId.role,
      }
    : { id: message.authorId?.toString() };

  return {
    id: message._id.toString(),
    ticketId: message.ticketId.toString(),
    author,
    message: message.message,
    visibility: message.visibility,
    createdAt: message.createdAt,
  };
}

export function serializeHistory(entry) {
  const actor = entry.actorId && typeof entry.actorId === 'object'
    ? {
        id: entry.actorId._id?.toString(),
        name: entry.actorId.name,
        role: entry.actorId.role,
      }
    : { id: entry.actorId?.toString() };

  return {
    id: entry._id.toString(),
    ticketId: entry.ticketId.toString(),
    actor,
    action: entry.action,
    previousValue: entry.previousValue,
    newValue: entry.newValue,
    createdAt: entry.createdAt,
  };
}

export async function loadTicketBundle(ticket, { includeInternal }) {
  const [messages, history] = await Promise.all([
    TicketMessage.find({ ticketId: ticket._id })
      .sort({ createdAt: 1 })
      .populate('authorId', 'name role'),
    TicketHistory.find({ ticketId: ticket._id })
      .sort({ createdAt: 1 })
      .populate('actorId', 'name role'),
  ]);

  return {
    ticket,
    messages: messages
      .map((item) => serializeMessage(item, includeInternal))
      .filter(Boolean),
    history: history.map(serializeHistory),
  };
}

export async function findTicketForRequest(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return populateTicket(Ticket.findById(id));
}

export { HISTORY_ACTIONS, MESSAGE_VISIBILITY, STATUS_LABELS };
