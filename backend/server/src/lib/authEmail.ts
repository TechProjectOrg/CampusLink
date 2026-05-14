import nodemailer from 'nodemailer';

function getOtpMailerFromAddress(): string {
  return (
    process.env.AUTH_OTP_FROM_EMAIL?.trim()
    || process.env.SMTP_FROM?.trim()
    || process.env.SMTP_USER?.trim()
    || 'no-reply@campuslynk.local'
  );
}

function createTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const portRaw = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !portRaw) {
    return null;
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('SMTP_PORT must be a valid number');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
}

export async function sendSignupOtpEmail(params: {
  email: string;
  code: string;
  fullName: string;
}): Promise<void> {
  const transport = createTransport();
  const from = getOtpMailerFromAddress();
  const subject = 'Your CampusLynk verification code';
  const text = [
    `Hi ${params.fullName || 'there'},`,
    '',
    `Your CampusLynk verification code is ${params.code}.`,
    'It expires in 10 minutes.',
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  if (!transport) {
    console.warn(`[auth] OTP email transport is not configured. Verification code for ${params.email}: ${params.code}`);
    return;
  }

  await transport.sendMail({
    from,
    to: params.email,
    subject,
    text,
  });
}
