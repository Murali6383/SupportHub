import nodemailer from 'nodemailer';

function getTransporter() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASSWORD,
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error('Email service is not configured');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: SMTP_SECURE === 'true',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  });
}

export async function sendOtpEmail(email, otp) {
  const transporter = getTransporter();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'SupportHub Login Verification',
    text: `Your SupportHub verification code is ${otp}. It expires in 5 minutes. Do not share this code with anyone.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto">
        <h2>SupportHub</h2>
        <p>Use this verification code to sign in:</p>
        <h1 style="letter-spacing:8px">${otp}</h1>
        <p>This code expires in 5 minutes.</p>
        <p>If you did not request this code, you can ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email, resetUrl) {
  const transporter = getTransporter();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'SupportHub Password Reset',
    text: `Use this link to reset your SupportHub password. It expires in 5 minutes: ${resetUrl}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto">
        <h2>Reset your password</h2>
        <p>Click below to choose a new SupportHub password.</p>
        <p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 20px;background:#2563eb;color:white;text-decoration:none;border-radius:6px">
            Reset Password
          </a>
        </p>
        <p>This link expires in 5 minutes. If you did not request it, ignore this email.</p>
      </div>
    `,
  });
}