import mongoose from 'mongoose';

const otpChallengeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    purpose: {
      type: String,
      enum: ['EMAIL_LOGIN'],
      required: true,
    },

    otpHash: {
      type: String,
      required: true,
      select: false,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    lastSentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Oru user-ku, oru purpose-ku oru active challenge.
otpChallengeSchema.index(
  { userId: 1, purpose: 1 },
  { unique: true },
);

// Expired documents-ai MongoDB background-la clean pannum.
// Verification endpoint expiry-ai thaniya check pannanum.
otpChallengeSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);

export default mongoose.model(
  'OtpChallenge',
  otpChallengeSchema,
);