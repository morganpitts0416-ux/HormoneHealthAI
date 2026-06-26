// Resolves the Spruce teammate `id` for a given sender email address,
// enabling the `author` field on POST /conversations/:id/messages so
// messages appear in Spruce as coming from the specific staff member
// rather than the organization account owner.
//
// Uses a per-clinic in-memory cache (10-min TTL) so the
// /organization/members endpoint is not hit on every message send.

interface CacheEntry {
  byEmail: Map<string, string>;
  expiresAt: number;
}

const _cache = new Map<number, CacheEntry>();
const TTL_MS = 10 * 60 * 1000;

/**
 * Returns the Spruce teammate `id` for `senderEmail` in this clinic,
 * or `null` when no match is found or the lookup fails.
 * Failure is always non-fatal — caller falls back to organization-level send.
 */
export async function getSpruceAuthorId(
  clinicId: number,
  senderEmail: string | null | undefined,
  apiToken: string,
): Promise<string | null> {
  if (!senderEmail) return null;
  const email = senderEmail.trim().toLowerCase();
  const now = Date.now();

  const cached = _cache.get(clinicId);
  if (cached && cached.expiresAt > now) {
    return cached.byEmail.get(email) ?? null;
  }

  try {
    const res = await fetch("https://api.sprucehealth.com/v1/organization/members", {
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      // Transient Spruce API error — keep any stale cache entry rather than
      // falling back to org-default sender (which would show the wrong name in Spruce).
      const stale = _cache.get(clinicId);
      return stale?.byEmail.get(email) ?? null;
    }
    const data: any = await res.json();
    const members: any[] = data?.members ?? [];

    const byEmail = new Map<string, string>();
    for (const m of members) {
      if (m.type === "teammate" && m.email && m.id) {
        byEmail.set((m.email as string).trim().toLowerCase(), m.id as string);
      }
    }
    _cache.set(clinicId, { byEmail, expiresAt: now + TTL_MS });
    return byEmail.get(email) ?? null;
  } catch {
    // Network failure — same: prefer stale cache over org-default attribution.
    const stale = _cache.get(clinicId);
    return stale?.byEmail.get(email) ?? null;
  }
}

/** Evict the cached member list for a clinic (call after Spruce settings change). */
export function invalidateSpruceAuthorCache(clinicId: number): void {
  _cache.delete(clinicId);
}
