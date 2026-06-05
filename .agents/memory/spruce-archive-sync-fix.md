---
name: Spruce archive-sync trigger specificity
description: The archive-sync webhook trigger must match only exact Spruce system-event phrases, not the broad word "archived"
---

## Rule
The archive-sync block in the Spruce webhook handler (`server/routes.ts`) must use
specific pattern matching, NOT a broad `/archived/i` test.

**Why:** A broad `/archived/i` fires on any patient message or Spruce system note
that merely contains the word "archived" — e.g. "I archived my old insurance card"
or the very common "Sophia archived and unassigned this conversation" event. This
silently moved all active conversations to the Archived folder, making the inbox
appear empty.

**How to apply:**
Use the narrow patterns already in place (as of the fix commit):
```
const isSpruceArchiveEvent = (
  /\barchived (and unassigned )?this conversation\b/i.test(msgBody) ||
  /\bconversation (was )?archived\b/i.test(msgBody) ||
  eventType === 'conversation.archived'
);
```
Only set `isSpruceArchiveEvent = true` when one of these fires.

**Recovery endpoints added:**
- `POST /api/spruce/conversations/:key/unarchive` — restore single conversation
- `POST /api/spruce/conversations/bulk-unarchive` — restore ALL archived for clinic
