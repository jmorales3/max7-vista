# 02 — Curriculum and Learning Order

## Tracks

| Track | Lessons | Audience |
|---|---|---|
| Beginner | MV-01 to MV-04, MV-06 | Every authenticated web/Electron user |
| Clinical workflow | MV-07 to MV-13 | Clinical staff with verified workflow permissions |
| Administration and compliance | MV-02, MV-14, MV-15 | Admin/superadmin accounts only; subject to reconciliation register |
| Desktop/LAN | MV-12, MV-15 | Desktop/LAN operators |
| Mobile | MV-05 | Expo mobile users |
| Troubleshooting | MV-16 | All users, with escalation paths for admins/operators |

## Lesson map

| ID | Lesson | Duration | Platform | Intended role | Prerequisite | Objective |
|---|---|---:|---|---|---|---|
| MV-01 | Orientation, navigation, language, and help | 75 s | Web/Electron | All | Signed in | Identify the correct surface and find in-app help. |
| MV-02 | Sign-in, privacy, roles, and session safety | 90 s | Web/Electron + mobile concept callout | All | Test accounts | Protect patient information and recognize a role/session boundary. |
| MV-03 | Find, create, and open a patient record | 90 s | Web/Electron | Verified write role | Synthetic patient data | Search before browsing and confirm the correct record. |
| MV-04 | Capture or upload an image safely | 105 s | Web/Electron | All verified for capture | Test patient + image | Associate media with the right patient and reach the editor. |
| MV-05 | Mobile capture, review, and batch assignment | 115 s | Expo mobile | Mobile user | Device permissions + unassigned test images | Capture/review safely and assign several images. |
| MV-06 | Gallery essentials: filters, grid, selection, and download | 105 s | Web/Electron | All; export role verified | Tagged test media | Find a clinical image without over-browsing. |
| MV-07 | Image editor essentials: annotate and save safely | 120 s | Web/Electron | Editor-enabled test role | Disposable image | Use annotations and choose Save vs Save as Copy. |
| MV-08 | Measurement, resize, angle, and overlay comparison | 120 s | Web/Electron | Clinical staff | Calibrated synthetic reference image | Calibrate before measuring and avoid clinical over-interpretation. |
| MV-09 | Reusable library assets and presentations | 110 s | Web/Electron | Verified presentation role | Decorative assets + test presentation | Reuse non-clinical assets and make/export a presentation. |
| MV-10 | Templates and printed documents | 110 s | Web/Electron | Verified template role | Template and synthetic patient images | Fill frames, verify header, and print safely. |
| MV-11 | Patient documents: attach, preview, and download | 75 s | Web/Electron | Verified document role | Synthetic files | Attach a supported file and use the safe viewer/download path. |
| MV-12 | Bulk import, indexing, and migration safeguards | 120 s | Web/Electron; desktop segment labeled | Verified operator | Throwaway ZIP/CSV/folder | Import with a summary and recognize platform-only options. |
| MV-13 | Cephalometric templates, tracing, and results | 120 s | Web/Electron | Verified clinical admin | Synthetic radiograph | Calibrate, trace, compute, and save a reviewable result. |
| MV-14 | Administration, access, audit, and compliance | 120 s | Web/Electron | `superadmin`/verified admin | Dedicated test tenant | Manage access and inspect audit evidence without exposing data. |
| MV-15 | Desktop/LAN operation, licensing, and updates | 100 s | Electron | Desktop/LAN operator | Safe desktop test build | Identify local-only operations and appropriate update path. |
| MV-16 | Troubleshooting: wrong patient, failed upload, access, and escalation | 100 s | All | All | Staged safe error states | Recover safely or escalate with useful evidence. |
| MV-17 | Advanced image editing: crop, selections, color sampling, and reassignment | 120 s | Web/Electron | Editor-enabled test role | Disposable image | Use advanced editor tools without losing the original or assigning media incorrectly. |
| MV-18 | Cephalometric template authoring | 120 s | Web/Electron | Verified clinical admin | Test clinic template | Create or copy a template, define landmarks/measurements, and preserve order. |
| MV-19 | Understanding cephalometric result types | 100 s | Web/Electron | Clinical staff | Approved synthetic result set | Identify system analyses and read results as software output, not treatment advice. |
| MV-20 | Two-factor authentication and secure recovery | 75 s | Web/Electron | Account holder | Disposable authenticator/test account | Set up or disable 2FA without recording secrets or recovery codes. |
| MV-21 | Retention, legal hold, and disclosures | 115 s | Web/Electron | Verified superadmin | Synthetic eligible record and audit events | Review eligibility, protect a record, and generate a disclosure report safely. |
| MV-22 | Safe deletion and presentation-reference checks | 90 s | Web/Electron | Verified deletion role | Disposable patient/media/library/presentation fixtures | Cancel unsafe deletions and verify downstream presentation impact before confirming. |
| MV-23 | Safe LAN-to-web migration and post-import validation | 120 s | Electron source + web destination | Verified superadmin/operator | Empty disposable source/target environments | Move a controlled archive in the documented direction, verify exclusions/duplicates/audit, and stop safely on mismatch. |

## Sequencing rules

- Do not release MV-04 without MV-03; the safe capture behavior depends on patient identification.
- Do not release MV-07 or MV-08 before MV-06; learners need a reliable path into the editor.
- Do not release MV-10 to the general audience until R-02 is resolved.
- MV-12, MV-14, and MV-15 require separate operator/admin review because an error can affect multiple records or systems.
- MV-13 must be reviewed by a qualified clinical product owner for terminology and for a clear “not clinical advice” disclaimer.
- MV-17 through MV-23 are role-gated or destructive/sensitive workflows. Do not put them in a general-user learning path and do not record them until their release record is complete.

## Per-lesson release record

The production agent must create and complete one row for every lesson before a take can be called **Verified**. A blank build or evidence column makes the lesson ineligible for publication.

| Lesson ID | Exact platform/device | App build/version | Role tested | Evidence still(s) | Product reviewer | Compliance/clinical reviewer when needed | Status |
|---|---|---|---|---|---|---|---|
| MV-01 … MV-23 | Complete for each individual lesson; do not use a shared “current” value. | Complete for each individual lesson. | Displayed role plus internal test alias. | Filename(s), redacted. | Name/date. | Name/date or N/A. | Draft / Verified / Review Required / Retired |