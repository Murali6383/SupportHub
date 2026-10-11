import mongoose from 'mongoose';
import { MESSAGE_VISIBILITY } from '../constants/tickets.js';

const ticketMessageSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true,
      index: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    visibility: {
      type: String,
      enum: Object.values(MESSAGE_VISIBILITY),
      default: MESSAGE_VISIBILITY.PUBLIC,
    },
  },
  { timestamps: true },
);

ticketMessageSchema.index({ ticketId: 1, createdAt: 1 });

export default mongoose.model('TicketMessage', ticketMessageSchema);
