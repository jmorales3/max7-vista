---
name: Presentation slides can hold dangling image references
description: The presentations.slides JSONB column stores raw imageId numbers with no FK constraint, so deleted images/patients leave orphaned references that render as empty thumbnails.
---

`presentationsTable.slides` is an untyped `jsonb` array (`items: {}` in openapi.yaml, `zod.array(zod.unknown())`) referencing images purely by numeric `imageId`/`beforeId`/`afterId`/`baseId`/`overlayId`. There is no foreign key or cascade — if the referenced image (or its patient, via cascade delete) is later removed, the presentation keeps the stale id forever and the UI just shows an empty/broken thumbnail (`<img src="/api/images/{id}/file">` 404s silently).

**Why:** Found while investigating a report of "old images turned into empty thumbnails after adding new ones" on a multi-patient presentation — the two broken slides were untouched dangling refs to already-deleted test images, unrelated to the user's edit; they just became visible because the user opened/edited that presentation for the first time in a while. Confirmed by checking `images` table for the referenced ids returning zero rows.

**How to apply:** When a user reports specific slides/thumbnails going blank in a presentation (especially after any edit that causes a re-render/re-fetch, not necessarily the actual cause), check the DB directly first — cross-reference `presentations.slides` imageIds against the `images` table — before assuming a regression in the attach/merge frontend code. Fix by pruning the dead entries (`jsonb_agg` filter) rather than guessing at app logic. Also: e2e test cleanup routines that delete test patients/images must remember to delete any presentations that reference them, or they'll leave exactly this kind of orphaned data behind for a real user to stumble into later.
