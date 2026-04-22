/**
 * External Messaging Bridge
 *
 * Provides a clean abstraction layer for forwarding ReAlign portal messages
 * to external HIPAA-compliant messaging platforms (Spruce Health, Klara, etc.)
 * and receiving replies via webhooks.
 *
 * Architecture:
 *   Patient sends in ReAlign  →  stored in DB  →  forwarded to external API
 *   Provider replies externally  →  webhook fires  →  stored in DB  →  patient sees reply
 */

export type ExternalProvider = 'spruce' | 'klara' | 'custom';

export interface OutboundMessage {
  /** The patient's first + last name */
  patientName: string;
  /** Content of the message */
  content: string;
  /** Clinician's external channel/inbox ID (e.g. Spruce channel ID) */
  channelId: string;
  /** Optional patient phone or external patient ID */
  patientExternalId?: string;
}

export interface ExternalMessageResult {
  success: boolean;
  externalMessageId?: string;
  error?: string;
}

export interface InboundWebhookPayload {
  provider: ExternalProvider;
  /** Raw body from the external system */
  rawBody: unknown;
  /** Raw body bytes (required for HMAC verification of Spruce) */
  rawBodyBuffer?: Buffer;
  /** The clinician's stored webhook secret (for verification) */
  expectedSecret: string;
  /** Header value that carries the signature / secret */
  signatureHeader?: string;
  /** All request headers (for trying multiple signature schemes) */
  allHeaders?: Record<string, string | string[] | undefined>;
}

export interface ParsedInboundMessage {
  /** The external message ID (for deduplication) */
  externalMessageId: string;
  /** Message content */
  content: string;
  /** True = provider sent it; false = patient/contact sent it */
  isFromProvider: boolean;
  /** Phone number of the patient/contact (for matching to a ClinIQ patient) */
  patientPhone?: string;
  /** The Spruce/external inbox/endpoint ID this message belongs to (for inbox filtering) */
  channelId?: string;
}

// ─── Signature verification helpers ──────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'crypto';

function safeEqHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function verifySpruceSignature(
  secret: string,
  rawBody: Buffer | undefined,
  primarySig: string | undefined,
  allHeaders: Record<string, string | string[] | undefined> | undefined,
): boolean {
  if (!secret) return false;
  // Collect every header that might carry a signature so we don't have to know
  // exactly which name Spruce uses on this org's plan.
  const candidates: string[] = [];
  if (primarySig) candidates.push(primarySig);
  if (allHeaders) {
    for (const [k, v] of Object.entries(allHeaders)) {
      const key = k.toLowerCase();
      if (
        key.includes('signature') ||
        key.includes('s-signature') ||
        key.includes('spruce') ||
        key === 'x-webhook-secret' ||
        key === 'x-signature'
      ) {
        if (typeof v === 'string') candidates.push(v);
        else if (Array.isArray(v)) candidates.push(...v.filter((x): x is string => typeof x === 'string'));
      }
    }
  }
  if (!candidates.length) return false;

  const bodyBuf = rawBody ?? Buffer.alloc(0);
  const computedHex = createHmac('sha256', secret).update(bodyBuf).digest('hex');

  for (const raw of candidates) {
    if (!raw) continue;
    // 1) Plain shared-secret comparison (legacy)
    if (raw === secret) return true;

    // 2) Raw HMAC-SHA256 hex of body
    if (safeEqHex(raw, computedHex)) return true;
    // Strip a "sha256=" prefix if present
    if (raw.startsWith('sha256=') && safeEqHex(raw.slice(7), computedHex)) return true;

    // 3) Stripe / Spruce style: "t=<ts>,v1=<hex>" — HMAC over `${t}.${rawBody}`
    if (raw.includes('t=') && raw.includes('v1=')) {
      const parts = raw.split(',').map(s => s.trim());
      const t = parts.find(p => p.startsWith('t='))?.slice(2);
      const v1List = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3));
      if (t && v1List.length) {
        const signedPayload = Buffer.concat([Buffer.from(`${t}.`), bodyBuf]);
        const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
        for (const v1 of v1List) {
          if (safeEqHex(v1, expected)) return true;
        }
      }
    }
  }
  return false;
}

// ─── Provider adapters ────────────────────────────────────────────────────────

/**
 * Spruce Health adapter
 * Docs: https://developer.spruce.care  (requires enterprise API access)
 *
 * When you receive your Spruce API key, update SPRUCE_API_BASE and the
 * payload shape below to match their current API version.
 */
const SPRUCE_API_BASE = 'https://api.spruce.care/v1';

async function forwardToSpruce(
  apiKey: string,
  msg: OutboundMessage,
): Promise<ExternalMessageResult> {
  try {
    const res = await fetch(`${SPRUCE_API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel_id: msg.channelId,
        body: `[From portal — ${msg.patientName}]\n\n${msg.content}`,
        // Spruce may also support patient_id / contact_id for threading
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { success: false, error: `Spruce API error ${res.status}: ${errorText}` };
    }

    const data = await res.json() as { id?: string };
    return { success: true, externalMessageId: data.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function parseSpruceWebhook(
  rawBody: unknown,
  expectedSecret: string,
  signatureHeader?: string,
  rawBodyBuffer?: Buffer,
  allHeaders?: Record<string, string | string[] | undefined>,
): ParsedInboundMessage | null {
  // Spruce signs webhook payloads with HMAC-SHA256 using the signing secret
  // we shared at registration time. Try multiple verification schemes so we
  // remain compatible with whatever signature format the API uses.
  const verified = verifySpruceSignature(
    expectedSecret,
    rawBodyBuffer,
    signatureHeader,
    allHeaders,
  );
  if (!verified) {
    console.warn('[Spruce webhook] signature verification failed', {
      headersSeen: allHeaders ? Object.keys(allHeaders) : [],
      sigHeaderValue: signatureHeader?.slice(0, 80),
      bodyLen: rawBodyBuffer?.length,
    });
    return null;
  }

  const body = rawBody as Record<string, unknown>;
  const messageId = String(body.id ?? body.message_id ?? body.thread_message_id ?? '');
  const content = String(body.body ?? body.content ?? body.text ?? body.message_body ?? '');
  const senderRole = String(body.sender_role ?? body.author_type ?? body.direction ?? '');
  // Spruce uses direction='inbound' for patient-sent messages, 'outbound' for provider-sent
  const isFromProvider =
    senderRole === 'provider' || senderRole === 'staff' || senderRole === 'outbound';

  // Spruce includes the contact's phone in various shapes depending on event type
  const phone =
    (body.contact_phone as string) ||
    (body.from_phone as string) ||
    (body.from as string) ||
    ((body.contact as any)?.phone as string) ||
    ((body.sender as any)?.phone as string) ||
    '';

  // Spruce identifies the inbox/phone-line the message belongs to via various fields
  const channelId =
    (body.endpoint_id as string) ||
    (body.inbox_id as string) ||
    (body.channel_id as string) ||
    ((body.thread as any)?.endpoint_id as string) ||
    ((body.thread as any)?.organization_endpoint_id as string) ||
    ((body.endpoint as any)?.id as string) ||
    '';

  if (!messageId || !content) return null;

  return {
    externalMessageId: messageId,
    content,
    isFromProvider,
    patientPhone: phone || undefined,
    channelId: channelId || undefined,
  };
}

/**
 * Klara adapter (placeholder — fill in when you have Klara API access)
 */
async function forwardToKlara(
  apiKey: string,
  msg: OutboundMessage,
): Promise<ExternalMessageResult> {
  // TODO: Implement Klara API integration
  // Klara API base: https://api.klara.com (verify with Klara docs)
  console.log('[Klara] Outbound message stub — API integration pending', { channelId: msg.channelId });
  return { success: false, error: 'Klara integration not yet implemented. Contact your developer.' };
}

function parseKlaraWebhook(_rawBody: unknown, _expectedSecret: string): ParsedInboundMessage | null {
  // TODO: Implement Klara webhook parsing
  return null;
}

/**
 * Custom / Generic adapter
 * Suitable for any platform that accepts a simple HTTPS POST with a bearer token.
 */
async function forwardToCustom(
  apiKey: string,
  msg: OutboundMessage,
): Promise<ExternalMessageResult> {
  if (!msg.channelId) {
    return { success: false, error: 'No API endpoint configured. Set the Channel/Endpoint URL in Account Settings.' };
  }

  try {
    const res = await fetch(msg.channelId, { // channelId used as the endpoint URL for custom providers
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: msg.patientName,
        message: msg.content,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      return { success: false, error: `Custom API error ${res.status}` };
    }

    const data = await res.json().catch(() => ({})) as { id?: string };
    return { success: true, externalMessageId: data.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function parseCustomWebhook(
  rawBody: unknown,
  expectedSecret: string,
  signatureHeader?: string,
): ParsedInboundMessage | null {
  if (signatureHeader && signatureHeader !== expectedSecret) return null;

  const body = rawBody as Record<string, unknown>;
  const messageId = String(body.id ?? body.message_id ?? Date.now());
  const content = String(body.body ?? body.content ?? body.message ?? body.text ?? '');
  if (!content) return null;

  return { externalMessageId: messageId, content, isFromProvider: true };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Forward a patient's outbound message to the configured external system.
 * Called automatically when a patient sends a portal message and the clinician
 * has external_api messaging configured.
 */
export async function forwardMessageToExternalProvider(
  provider: ExternalProvider,
  apiKey: string,
  msg: OutboundMessage,
): Promise<ExternalMessageResult> {
  switch (provider) {
    case 'spruce':  return forwardToSpruce(apiKey, msg);
    case 'klara':   return forwardToKlara(apiKey, msg);
    case 'custom':  return forwardToCustom(apiKey, msg);
    default:        return { success: false, error: `Unknown provider: ${provider}` };
  }
}

/**
 * Parse and verify an inbound webhook payload from an external messaging system.
 * Returns null if the payload is invalid, unverifiable, or unrecognised.
 */
export function parseInboundWebhook(payload: InboundWebhookPayload): ParsedInboundMessage | null {
  switch (payload.provider) {
    case 'spruce':
      return parseSpruceWebhook(
        payload.rawBody,
        payload.expectedSecret,
        payload.signatureHeader,
        payload.rawBodyBuffer,
        payload.allHeaders,
      );
    case 'klara':
      return parseKlaraWebhook(payload.rawBody, payload.expectedSecret);
    case 'custom':
      return parseCustomWebhook(payload.rawBody, payload.expectedSecret, payload.signatureHeader);
    default:
      return null;
  }
}

/**
 * Generate a cryptographically random webhook secret (hex string).
 * Called once when a clinician first enables external_api messaging.
 */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
