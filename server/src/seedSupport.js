
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import User from './models/User.js';
import { connectDB } from './config/db.js';

async function seedSupportUser() {
  try {
    const { SUPPORT_NAME, SUPPORT_EMAIL, SUPPORT_PASSWORD, SUPPORT_ROLE } =
      process.env;

    if (!SUPPORT_NAME || !SUPPORT_EMAIL || !SUPPORT_PASSWORD) {
      throw new Error(
        'Set SUPPORT_NAME, SUPPORT_EMAIL and SUPPORT_PASSWORD in server/.env',
      );
    }

    const role = SUPPORT_ROLE || 'SUPPORT';

    if (!['SUPPORT', 'ADMIN'].includes(role)) {
      throw new Error('SUPPORT_ROLE must be SUPPORT or ADMIN');
    }

    if (SUPPORT_PASSWORD.length < 12) {
      throw new Error('Use a password with at least 12 characters');
    }

    await connectDB(process.env.MONGODB_URI);

    const email = SUPPORT_EMAIL.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(SUPPORT_PASSWORD, 12);

    let user = await User.findOne({ email });

    if (user) {
      user.name = SUPPORT_NAME.trim();
      user.password = hashedPassword;
      user.role = role;
      user.isActive = true;
      await user.save();

      console.log('Existing account updated successfully.');
    } else {
      user = await User.create({
        name: SUPPORT_NAME.trim(),
        email,
        password: hashedPassword,
        role,
        isActive: true,
      });

      console.log('New account created successfully.');
    }

    console.log('Account email:', user.email);
    console.log('Account role:', user.role);
  } catch (error) {
    console.error('Account setup failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedSupportUser();
