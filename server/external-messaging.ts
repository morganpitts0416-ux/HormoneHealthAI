/**
 * External Messaging Bridge
 *
 * Provides a clean abstraction layer for forwarding ClinIQ portal messages
 * to external HIPAA-compliant messaging platforms (Spruce Health, Klara, etc.)
 */

export type ExternalProvider = 'spruce' | 'klara' | 'custom';

export interface OutboundMessage {
  patientName: string;
  content: string;
  channelId: string;
  patientExternalId?: string;
}

export interface ExternalMessageResult {
  success: boolean;
  externalMessageId?: string;
  error?: string;
}

// ─── Provider adapters ────────────────────────────────────────────────────────

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

async function forwardToKlara(
  _apiKey: string,
  msg: OutboundMessage,
): Promise<ExternalMessageResult> {
  console.log('[Klara] Outbound message stub — API integration pending', { channelId: msg.channelId });
  return { success: false, error: 'Klara integration not yet implemented.' };
}

async function forwardToCustom(
  apiKey: string,
  msg: OutboundMessage,
): Promise<ExternalMessageResult> {
  if (!msg.channelId) {
    return { success: false, error: 'No API endpoint configured. Set the Channel/Endpoint URL in Account Settings.' };
  }

  try {
    const res = await fetch(msg.channelId, {
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Forward a patient's outbound message to the configured external system.
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
