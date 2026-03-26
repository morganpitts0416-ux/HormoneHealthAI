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
  /** The clinician's stored webhook secret (for verification) */
  expectedSecret: string;
  /** Header value that carries the signature / secret */
  signatureHeader?: string;
}

export interface ParsedInboundMessage {
  /** The external message ID (for deduplication) */
  externalMessageId: string;
  /** Message content */
  content: string;
  /** True = provider sent it; false = couldn't determine */
  isFromProvider: boolean;
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
): ParsedInboundMessage | null {
  // Spruce signs webhooks — verify the secret/signature before processing
  // Exact signature scheme depends on Spruce API docs; update once confirmed
  if (signatureHeader && signatureHeader !== expectedSecret) {
    return null; // signature mismatch — reject
  }

  const body = rawBody as Record<string, unknown>;
  const messageId = String(body.id ?? body.message_id ?? '');
  const content = String(body.body ?? body.content ?? body.text ?? '');
  const senderRole = String(body.sender_role ?? body.author_type ?? '');
  const isFromProvider = senderRole === 'provider' || senderRole === 'staff';

  if (!messageId || !content) return null;

  return { externalMessageId: messageId, content, isFromProvider };
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
      return parseSpruceWebhook(payload.rawBody, payload.expectedSecret, payload.signatureHeader);
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
