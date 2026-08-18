// Email service — powered by Resend once connected
// Swap `sendEmail` implementation once RESEND_API_KEY is available.

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  fromName?: string; // Display name shown in inbox — e.g. "Vitality Men's Health"
  replyTo?: string;
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const sendingDomain = process.env.RESEND_FROM_EMAIL || "noreply@cliniqapp.ai";
  // Build display-name "from" if a clinic name is provided
  const fromField = opts.fromName
    ? `"${opts.fromName}" <${sendingDomain}>`
    : sendingDomain;

  if (!apiKey) {
    console.log("[EMAIL STUB] Would send email:", {
      from: fromField,
      to: opts.to,
      subject: opts.subject,
    });
    console.log("[EMAIL STUB] HTML preview:\n", opts.html.replace(/<[^>]+>/g, "").substring(0, 400));
    return;
  }

  const body: Record<string, unknown> = {
    from: fromField,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.replyTo) body.reply_to = opts.replyTo;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend API error ${response.status}: ${text}`);
  }
}

function getBaseUrl(req?: { protocol?: string; get?: (h: string) => string | undefined }): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  // In Replit deployments, REPLIT_DOMAINS is always the correct public-facing domain
  if (process.env.REPLIT_DOMAINS) {
    const domain = process.env.REPLIT_DOMAINS.split(",")[0].trim();
    if (domain && !domain.startsWith("localhost")) {
      return `https://${domain}`;
    }
  }
  if (req?.get) {
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:5000";
    const proto = req.get("x-forwarded-proto") || req.protocol || "https";
    return `${proto}://${host}`;
  }
  return "https://cliniqapp.ai";
}

// ── Platform-level emails (clinician-facing) ───────────────────────────────
// These brand as "ClinIQ" — the clinician knows the platform.

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
    subject: "You've been invited to ClinIQ — set your password",
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #fff;">
        <div style="background: #2e3a20; padding: 28px 32px;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">ClinIQ</h1>
          <p style="color: #a8b88c; margin: 4px 0 0; font-size: 13px;">Clinical Lab Interpretation Platform</p>
        </div>
        <div style="padding: 36px 32px;">
          <p style="color: #1c2414; font-size: 16px; margin: 0 0 16px;">Hello ${firstName},</p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            An administrator has created a ClinIQ clinician account for you.
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
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">ClinIQ &mdash; Clinical Lab Interpretation Platform</p>
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
    subject: "Reset your ClinIQ password",
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #fff;">
        <div style="background: #2e3a20; padding: 28px 32px;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">ClinIQ</h1>
          <p style="color: #a8b88c; margin: 4px 0 0; font-size: 13px;">Clinical Lab Interpretation Platform</p>
        </div>
        <div style="padding: 36px 32px;">
          <p style="color: #1c2414; font-size: 16px; margin: 0 0 16px;">Hello ${firstName},</p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            We received a request to reset your ClinIQ password. Click the button below to choose a new one.
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
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">ClinIQ &mdash; Clinical Lab Interpretation Platform</p>
        </div>
      </div>
    `,
  });
}

// ── Patient / portal-facing emails ─────────────────────────────────────────
// These brand as the clinic — patients see the clinic name in the header.
// "Powered by ClinIQ" stays in the footer as a platform credit.

export async function sendPatientPortalInviteEmail(
  to: string,
  patientFirstName: string,
  clinicName: string,
  token: string,
  req?: any
): Promise<void> {
  const base = getBaseUrl(req);
  const link = `${base}/portal/set-password?token=${token}`;
  // Canonical portal URL patients return to after setup
  const portalUrl = "https://app.cliniqapp.ai";

  await sendEmail({
    to,
    fromName: clinicName,
    subject: `Welcome to your ${clinicName} health portal — set up your access`,
    html: `
      <div style="font-family: 'Inter', Georgia, serif; max-width: 580px; margin: 0 auto; background: #fffdf9;">

        <!-- Header -->
        <div style="background: #2e3a20; padding: 28px 32px; text-align: center;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">${clinicName}</h1>
          <p style="color: #a8b88c; margin: 6px 0 0; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase;">Your Personal Health Portal</p>
        </div>

        <!-- Welcome -->
        <div style="padding: 40px 32px 28px; background: #fffdf9;">
          <p style="color: #2e3a20; font-size: 26px; font-weight: 700; margin: 0 0 16px; line-height: 1.25;">Welcome, ${patientFirstName}! 👋</p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.75; margin: 0 0 12px;">
            We're so glad you're here. Your care team at <strong>${clinicName}</strong> has set up a private health portal just for you — a secure space where you can stay connected with your care, track your progress, and access everything in one place.
          </p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.75; margin: 0 0 24px;">
            Inside your portal you'll find your lab results explained in plain language, your personalized wellness protocol, notes and updates from your care team, and your health trends over time.
          </p>
        </div>

        <!-- Step 1: Set password -->
        <div style="margin: 0 32px 24px; background: #f0f4e8; border-radius: 10px; padding: 24px 28px;">
          <p style="color: #2e3a20; font-size: 13px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; margin: 0 0 10px;">Step 1 — Create your password</p>
          <p style="color: #3d4a30; font-size: 14px; line-height: 1.65; margin: 0 0 20px;">
            Click the button below to set your password and activate your account. This link is unique to you and expires in <strong>72 hours</strong>.
          </p>
          <div style="text-align: center;">
            <a href="${link}" style="background: #2e3a20; color: #e8ddd0; padding: 15px 40px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block; letter-spacing: 0.3px;">
              Set My Password &rarr;
            </a>
          </div>
          <p style="color: #7a8a64; font-size: 12px; margin: 16px 0 0; word-break: break-all; text-align: center;">
            Or copy this link into your browser:<br>${link}
          </p>
        </div>

        <!-- Step 2: Return access -->
        <div style="margin: 0 32px 24px; background: #f5f0e8; border-radius: 10px; padding: 24px 28px;">
          <p style="color: #2e3a20; font-size: 13px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; margin: 0 0 10px;">Step 2 — Coming back to your portal</p>
          <p style="color: #3d4a30; font-size: 14px; line-height: 1.65; margin: 0 0 10px;">
            After you've set your password, you can log in any time at:
          </p>
          <p style="text-align: center; margin: 0 0 10px;">
            <a href="${portalUrl}" style="color: #2e3a20; font-size: 15px; font-weight: 600; text-decoration: underline;">${portalUrl}</a>
          </p>
          <p style="color: #3d4a30; font-size: 14px; line-height: 1.65; margin: 0;">
            Use your email address and the password you just created. Make sure to select <strong>"Patient Login"</strong> on the login page.
          </p>
        </div>

        <!-- Step 3: Add to homescreen -->
        <div style="margin: 0 32px 32px; background: #eef2f8; border-radius: 10px; padding: 24px 28px;">
          <p style="color: #2e3a20; font-size: 13px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; margin: 0 0 10px;">Step 3 — Save it to your phone like an app (optional but recommended!)</p>
          <p style="color: #3d4a30; font-size: 14px; line-height: 1.65; margin: 0 0 18px;">
            You can add your portal to your phone's home screen for one-tap access — it works just like an app, no download required.
          </p>

          <!-- iPhone -->
          <div style="margin-bottom: 18px;">
            <p style="color: #2e3a20; font-size: 14px; font-weight: 700; margin: 0 0 8px;">📱 iPhone (Safari)</p>
            <ol style="color: #3d4a30; font-size: 14px; line-height: 1.9; margin: 0; padding-left: 20px;">
              <li>Open <strong>${portalUrl}</strong> in Safari</li>
              <li>Tap the <strong>Share button</strong> (the square with an arrow pointing up)</li>
              <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
              <li>Tap <strong>"Add"</strong> in the top right</li>
            </ol>
          </div>

          <!-- Android -->
          <div>
            <p style="color: #2e3a20; font-size: 14px; font-weight: 700; margin: 0 0 8px;">📱 Android (Chrome)</p>
            <ol style="color: #3d4a30; font-size: 14px; line-height: 1.9; margin: 0; padding-left: 20px;">
              <li>Open <strong>${portalUrl}</strong> in Chrome</li>
              <li>Tap the <strong>3-dot menu</strong> in the top right corner</li>
              <li>Tap <strong>"Add to Home Screen"</strong></li>
              <li>Tap <strong>"Add"</strong></li>
            </ol>
          </div>
        </div>

        <!-- Security note -->
        <div style="padding: 0 32px 36px;">
          <p style="color: #7a8a64; font-size: 13px; line-height: 1.65; margin: 0; text-align: center;">
            Your health data is private and secure — only you and your care team can access it.<br>
            If you have any trouble accessing your portal, reach out to your clinic directly.
          </p>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #e8ddd0; padding: 18px 32px; text-align: center; background: #f5f0e8;">
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">Powered by ClinIQ &mdash; Thoughtful Care, Personalized Wellness</p>
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
    fromName: clinicName,
    subject: `You've been invited to join the ${clinicName} care team`,
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #fff;">
        <div style="background: #2e3a20; padding: 28px 32px;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">${clinicName}</h1>
          <p style="color: #a8b88c; margin: 4px 0 0; font-size: 13px;">Care Team Access</p>
        </div>
        <div style="padding: 36px 32px;">
          <p style="color: #1c2414; font-size: 16px; margin: 0 0 16px;">Hi ${staffFirstName},</p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            <strong>${clinicianName}</strong> at <strong>${clinicName}</strong> has invited you to join their care team workspace.
          </p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            As a team member, you'll have access to patient lab evaluations, supplement protocols, and portal messaging — all within the clinic account.
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
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">Powered by ClinIQ &mdash; Clinical Lab Interpretation Platform</p>
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
    fromName: clinicName,
    subject: `${clinicName} has updated your wellness protocol`,
    html: `
      <div style="font-family: 'Inter', Georgia, serif; max-width: 560px; margin: 0 auto; background: #fffdf9;">
        <div style="background: #2e3a20; padding: 28px 32px; text-align: center;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">${clinicName}</h1>
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
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">Powered by ClinIQ &mdash; Thoughtful Care, Personalized Wellness</p>
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
    fromName: clinicName,
    subject: `New message from ${clinicName}`,
    html: `
      <div style="font-family: 'Inter', Georgia, serif; max-width: 560px; margin: 0 auto; background: #fffdf9;">
        <div style="background: #2e3a20; padding: 28px 32px; text-align: center;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">${clinicName}</h1>
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
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">Powered by ClinIQ &mdash; Thoughtful Care, Personalized Wellness</p>
        </div>
      </div>
    `,
  });
}

export async function sendProviderInviteEmail(
  to: string,
  providerFirstName: string,
  clinicName: string,
  inviterName: string,
  token: string,
  req?: any
): Promise<void> {
  const base = getBaseUrl(req);
  const link = `${base}/join-clinic?token=${token}`;

  await sendEmail({
    to,
    fromName: clinicName,
    subject: `You're invited to join ${clinicName} on ClinIQ`,
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #fff;">
        <div style="background: #2e3a20; padding: 28px 32px;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">${clinicName}</h1>
          <p style="color: #a8b88c; margin: 4px 0 0; font-size: 13px;">Provider Enrollment Invitation</p>
        </div>
        <div style="padding: 36px 32px;">
          <p style="color: #1c2414; font-size: 16px; margin: 0 0 16px;">Hi ${providerFirstName},</p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            <strong>${inviterName}</strong> has invited you to join <strong>${clinicName}</strong> as a provider on the ClinIQ platform.
          </p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            As a clinic provider, you'll have your own full ClinIQ workspace including lab interpretation, AI-powered recommendations, patient profiles, encounter documentation, and more — all connected to the shared clinic.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${link}" style="background: #2e3a20; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
              Accept Invitation &amp; Set Up Account
            </a>
          </div>
          <p style="color: #7a8a64; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
            This invite link expires in <strong>72 hours</strong>. Once you complete your profile, you can log in at any time with your email and password.
          </p>
          <p style="color: #7a8a64; font-size: 12px; margin: 8px 0 0; word-break: break-all;">
            Or copy this link: ${link}
          </p>
        </div>
        <div style="border-top: 1px solid #e8ddd0; padding: 16px 32px; text-align: center;">
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">ClinIQ &mdash; Clinical Lab Interpretation Platform</p>
        </div>
      </div>
    `,
  });
}

/**
 * Invite an external collaborating physician to chart-review-only access.
 * `accessScopeLabel` is shown verbatim in the email body so the invitee
 * understands what they're being asked to log into.
 */
export async function sendExternalCollaboratorInviteEmail(
  to: string,
  physicianFirstName: string,
  midLevelName: string,
  clinicName: string,
  accessScopeLabel: string,
  token: string,
  req?: any
): Promise<void> {
  const base = getBaseUrl(req);
  const link = `${base}/join-clinic?token=${token}`;
  await sendEmail({
    to,
    fromName: clinicName,
    subject: `You've been invited to review charts for ${midLevelName} at ${clinicName}`,
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #fff;">
        <div style="background: #2e3a20; padding: 28px 32px;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">${clinicName}</h1>
          <p style="color: #a8b88c; margin: 4px 0 0; font-size: 13px;">Collaborating Physician Invitation</p>
        </div>
        <div style="padding: 36px 32px;">
          <p style="color: #1c2414; font-size: 16px; margin: 0 0 16px;">Hi ${physicianFirstName},</p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            <strong>${midLevelName}</strong> at <strong>${clinicName}</strong> has invited you to be their collaborating physician on ClinIQ.
          </p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            Access scope: <strong>${accessScopeLabel}</strong>.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${link}" style="background: #2e3a20; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
              Accept &amp; Set Up Account
            </a>
          </div>
          <p style="color: #7a8a64; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
            This invite link expires in <strong>72 hours</strong>. If you already have a ClinIQ login at another clinic, the same email + password will work — this clinic will simply appear in your clinic switcher.
          </p>
          <p style="color: #7a8a64; font-size: 12px; margin: 8px 0 0; word-break: break-all;">
            Or copy this link: ${link}
          </p>
        </div>
        <div style="border-top: 1px solid #e8ddd0; padding: 16px 32px; text-align: center;">
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">ClinIQ &mdash; Clinical Lab Interpretation Platform</p>
        </div>
      </div>
    `,
  });
}

export async function sendPortalPasswordResetEmail(
  to: string,
  patientFirstName: string,
  token: string,
  req?: any,
  clinicName?: string,
  clinicianName?: string
): Promise<void> {
  const base = getBaseUrl(req);
  const link = `${base}/portal/reset-password?token=${token}`;
  const displayClinic = clinicName || "Your Care Team";
  const fromName = clinicName || undefined;

  await sendEmail({
    to,
    fromName,
    subject: `Reset your ${displayClinic} health portal password`,
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #fff;">
        <div style="background: #2e3a20; padding: 28px 32px;">
          <h1 style="color: #e8ddd0; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">${displayClinic}</h1>
          <p style="color: #a8b88c; margin: 4px 0 0; font-size: 13px;">Your Personal Health Portal</p>
        </div>
        <div style="padding: 36px 32px;">
          <p style="color: #1c2414; font-size: 16px; margin: 0 0 16px;">Hello ${patientFirstName},</p>
          <p style="color: #3d4a30; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            We received a request to reset your health portal password. Click the button below to choose a new one.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${link}" style="background: #2e3a20; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
              Reset My Password
            </a>
          </div>
          <p style="color: #7a8a64; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
            This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.
          </p>
          <p style="color: #7a8a64; font-size: 12px; margin: 8px 0 0; word-break: break-all;">
            Or copy this link: ${link}
          </p>
        </div>
        <div style="border-top: 1px solid #e8ddd0; padding: 20px 32px; text-align: center; background: #f5f0e8;">
          <p style="color: #7a8a64; font-size: 12px; margin: 0;">Powered by ClinIQ &mdash; Thoughtful Care, Personalized Wellness</p>
        </div>
      </div>
    `,
  });
}

export async function sendEmail_raw(opts: EmailOptions): Promise<void> {
  return sendEmail(opts);
}
