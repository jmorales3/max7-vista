---
name: Seeded image rows have no real object-storage files
description: Pre-existing DB image rows point at gcs: paths with no backing file; the editor fails to load them ("Canvas not ready"), which can look like a feature bug during e2e testing but is an environment/seed-data gap.
---

In this project's dev environment, `images` table rows created by the seed script (or otherwise pre-existing before this session) reference `file_path` values like `gcs:images/<patientId>/<date>/<file>.jpg` that return 404 from `GET /api/images/:id/file`. The object storage bucket was never actually populated with bytes for these rows — only the DB metadata exists.

**Why:** When testing any feature that opens an image in the pixel editor (annotation, de-identification, crop, etc.), the editor's `<img>` element fails to load, `imgRef.current` stays null, and `handleSave`/`handleSaveToPresentationCopy`/`handleSaveAsCopy` all show a "Canvas not ready" toast and silently no-op. This is indistinguishable from a real bug in editor logic unless you check whether the underlying file actually exists.

**How to apply:** Before writing an e2e test plan (or manually verifying) any image-editing flow, first `curl` the `/api/images/:id/file` endpoint (with a valid session cookie) for the image(s) you intend to use. If it 404s, don't debug the editor — instead upload a small real image via `POST /api/images` (multipart, `file` + `patientId` fields) to get an image row with a real backing file, and use that new image's id for the test instead.
