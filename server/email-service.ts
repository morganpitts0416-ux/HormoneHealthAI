// Email service — powered by Resend once connected
// Swap `sendEmail` implementation once RESEND_API_KEY is available.

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(opts: EmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log("[EMAIL STUB] Would send email:", {
      to: opts.to,
      subject: opts.subject,
    });
    console.log("[EMAIL STUB] HTML preview:\n", opts.html.replace(/<[^>]+>/g, "").substring(0, 400));
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "noreply@realignhealth.com",
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend API error ${response.status}: ${text}`);
  }
}

function getBaseUrl(req?: { protocol?: string; get?: (h: string) => string | undefined }): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (req?.get) {
    const host = req.get("host") || "localhost:5000";
    const proto = req.get("x-forwarded-proto") || req.protocol || "https";
    return `${proto}://${host}`;
  }
  return "https://realignhealth.com";
}

export async function sendInviteEmail(
  to: string,
  firstName: string,
  token: string,
  req?: any
): Promise<void> {
  const base = getBaseUrl(req);
  const link = `${base}/set-password?token=${token}`;

  await sendEmail({
    to,
    subject: "You've been invited to ReAlign Health — set your password",
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #fff;">
        <div style="background: #2e3a20; padding: 28px 32px;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">ReAlign Health</h1>
          <p style="color: #a8b88c; margin: 4px 0 0; font-size: 13px;">Clinical Lab Interpretation Platform</p>
        </div>
        <div style="padding: 36px 32px;">
          <p style="color: #1c2414; font-size: 16px; margin: 0 0 16px;">Hello ${firstName},</p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            An administrator has created a ReAlign Health clinician account for you.
            Click the button below to set your password and activate your account.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${link}" style="background: #2e3a20; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
              Set My Password
            </a>
          </div>
          <p style="color: #7a8a64; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
            This invite link expires in <strong>72 hours</strong>. If you didn't expect this email, you can safely ignore it.
          </p>
          <p style="color: #7a8a64; font-size: 12px; margin: 8px 0 0; word-break: break-all;">
            Or copy this link: ${link}
          </p>
        </div>
        <div style="border-top: 1px solid #e8ddd0; padding: 16px 32px; text-align: center;">
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">ReAlign Health &mdash; Clinician Lab Interpretation Platform</p>
        </div>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  firstName: string,
  token: string,
  req?: any
): Promise<void> {
  const base = getBaseUrl(req);
  const link = `${base}/reset-password?token=${token}`;

  await sendEmail({
    to,
    subject: "Reset your ReAlign Health password",
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #fff;">
        <div style="background: #2e3a20; padding: 28px 32px;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">ReAlign Health</h1>
          <p style="color: #a8b88c; margin: 4px 0 0; font-size: 13px;">Clinical Lab Interpretation Platform</p>
        </div>
        <div style="padding: 36px 32px;">
          <p style="color: #1c2414; font-size: 16px; margin: 0 0 16px;">Hello ${firstName},</p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            We received a request to reset your ReAlign Health password. Click the button below to choose a new one.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${link}" style="background: #2e3a20; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
              Reset My Password
            </a>
          </div>
          <p style="color: #7a8a64; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
            This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password will not change.
          </p>
          <p style="color: #7a8a64; font-size: 12px; margin: 8px 0 0; word-break: break-all;">
            Or copy this link: ${link}
          </p>
        </div>
        <div style="border-top: 1px solid #e8ddd0; padding: 16px 32px; text-align: center;">
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">ReAlign Health &mdash; Clinician Lab Interpretation Platform</p>
        </div>
      </div>
    `,
  });
}
