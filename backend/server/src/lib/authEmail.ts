import { Resend } from 'resend';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  return new Resend(apiKey);
}

function getMagicLinkFromAddress(): string {
  return (
    process.env.AUTH_MAGIC_LINK_FROM_EMAIL?.trim()
    || process.env.RESEND_FROM_EMAIL?.trim()
    || process.env.SMTP_FROM?.trim()
    || 'CampusLynk <onboarding@resend.dev>'
  );
}

export async function sendMagicLinkEmail(params: {
  email: string;
  magicLinkUrl: string;
}): Promise<void> {
  const resend = getResendClient();

  const result = await resend.emails.send({
    from: getMagicLinkFromAddress(),
    to: [params.email],
    subject: 'Login to CampusLink',
    html: `
      <div style="font-family: Inter, Arial, sans-serif; background:#f8fafc; padding:32px;">
        <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:24px; padding:40px; border:1px solid #e2e8f0;">
          <p style="margin:0 0 12px; color:#0f172a; font-size:28px; font-weight:700;">CampusLynk</p>
          <p style="margin:0 0 12px; color:#0f172a; font-size:20px; font-weight:600;">Continue securely</p>
          <p style="margin:0 0 28px; color:#475569; font-size:15px; line-height:1.7;">
            Click the button below to continue securely.
          </p>
          <a
            href="${params.magicLinkUrl}"
            style="display:inline-block; background:#2563eb; color:#ffffff; text-decoration:none; padding:14px 24px; border-radius:999px; font-weight:600;"
          >
            Open CampusLynk
          </a>
          <p style="margin:28px 0 0; color:#64748b; font-size:13px; line-height:1.7;">
            This link expires in 10 minutes and can only be used once.
          </p>
        </div>
      </div>
    `,
  });

  if (result.error) {
    throw new Error(result.error.message || 'Resend could not deliver the magic link email');
  }
}

function getVerificationFromAddress(): string {
  return (
    process.env.AUTH_VERIFICATION_FROM_EMAIL?.trim()
    || process.env.AUTH_MAGIC_LINK_FROM_EMAIL?.trim()
    || process.env.RESEND_FROM_EMAIL?.trim()
    || process.env.SMTP_FROM?.trim()
    || 'CampusLynk <onboarding@resend.dev>'
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendVerificationDecisionEmail(params: {
  email: string;
  displayName?: string | null;
  status: 'approved' | 'rejected' | 'more_info';
  decisionNote?: string | null;
  actionUrl?: string | null;
}): Promise<void> {
  const resend = getResendClient();
  const safeName = escapeHtml(params.displayName?.trim() || 'there');
  const safeDecisionNote = params.decisionNote?.trim() ? escapeHtml(params.decisionNote.trim()) : '';

  const statusCopy = {
    approved: {
      subject: 'Your CampusLynk alumni verification was approved',
      title: 'Verification approved',
      body: 'Your alumni verification has been approved. You can now log in to CampusLynk and access your account.',
      ctaLabel: 'Log in to CampusLynk',
    },
    rejected: {
      subject: 'Your CampusLynk alumni verification was rejected',
      title: 'Verification rejected',
      body: 'Your alumni verification was rejected. Please contact support if you believe this was a mistake.',
      ctaLabel: '',
    },
    more_info: {
      subject: 'More alumni verification proof is required',
      title: 'More proof needed',
      body: 'An admin reviewed your alumni verification and requested more supporting proof before approval.',
      ctaLabel: 'Upload more proof',
    },
  }[params.status];

  const noteBlock = safeDecisionNote
    ? `
        <div style="margin:24px 0 0; padding:16px 18px; border-radius:16px; background:#f8fafc; border:1px solid #e2e8f0;">
          <p style="margin:0 0 8px; color:#0f172a; font-size:14px; font-weight:600;">Admin note</p>
          <p style="margin:0; color:#475569; font-size:14px; line-height:1.7;">${safeDecisionNote}</p>
        </div>
      `
    : '';

  const actionBlock = params.actionUrl && statusCopy.ctaLabel
    ? `
        <a
          href="${params.actionUrl}"
          style="display:inline-block; margin-top:28px; background:#2563eb; color:#ffffff; text-decoration:none; padding:14px 24px; border-radius:999px; font-weight:600;"
        >
          ${statusCopy.ctaLabel}
        </a>
      `
    : '';

  const result = await resend.emails.send({
    from: getVerificationFromAddress(),
    to: [params.email],
    subject: statusCopy.subject,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; background:#f8fafc; padding:32px;">
        <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:24px; padding:40px; border:1px solid #e2e8f0;">
          <p style="margin:0 0 12px; color:#0f172a; font-size:28px; font-weight:700;">CampusLynk</p>
          <p style="margin:0 0 8px; color:#0f172a; font-size:20px; font-weight:600;">${statusCopy.title}</p>
          <p style="margin:0 0 12px; color:#0f172a; font-size:15px;">Hi ${safeName},</p>
          <p style="margin:0; color:#475569; font-size:15px; line-height:1.7;">
            ${statusCopy.body}
          </p>
          ${noteBlock}
          ${actionBlock}
        </div>
      </div>
    `,
  });

  if (result.error) {
    throw new Error(result.error.message || 'Resend could not deliver the verification decision email');
  }
}
