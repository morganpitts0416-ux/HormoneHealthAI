---
name: Note template block persistence
description: How template-built notes persist their block structure and how they are re-opened for editing.
---

## Rule
ManualSoapBuilder must save `{ fullNote, blocks, chiefComplaint, visitDate, visitType }` (not just `{ fullNote }`) to `soapNote` JSONB so the block structure survives a save-and-reopen cycle.

**Why:** The original implementation only saved `fullNote` (plain text), stripping the block list. On reopen, the app would fall through to `AmendTextarea` — a bare free-text box — discarding the template structure entirely.

**How to apply:**
- All three note builders (ManualSoapBuilder, NurseNoteBuilder, PhoneNoteDialog) now accept an optional `initialEncounterId` prop.
- When set, a `useEffect` fetches `GET /api/encounters/:id` and hydrates blocks/fields from `soapNote.blocks`.
- The save mutation checks `savedEncounterId` (initialized from `initialEncounterId`) and uses PUT instead of POST when editing existing.
- In `patient-profiles.tsx`, the edit (pen) button click for **unsigned** notes routes to the correct builder:
  - `noteType === "nurse"` + `soapNote.blocks` present → NurseNoteBuilder with `initialEncounterId`
  - `noteType === "soap_provider"` + `soapNote.blocks` present → ManualSoapBuilder with `initialEncounterId`
  - `noteType === "phone"` (unsigned) → PhoneNoteDialog with `initialEncounterId`
  - Signed notes or notes without blocks → existing AmendTextarea/amendment flow (unchanged)
- `PUT /api/encounters/:id` server route was extended to accept `phoneContact` (was missing).
- Backward-compatible: AI-generated SOAP notes and legacy notes without `soapNote.blocks` still open in AmendTextarea.
