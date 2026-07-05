---
name: Nullable-patientId image fetch pattern
description: How to write a GET-by-id image route that must work for both patient-owned images and shared library assets (patientId null)
---

Any single-image `GET /images/:id`-style route that uses `.innerJoin(patientsTable, ...)` to enforce tenant scoping will 404 for images with `patientId = null` (library assets / unassigned images), even though the image row exists and is otherwise accessible.

**Why:** the inner join requires a matching patient row in the caller's tenant; library assets have no patient row at all, so the join silently excludes them. This is easy to miss because the route works fine for the common (patient-owned) case and only breaks for a specific image class that may not be covered by existing tests.

**How to apply:** when adding or touching a `GET /images/:id`-shaped endpoint, follow the pattern already used by `/images/:id/file`:
1. Fetch the image row directly by id first (`select().from(imagesTable).where(eq(imagesTable.id, ...))`), with no join.
2. If `image.isLibraryAsset` (or more generally `patientId == null`), skip the patient/tenant check and return the row directly — library assets are shared across the tenant by design.
3. Otherwise, look up the owning patient scoped to `tenantId`, 404 if missing, then run the normal `canAccessPatient` check.

This bug surfaced when extending copy-on-edit to library-asset images inside single-patient presentations: the editor page navigated to `/editor/:libraryAssetId` correctly, but the underlying `GET /api/images/:id` call 404'd, so the editor showed "Image not found" even though the feature's routing/UI logic was correct. Caught via Playwright e2e test, not by `tsc` or unit-level reasoning — worth an explicit e2e check whenever library-asset (nullable-patientId) images are involved.
