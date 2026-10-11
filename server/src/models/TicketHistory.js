import mongoose from 'mongoose';
import { HISTORY_ACTIONS } from '../constants/tickets.js';

const ticketHistorySchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      enum: Object.values(HISTORY_ACTIONS),
      required: true,
    },
    previousValue: {
      type: String,
      default: '',
    },
    newValue: {
      type: String,
      default: '',
    },
  },
  { timestamps: true },
);

ticketHistorySchema.index({ ticketId: 1, createdAt: 1 });

export default mongoose.model('TicketHistory', ticketHistorySchema);
