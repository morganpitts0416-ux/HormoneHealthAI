---
name: Missing schema exports fix (storage.ts)
description: Two storage.ts methods referenced schema exports that never existed — caused esbuild warnings and runtime TypeErrors on specific routes.
---

## The rule
Any time storage.ts is modified to reference a new `schema.XYZ` property, verify that `XYZ` is actually exported from `shared/schema.ts`. Esbuild emits `[WARNING] Import "X" will always be undefined` when the export is missing — this warning is a hard bug, not cosmetic.

## Fixed instances
- `schema.portalAccounts` → `schema.patientPortalAccounts` (`patient_portal_accounts` table)
- `schema.spruceConversations` → `schema.spruceMessages` (no separate conversations table exists; `spruceMessages.spruceConversationId` serves as the `conversationKey`; order by `receivedAt` not `lastMessageAt`)

**Why:** At runtime these resolve to `undefined`. Calling `.id` or `.clinicId` on `undefined` throws `TypeError` on whichever route invokes `getReplyContext` or `findSpruceConversationByPatient`.

**How to apply:** After every storage method addition/edit, run `npm run build` and confirm zero `[WARNING] Import "X" will always be undefined` lines in the esbuild output. If any appear, grep `shared/schema.ts` for the correct export name.
