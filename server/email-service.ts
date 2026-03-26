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

export async function sendPatientPortalInviteEmail(
  to: string,
  patientFirstName: string,
  clinicName: string,
  token: string,
  req?: any
): Promise<void> {
  const base = getBaseUrl(req);
  const link = `${base}/portal/set-password?token=${token}`;

  await sendEmail({
    to,
    subject: `${clinicName} has invited you to your personal health portal`,
    html: `
      <div style="font-family: 'Inter', Georgia, serif; max-width: 560px; margin: 0 auto; background: #fffdf9;">
        <div style="background: #2e3a20; padding: 28px 32px; text-align: center;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">ReAlign Health</h1>
          <p style="color: #a8b88c; margin: 6px 0 0; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase;">Your Personal Wellness Portal</p>
        </div>
        <div style="padding: 40px 32px; background: #fffdf9;">
          <p style="color: #2e3a20; font-size: 28px; font-weight: 700; margin: 0 0 8px; line-height: 1.2;">Hello, ${patientFirstName}.</p>
          <p style="color: #7a8a64; font-size: 14px; margin: 0 0 28px; letter-spacing: 0.3px;">${clinicName}</p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.7; margin: 0 0 12px;">
            Your care team has set up a private health portal just for you. Inside, you'll find:
          </p>
          <ul style="color: #3d4a30; font-size: 14px; line-height: 2; margin: 0 0 28px; padding-left: 20px;">
            <li>Your lab results explained in plain language</li>
            <li>Your personalized wellness supplement protocol</li>
            <li>Your health trends over time</li>
            <li>Notes and updates from your care team</li>
          </ul>
          <div style="text-align: center; margin: 36px 0;">
            <a href="${link}" style="background: #2e3a20; color: #e8ddd0; padding: 16px 40px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block; letter-spacing: 0.3px;">
              Access My Health Portal
            </a>
          </div>
          <p style="color: #7a8a64; font-size: 13px; line-height: 1.6; margin: 24px 0 0; text-align: center;">
            This invitation expires in <strong>72 hours</strong>. Your health data is private and secure — only you and your care team can access it.
          </p>
          <p style="color: #b0b8a0; font-size: 12px; margin: 12px 0 0; word-break: break-all; text-align: center;">
            ${link}
          </p>
        </div>
        <div style="border-top: 1px solid #e8ddd0; padding: 20px 32px; text-align: center; background: #f5f0e8;">
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">Powered by ReAlign Health &mdash; Thoughtful Care, Personalized Wellness</p>
        </div>
      </div>
    `,
  });
}

export async function sendStaffInviteEmail(
  to: string,
  staffFirstName: string,
  clinicName: string,
  clinicianName: string,
  token: string,
  req?: any
): Promise<void> {
  const base = getBaseUrl(req);
  const link = `${base}/staff-set-password?token=${token}`;

  await sendEmail({
    to,
    subject: `You've been invited to join ${clinicName} on ReAlign Health`,
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #fff;">
        <div style="background: #2e3a20; padding: 28px 32px;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">ReAlign Health</h1>
          <p style="color: #a8b88c; margin: 4px 0 0; font-size: 13px;">Clinical Lab Interpretation Platform</p>
        </div>
        <div style="padding: 36px 32px;">
          <p style="color: #1c2414; font-size: 16px; margin: 0 0 16px;">Hi ${staffFirstName},</p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            <strong>${clinicianName}</strong> at <strong>${clinicName}</strong> has invited you to join their ReAlign Health workspace.
          </p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            As a team member, you'll have access to patient lab evaluations, supplement protocols, and portal messaging — all within their clinic account.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${link}" style="background: #2e3a20; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
              Set Up My Access
            </a>
          </div>
          <p style="color: #7a8a64; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
            This invite link expires in <strong>72 hours</strong>. Once you set your password, you can log in at any time using your email address.
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

export async function sendProtocolPublishedEmail(
  to: string,
  patientFirstName: string,
  clinicName: string,
  clinicianName: string,
  supplementCount: number,
  req?: any
): Promise<void> {
  const base = getBaseUrl(req);
  const link = `${base}/portal/dashboard`;

  await sendEmail({
    to,
    subject: `${clinicName} has updated your wellness protocol`,
    html: `
      <div style="font-family: 'Inter', Georgia, serif; max-width: 560px; margin: 0 auto; background: #fffdf9;">
        <div style="background: #2e3a20; padding: 28px 32px; text-align: center;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">ReAlign Health</h1>
          <p style="color: #a8b88c; margin: 6px 0 0; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase;">Your Wellness Portal</p>
        </div>
        <div style="padding: 40px 32px; background: #fffdf9;">
          <p style="color: #2e3a20; font-size: 24px; font-weight: 700; margin: 0 0 8px; line-height: 1.2;">New protocol shared.</p>
          <p style="color: #7a8a64; font-size: 14px; margin: 0 0 28px;">${clinicName}</p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.7; margin: 0 0 12px;">
            Hi ${patientFirstName}, your care team${clinicianName ? ` (${clinicianName})` : ''} has shared an updated wellness supplement protocol with you —
            <strong>${supplementCount} supplement${supplementCount !== 1 ? 's' : ''}</strong> tailored to your latest lab results.
          </p>
          <div style="text-align: center; margin: 36px 0;">
            <a href="${link}" style="background: #2e3a20; color: #e8ddd0; padding: 16px 40px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block; letter-spacing: 0.3px;">
              View My Protocol
            </a>
          </div>
          <p style="color: #7a8a64; font-size: 13px; line-height: 1.6; margin: 24px 0 0; text-align: center;">
            Log in to your portal to see your full protocol, including dosing instructions and the clinical rationale behind each recommendation.
          </p>
        </div>
        <div style="border-top: 1px solid #e8ddd0; padding: 20px 32px; text-align: center; background: #f5f0e8;">
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">Powered by ReAlign Health &mdash; Thoughtful Care, Personalized Wellness</p>
        </div>
      </div>
    `,
  });
}

export async function sendNewPortalMessageEmail(
  to: string,
  patientFirstName: string,
  clinicName: string,
  clinicianName: string,
  messagePreview: string,
  req?: any
): Promise<void> {
  const base = getBaseUrl(req);
  const link = `${base}/portal/messages`;

  // Truncate preview to ~120 chars
  const preview = messagePreview.length > 120
    ? messagePreview.substring(0, 117) + '…'
    : messagePreview;

  await sendEmail({
    to,
    subject: `New message from ${clinicName}`,
    html: `
      <div style="font-family: 'Inter', Georgia, serif; max-width: 560px; margin: 0 auto; background: #fffdf9;">
        <div style="background: #2e3a20; padding: 28px 32px; text-align: center;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">ReAlign Health</h1>
          <p style="color: #a8b88c; margin: 6px 0 0; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase;">Your Wellness Portal</p>
        </div>
        <div style="padding: 40px 32px; background: #fffdf9;">
          <p style="color: #2e3a20; font-size: 24px; font-weight: 700; margin: 0 0 8px; line-height: 1.2;">You have a new message.</p>
          <p style="color: #7a8a64; font-size: 14px; margin: 0 0 28px;">${clinicName}${clinicianName ? ` · ${clinicianName}` : ''}</p>
          <div style="background: #f0ece5; border-radius: 8px; padding: 20px 24px; margin: 0 0 28px;">
            <p style="color: #3d4a30; font-size: 15px; line-height: 1.7; margin: 0; font-style: italic;">"${preview}"</p>
          </div>
          <div style="text-align: center; margin: 36px 0;">
            <a href="${link}" style="background: #2e3a20; color: #e8ddd0; padding: 16px 40px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block; letter-spacing: 0.3px;">
              Reply in Portal
            </a>
          </div>
          <p style="color: #7a8a64; font-size: 13px; line-height: 1.6; margin: 24px 0 0; text-align: center;">
            Sign in to your health portal to read the full message and reply to your care team.
          </p>
        </div>
        <div style="border-top: 1px solid #e8ddd0; padding: 20px 32px; text-align: center; background: #f5f0e8;">
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">Powered by ReAlign Health &mdash; Thoughtful Care, Personalized Wellness</p>
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
