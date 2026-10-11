import twilio from 'twilio';

function getTwilioClient() {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_VERIFY_SERVICE_SID,
  } = process.env;

  if (
    !TWILIO_ACCOUNT_SID ||
    !TWILIO_AUTH_TOKEN ||
    !TWILIO_VERIFY_SERVICE_SID
  ) {
    throw new Error('SMS OTP service is not configured');
  }

  return {
    client: twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
    serviceSid: TWILIO_VERIFY_SERVICE_SID,
  };
}

export async function sendMobileOtp(phone) {
  const { client, serviceSid } = getTwilioClient();

  return client.verify.v2
    .services(serviceSid)
    .verifications.create({
      to: phone,
      channel: 'sms',
    });
}

export async function verifyMobileOtp(phone, code) {
  const { client, serviceSid } = getTwilioClient();

  const result = await client.verify.v2
    .services(serviceSid)
    .verificationChecks.create({
      to: phone,
      code,
    });

  return result.status === 'approved';
}