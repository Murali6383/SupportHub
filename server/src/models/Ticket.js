import mongoose from 'mongoose';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  STATUS_LABELS,
  normalizeStatus,
} from '../constants/tickets.js';

const ticketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: '',
    },
    category: {
      type: String,
      enum: TICKET_CATEGORIES,
      default: 'Other',
    },
    customer: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    priority: {
      type: String,
      enum: TICKET_PRIORITIES,
      default: 'Medium',
    },
    status: {
      type: String,
      enum: TICKET_STATUSES,
      default: 'OPEN',
      set: (value) => normalizeStatus(value) || value,
    },
    resolutionSummary: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true },
);

ticketSchema.post('init', function normalizeLegacyStatus() {
  const normalized = normalizeStatus(this.status);
  if (normalized && this.status !== normalized) {
    this.set('status', normalized);
    this.unmarkModified('status');
  }
});

ticketSchema.index({ createdBy: 1, createdAt: -1 });
ticketSchema.index({ assignedAgentId: 1, status: 1, createdAt: -1 });
ticketSchema.index({ status: 1, priority: 1, createdAt: -1 });
ticketSchema.index({ category: 1 });

ticketSchema.virtual('ticketNumber').get(function ticketNumber() {
  return this.ticketId;
});

ticketSchema.virtual('customerId').get(function customerId() {
  return this.createdBy;
});

function publicUser(user) {
  if (!user) return null;
  if (typeof user === 'object' && user._id) {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
  return user.toString();
}

ticketSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    ret.ticketNumber = ret.ticketId;
    ret.customerId = ret.createdBy?._id || ret.createdBy;
    ret.statusLabel = STATUS_LABELS[ret.status] || ret.status;
    ret.assignedAgent = publicUser(ret.assignedAgentId);
    if (ret.assignedAgentId && typeof ret.assignedAgentId === 'object') {
      ret.assignedAgentId = ret.assignedAgentId._id;
    }
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Ticket', ticketSchema);
