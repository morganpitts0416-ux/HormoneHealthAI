---
name: Clinic branding architecture
description: Where logo/footerText live, how PDF callers should access them, and what the branding consistency rules are.
---

# Clinic Branding Architecture

## Logo and footer text location
- `clinics.clinicLogo` (text) — authoritative source, saved via PATCH /api/clinic/branding with key `clinicLogo`
- `clinics.footerText` (text, max 500 chars) — custom PDF footer; null = use default
- `users.clinicLogo` — **read-only legacy fallback** used only in GET /api/clinic/branding when `clinics.clinicLogo` is null (backward compat for pre-migration clinics). Never write to it for logo updates any more.

**Why:** Multi-admin clinics needed one shared logo regardless of which admin last saved. Moving to the clinic record eliminates divergence.

## API
- `GET /api/clinic/branding` → `{ primaryColor, accentColor, formBackgroundColor, clinicLogo, footerText }`
- `PATCH /api/clinic/branding` → accepts any subset of the five fields; clinicLogo must be a data: URL or null

## Frontend hooks
- `useClinicBranding()` — full react-query result, `data: ClinicBrandingResponse`
- `useClinicBrandingPartial()` — convenience: returns `PartialBranding | null` (colors only shape, suitable for `resolveBranding`)

**How to apply:** Any PDF caller or display component needing logo/footerText must call `useClinicBranding()` and access `data?.clinicLogo` / `data?.footerText`. Never read `(user as any)?.clinicLogo` for new features.

## PDF color consistency rule
All PDF generators (SOAP, female wellness, male wellness) now fall back to `PLATFORM_DEFAULT_BRANDING` (`#1f4e79` navy primary, `#3b82f6` accent, `#f8fafc` form bg) when no clinic override is set. The old per-PDF-type defaults (green for SOAP, tan for female wellness) are gone.

## Transparent logo support (wellness PDFs)
Canvas compositing uses `brandPrimaryHex` as the fill color (not white), so transparent-background PNGs blend into the colored header without a white-box artifact. SOAP PDF still uses white letterhead area — unaffected.

## account.tsx branding section split
- **"Save Logo, Colors & Footer" button** → `brandColorsMutation` → PATCH /api/clinic/branding (sends primaryColor, accentColor, formBackgroundColor, clinicLogo, footerText)
- **"Save Signature" button** → `brandingMutation` → PATCH /api/auth/profile (sends only signatureImage — logo is no longer part of this call)
