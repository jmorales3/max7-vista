---
name: Seed/reset migrations must never delete by shared key alone
description: A startup reseed routine deleted real user data because it matched only on patient_id, which demo-seeded patients also share with real records.
---

Startup "reseed on version bump" migrations that delete-then-reinsert seed
data are dangerous if the delete condition matches on any key a real,
user-created record could also satisfy (e.g. `patient_id`, `user_id`,
`tenant_id`). Once a demo/seed entity (a patient, user, etc.) exists, users
often add genuine data under it — the delete must not sweep that up.

**Why:** In this codebase, a patient-image reseed ran
`DELETE FROM images WHERE patient_id = ANY(seededPatientIds)` on every
image-seed version bump. That deleted a patient's real uploaded photos
alongside the demo seed images, because the delete matched by `patient_id`
only. The DB rows vanished with no audit trail (raw SQL, not an app
endpoint), while the underlying files stayed in object storage — producing
broken thumbnails in a presentation that referenced the now-gone image IDs.

**How to apply:** When writing or reviewing any reseed/reset migration that
deletes before reinserting, require the delete to match on the *exact* set
of fields that uniquely identify a seed-managed row (e.g.
`(patient_id, file_path)` matched against the literal seed list), never on a
shared parent id alone. If you find such code during a review, treat it as
a live data-loss bug, not a style nit — check whether real records already
share the seeded parent and recover from object storage if rows were
already wiped (list files by prefix, reinsert, then repoint any downstream
references like presentation slide arrays to the new ids).
