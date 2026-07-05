---
name: E2E fixtures must use content-type-appropriate records
description: A test fixture pointing an image-editor flow at a video record produces a misleading "not ready" failure that looks like an app bug but isn't.
---

## Problem
When creating disposable fixture rows for e2e testing (e.g. a presentation referencing an `imageId`), picking an arbitrary existing ID from the table without checking its actual content type can silently break the flow under test. Example: the patient-images app's editor canvas loads slide images via `new Image(); img.src = "/api/images/:id/file"` — if that ID's `file_path`/content-type is actually a video (`video/mp4`), the `<img>` element never fires `onload` (no `onerror` handler either), so a ref like `imgRef.current` silently stays `null` forever. Any downstream check like `if (!imgRef.current) toast("not ready")` then fires, looking exactly like a real application bug (race condition, ACL issue, etc.) rather than a bad fixture.

## Solution
Before wiring a fixture row to an ID pulled from the DB, verify the record's actual type/content matches what the code path expects — e.g. `curl -o /dev/null -w "%{content_type}" <file-url>` or check the DB's stored filename/extension/mime column. Don't assume "any row from the images table is an image."

**Why:** Silent failure modes (no onerror handler, no console error) make bad-fixture bugs indistinguishable from real app bugs, wasting significant debugging time chasing ACL/timing theories that don't exist.

**How to apply:** Whenever building an e2e fixture that references a media/file record by ID, spot-check the actual file's content-type/extension before trusting it to exercise the intended code path.
