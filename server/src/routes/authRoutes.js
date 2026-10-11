import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import {
  createHash,
  createHmac,
  randomInt,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import User from '../models/User.js';
import OtpChallenge from '../models/OtpChallenge.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import { authenticateToken, allowRoles } from '../middleware/auth.js';
import {
  sendOtpEmail,
  sendPasswordResetEmail,
} from '../services/emailService.js';
import {
  sendMobileOtp,
  verifyMobileOtp,
} from '../services/smsService.js';
import { OAuth2Client } from 'google-auth-library';

const router = express.Router();
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
);

const OTP_TTL = Number(process.env.OTP_TTL_SECONDS || 300);
const RESEND_COOLDOWN = Number(
  process.env.OTP_RESEND_COOLDOWN_SECONDS || 60,
);
const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const RESET_TTL = Number(
  process.env.PASSWORD_RESET_TTL_SECONDS || 300,
);

const genericOtpMessage =
  'If the account is eligible, a verification code will be sent.';

const genericResetMessage =
  'If an account exists for that email, password reset instructions will be sent.';

const skipRateLimit = () => process.env.NODE_ENV === 'test';

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  message: { message: 'Too many requests. Please try again later.' },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  message: { message: 'Too many attempts. Please try again later.' },
});

function normalizeEmail(email) {
  return typeof email === 'string'
    ? email.trim().toLowerCase()
    : '';
}

function validPhone(phone) {
  // E.164 format, e.g. +919876543210
  return typeof phone === 'string' &&
    /^\+[1-9]\d{7,14}$/.test(phone);
}

function otpHash(code) {
  const secret = process.env.OTP_HASH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('OTP_HASH_SECRET is missing or too short');
  }

  return createHmac('sha256', secret)
    .update(code)
    .digest('hex');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hashesMatch(first, second) {
  const a = Buffer.from(first, 'hex');
  const b = Buffer.from(second, 'hex');

  return a.length === b.length && timingSafeEqual(a, b);
}

function createJwt(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  const token = jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' },
  );

  return {
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive !== false,
      phone: user.phone || null,
      phoneVerified: Boolean(user.phoneVerified),
    },
  };
}

function sendLoginResponse(res, user, message = 'Login successful') {
  return res.json({
    message,
    ...createJwt(user),
  });
}

// GOOGLE LOGIN
router.post('/google', verifyLimiter, async (req, res) => {
  try {
    const { credential } = req.body;

    if (
      typeof credential !== 'string' ||
      !process.env.GOOGLE_CLIENT_ID
    ) {
      return res.status(400).json({
        message: 'Google credential is required',
      });
    }

    // Verify the Google ID token on the backend.
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (
      !payload?.sub ||
      !payload.email ||
      payload.email_verified !== true
    ) {
      return res.status(401).json({
        message: 'Google account could not be verified',
      });
    }

    const email = normalizeEmail(payload.email);

    let user = await User.findOne({ email });

    if (!user) {
      // Generate an unusable random password for Google-only users.
      const randomPassword = randomBytes(32).toString('hex');

      user = await User.create({
        name: payload.name?.trim() || email.split('@')[0],
        email,
        password: await bcrypt.hash(randomPassword, 12),
        role: 'CUSTOMER',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: 'This account is deactivated. Contact an administrator.',
      });
    }

    return sendLoginResponse(res, user);
  } catch (error) {
    console.error('Google login failed:', error.message);

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Account conflict. Please try signing in again.',
      });
    }

    return res.status(401).json({
      message: 'Google sign-in failed. Please try again.',
    });
  }
});

// --------------------------------------------------
// CUSTOMER REGISTRATION — existing functionality
// --------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!name?.trim() || !normalizedEmail || !password) {
      return res.status(400).json({
        message: 'Name, email and password are required',
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
      role: 'CUSTOMER',
      isActive: true,
    });

    return res.status(201).json({
      message: 'Customer registered successfully',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Email is already registered',
      });
    }

    console.error('Registration failed:', error.message);
    return res.status(500).json({ message: 'Registration failed' });
  }
});

// --------------------------------------------------
// EXISTING EMAIL + PASSWORD LOGIN
// --------------------------------------------------
router.post('/login', verifyLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!normalizeEmail(email) || !password) {
      return res.status(400).json({
        message: 'Email and password are required',
      });
    }

    const user = await User.findOne({
      email: normalizeEmail(email),
    }).select('+password');

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: 'This account is deactivated. Contact an administrator.',
      });
    }

    return sendLoginResponse(res, user);
  } catch (error) {
    console.error('Login failed:', error.message);
    return res.status(500).json({ message: 'Login failed' });
  }
});

// --------------------------------------------------
// EMAIL OTP — REQUEST
// --------------------------------------------------
router.post(
  '/email-otp/request',
  requestLimiter,
  async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const user = await User.findOne({
        email,
        role: 'CUSTOMER',
      });

      // Avoid revealing whether an account exists.
      if (!user) {
        return res.json({ message: genericOtpMessage });
      }

      const now = new Date();
      const existing = await OtpChallenge.findOne({
        userId: user._id,
        purpose: 'EMAIL_LOGIN',
      });

      if (
        existing?.lastSentAt &&
        now.getTime() - existing.lastSentAt.getTime() <
          RESEND_COOLDOWN * 1000
      ) {
        return res.json({ message: genericOtpMessage });
      }

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

      const challenge = await OtpChallenge.findOneAndUpdate(
        {
          userId: user._id,
          purpose: 'EMAIL_LOGIN',
        },
        {
          $set: {
            otpHash: otpHash(code),
            expiresAt: new Date(now.getTime() + OTP_TTL * 1000),
            attempts: 0,
            lastSentAt: now,
          },
          $setOnInsert: {
            userId: user._id,
            purpose: 'EMAIL_LOGIN',
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );

      try {
        await sendOtpEmail(user.email, code);
      } catch (mailError) {
        await OtpChallenge.deleteOne({
          _id: challenge._id,
          otpHash: otpHash(code),
        });

        console.error('OTP email delivery failed:', mailError.message);
        return res.status(503).json({
          message: 'Email delivery is temporarily unavailable',
        });
      }

      return res.json({ message: genericOtpMessage });
    } catch (error) {
      console.error('Email OTP request failed:', error.message);
      return res.status(500).json({
        message: 'Could not process email OTP request',
      });
    }
  },
);

// --------------------------------------------------
// EMAIL OTP — VERIFY AND LOGIN
// --------------------------------------------------
router.post(
  '/email-otp/verify',
  verifyLimiter,
  async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const code = typeof req.body.code === 'string'
        ? req.body.code.trim()
        : '';

      if (!email || !/^\d{6}$/.test(code)) {
        return res.status(400).json({
          message: 'A valid email and six-digit code are required',
        });
      }

      const user = await User.findOne({
        email,
        role: 'CUSTOMER',
      });

      if (!user) {
        return res.status(401).json({
          message: 'Invalid or expired verification code',
        });
      }

      const challenge = await OtpChallenge.findOne({
        userId: user._id,
        purpose: 'EMAIL_LOGIN',
        expiresAt: { $gt: new Date() },
      }).select('+otpHash');

      if (!challenge || challenge.attempts >= MAX_ATTEMPTS) {
        return res.status(401).json({
          message: 'Invalid or expired verification code',
        });
      }

      const submittedHash = otpHash(code);

      if (!hashesMatch(submittedHash, challenge.otpHash)) {
        await OtpChallenge.updateOne(
          {
            _id: challenge._id,
            attempts: challenge.attempts,
          },
          { $inc: { attempts: 1 } },
        );

        if (challenge.attempts + 1 >= MAX_ATTEMPTS) {
          await OtpChallenge.deleteOne({ _id: challenge._id });
        }

        return res.status(401).json({
          message: 'Invalid or expired verification code',
        });
      }

      // Atomically consume the code so it cannot be reused.
      const consumed = await OtpChallenge.deleteOne({
        _id: challenge._id,
        otpHash: challenge.otpHash,
        attempts: challenge.attempts,
        expiresAt: { $gt: new Date() },
      });

      if (consumed.deletedCount !== 1) {
        return res.status(401).json({
          message: 'Invalid or expired verification code',
        });
      }

      return sendLoginResponse(res, user);
    } catch (error) {
      console.error('Email OTP verification failed:', error.message);
      return res.status(500).json({
        message: 'Could not verify email OTP',
      });
    }
  },
);

// --------------------------------------------------
// LOGGED-IN CUSTOMER — REQUEST PHONE VERIFICATION
// --------------------------------------------------
router.post(
  '/phone/request-verification',
  authenticateToken,
  allowRoles('CUSTOMER'),
  requestLimiter,
  async (req, res) => {
    try {
      const phone = req.body.phone;

      if (!validPhone(phone)) {
        return res.status(400).json({
          message: 'Enter a valid phone number in E.164 format',
        });
      }

      const existingUser = await User.findOne({
        phone,
        _id: { $ne: req.user.sub },
      });

      if (existingUser) {
        return res.status(409).json({
          message: 'This phone number cannot be used',
        });
      }

      const result = await sendMobileOtp(phone);

      if (result.status !== 'pending') {
        return res.status(503).json({
          message: 'Could not send mobile verification code',
        });
      }

      return res.json({
        message: 'If the number is eligible, a verification code will be sent.',
      });
    } catch (error) {
      console.error('Phone verification request failed:', error.message);
      return res.status(503).json({
        message: 'Mobile OTP service is unavailable',
      });
    }
  },
);

// --------------------------------------------------
// LOGGED-IN CUSTOMER — VERIFY AND LINK PHONE
// --------------------------------------------------
router.post(
  '/phone/verify',
  authenticateToken,
  allowRoles('CUSTOMER'),
  verifyLimiter,
  async (req, res) => {
    try {
      const { phone, code } = req.body;

      if (!validPhone(phone) || typeof code !== 'string' ||
          !/^\d{4,10}$/.test(code)) {
        return res.status(400).json({
          message: 'Valid phone number and verification code are required',
        });
      }

      const approved = await verifyMobileOtp(phone, code);

      if (!approved) {
        return res.status(400).json({
          message: 'Invalid or expired verification code',
        });
      }

      const duplicate = await User.findOne({
        phone,
        _id: { $ne: req.user.sub },
      });

      if (duplicate) {
        return res.status(409).json({
          message: 'This phone number cannot be used',
        });
      }

      const user = await User.findByIdAndUpdate(
        req.user.sub,
        {
          $set: {
            phone,
            phoneVerified: true,
          },
        },
        { new: true, runValidators: true },
      ).select('name email role phone phoneVerified');

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.json({
        message: 'Phone number verified successfully',
        user,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message: 'This phone number cannot be used',
        });
      }

      console.error('Phone verification failed:', error.message);
      return res.status(500).json({
        message: 'Could not verify phone number',
      });
    }
  },
);

// --------------------------------------------------
// MOBILE OTP LOGIN — REQUEST
// --------------------------------------------------
router.post(
  '/mobile-otp/request',
  requestLimiter,
  async (req, res) => {
    try {
      const phone = req.body.phone;

      if (!validPhone(phone)) {
        return res.status(400).json({
          message: 'Enter a valid phone number in E.164 format',
        });
      }

      const user = await User.findOne({
        phone,
        phoneVerified: true,
        role: 'CUSTOMER',
      });

      if (!user) {
        return res.json({ message: genericOtpMessage });
      }

      const result = await sendMobileOtp(phone);

      if (result.status !== 'pending') {
        return res.status(503).json({
          message: 'Mobile OTP service is temporarily unavailable',
        });
      }

      return res.json({ message: genericOtpMessage });
    } catch (error) {
      console.error('Mobile OTP request failed:', error.message);
      return res.status(503).json({
        message: 'Mobile OTP service is temporarily unavailable',
      });
    }
  },
);

// --------------------------------------------------
// MOBILE OTP LOGIN — VERIFY
// --------------------------------------------------
router.post(
  '/mobile-otp/verify',
  verifyLimiter,
  async (req, res) => {
    try {
      const { phone, code } = req.body;

      if (!validPhone(phone) || typeof code !== 'string' ||
          !/^\d{4,10}$/.test(code)) {
        return res.status(400).json({
          message: 'Valid phone number and verification code are required',
        });
      }

      const approved = await verifyMobileOtp(phone, code);

      if (!approved) {
        return res.status(401).json({
          message: 'Invalid or expired verification code',
        });
      }

      const user = await User.findOne({
        phone,
        phoneVerified: true,
        role: 'CUSTOMER',
      });

      if (!user) {
        return res.status(401).json({
          message: 'Unable to sign in with this phone number',
        });
      }

      return sendLoginResponse(res, user);
    } catch (error) {
      console.error('Mobile OTP verification failed:', error.message);
      return res.status(500).json({
        message: 'Could not verify mobile OTP',
      });
    }
  },
);

// --------------------------------------------------
// FORGOT PASSWORD
// --------------------------------------------------
router.post(
  '/forgot-password',
  requestLimiter,
  async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const user = await User.findOne({ email });

      // Same response for existing and non-existing accounts.
      if (!user) {
        return res.json({ message: genericResetMessage });
      }

      const latestToken = await PasswordResetToken.findOne({
        userId: user._id,
      }).sort({ createdAt: -1 });

      if (
        latestToken &&
        Date.now() - latestToken.createdAt.getTime() <
          RESEND_COOLDOWN * 1000
      ) {
        return res.json({ message: genericResetMessage });
      }

      const rawToken = randomBytes(32).toString('hex');

      const resetRecord = await PasswordResetToken.create({
        userId: user._id,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + RESET_TTL * 1000),
      });

      const resetUrl = new URL('/', process.env.CLIENT_URL);
      resetUrl.searchParams.set('resetToken', rawToken);

      try {
        await sendPasswordResetEmail(user.email, resetUrl.toString());
      } catch (mailError) {
        await PasswordResetToken.deleteOne({ _id: resetRecord._id });
        console.error('Password reset email failed:', mailError.message);
      }

      return res.json({ message: genericResetMessage });
    } catch (error) {
      console.error('Forgot password failed:', error.message);
      // Avoid disclosing whether an account exists.
      return res.json({ message: genericResetMessage });
    }
  },
);

// --------------------------------------------------
// RESET PASSWORD
// --------------------------------------------------
router.post(
  '/reset-password',
  verifyLimiter,
  async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (
        typeof token !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(token) ||
        typeof newPassword !== 'string'
      ) {
        return res.status(400).json({
          message: 'Valid reset token and new password are required',
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          message: 'Password must contain at least 8 characters',
        });
      }

      const tokenHash = sha256(token);
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Atomic consume: only one request can use this token.
      const resetRecord = await PasswordResetToken.findOneAndDelete({
        tokenHash,
        expiresAt: { $gt: new Date() },
      });

      if (!resetRecord) {
        return res.status(400).json({
          message: 'Reset link is invalid or expired',
        });
      }

      const user = await User.findByIdAndUpdate(
        resetRecord.userId,
        { $set: { password: passwordHash } },
        { new: true },
      );

      if (!user) {
        return res.status(400).json({
          message: 'Reset link is invalid or expired',
        });
      }

      // Remove any other outstanding reset links for this user.
      await PasswordResetToken.deleteMany({
        userId: resetRecord.userId,
      });

      return res.json({
        message: 'Password reset successful. Please sign in again.',
      });
    } catch (error) {
      console.error('Password reset failed:', error.message);
      return res.status(500).json({
        message: 'Could not reset password',
      });
    }
  },
);

// --------------------------------------------------
// CURRENT LOGGED-IN USER
// --------------------------------------------------
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub).select(
      'name email role phone phoneVerified isActive',
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ user });
  } catch (error) {
    console.error('Profile fetch failed:', error.message);
    return res.status(500).json({
      message: 'Failed to fetch profile',
    });
  }
});

export default router;