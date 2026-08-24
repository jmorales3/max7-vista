# 01 — Discovery and Evidence Matrix

## Product model

Max7 Vista is a clinical patient-image management system. The principal experience is a web application that is also packaged for Electron desktop/LAN use. A separate Expo mobile companion provides patient lookup, capture, review, unassigned-image assignment, and limited patient-image management.

### Surface map

| Surface | Confirmed scope | Do not imply |
|---|---|---|
| Web | Full patient, capture, gallery, editor, presentations, library, templates, documents, import, settings, administration, and cephalometric workflows. | That every account sees every action; capture with the required test role. |
| Electron desktop/LAN | Principal web UI plus local SQLite/storage, LAN use, server-folder import, native storage chooser, license/trial gate, and desktop updater. | That cloud-only deployment instructions apply to an offline/local installation. |
| Expo mobile | Patients, native camera/gallery selection, draft/review/retry, optional patient assignment, unassigned gallery, batch assignment, move images, settings, and server setup/login. | Web editor, presentations, templates, library, bulk import, documents, cephalometrics, or admin modules. |

## Evidence matrix

“Live capture” means record the actual product, not an animated substitute. Evidence references are source-of-truth locations for the next verification pass.

| Module / user goal | Verified path | Role / platform | Prerequisite | Success state | Common mistake / privacy note | Live capture | Evidence |
|---|---|---|---|---|---|---|---|
| Orientation, language, help | Sidebar → Patients, Capture, Gallery, Manual; language selector | Authenticated web/Electron | Test user | Destination page and translated labels appear | Do not claim hidden admin controls are universal | Yes | `components/layout.tsx`, `pages/manual.tsx` |
| Patient records | `/patients` → New / search → patient detail → Edit / More | Web/Electron; exact write role must be verified | Synthetic patient set | Correct record opens and update is visible | Search before recording; never show production list. Demonstrate deletion only with disposable fixtures and a post-delete reference check. | Yes | `pages/patients.tsx`, `patient-detail.tsx`, `routes/patients.ts` |
| Image capture | Sidebar → Capture → choose patient → webcam/file queue → save | Web/Electron | Synthetic patient, disposable image | Upload completes and editor opens | Patient selection is required for the safe workflow | Yes | `pages/capture.tsx`, `pages/editor.tsx` |
| Gallery | Sidebar → Gallery → patient/unassigned/tags/grid/select/export | Web/Electron | Tagged test images and one library asset | Filtered grid, selection count, download or ZIP begins | “Show All” includes library assets; do not call Library fully separate in browsing | Yes | `pages/gallery.tsx`, `routes/images.ts` |
| Image editor | Open image from capture/gallery → HUD tools → Save / Save as Copy | Web/Electron | Disposable calibrated image and overlay image | Saved image/copy appears with expected treatment | Never turn a measurement demonstration into clinical advice | Yes | `pages/editor.tsx` |
| Presentations | Sidebar → Presentations → create/manage → fullscreen/export | Web/Electron; verify write role | Selected synthetic images | Slides and export result appear | Cross-patient content must remain synthetic | Yes | `pages/presentations.tsx`, `pages/presentation.tsx`, `routes/presentations.ts` |
| Image Library | Sidebar → Library → Upload Images / drag-drop → title/tags → Add to Presentation | Web/Electron | Non-clinical graphic assets | Asset and presentation selection appear | Use decorative assets only. Before deleting, identify presentation references; show the observed confirmation and consequence in the target build. | Yes | `pages/image-library.tsx`, `pages/gallery.tsx`, `routes/library.ts` |
| Templates and print documents | Sidebar → Templates → designer → document → header toggle → Print | Web/Electron; verify write role | Approved synthetic patient images and test printer/PDF target | Filled frames and header setting persist | Avoid real printer queues and patient data | Yes | `pages/templates.tsx`, `template-designer.tsx`, `template-document.tsx` |
| Patient documents | Patient detail → Documents → Upload / Preview / Download | Web/Electron | Synthetic PDF, DOCX, media file | Attachment appears and supported preview/download works | Do not show confidential document names or external viewer account data | Yes | `patient-detail.tsx`, `routes/documents.ts` |
| Bulk import / legacy indexing | Sidebar → Bulk Import; Settings → Scan Legacy Directory | Web/Electron; server folder is desktop/LAN only | Throwaway ZIP, CSV, wrapper folder, duplicate/re-import case, local test folder | Summary shows matched/created/imported/errors | Verify wrapper handling, EXIF/file-date fallback, corrected-CSV re-import, and already-indexed skips in the captured build. Never record real paths. | Yes | `pages/bulk-import.tsx`, `pages/settings.tsx`, `routes/import.ts`, chatbot prompt |
| Migration / storage | Settings → Migration / storage controls | Electron/LAN source and web destination; verified superadmin/operator | Empty disposable source/target systems, deliberate duplicate | Archive has the documented classes; import reports inserted/skipped data and creates expected audit evidence | Confirm source/target direction, archive data sensitivity, duplicate skips, local `storageDirectory` exclusion, and stop/recovery path before recording. Never show archive contents or real paths. | Mixed | `pages/settings.tsx`, `routes/settings.ts`, `routes/admin.ts`, chatbot prompt |
| Cephalometrics | Sidebar → Cephalometrics; patient detail → New Tracing | Web/Electron; template editing requires current admin role | Synthetic radiograph with known calibration reference | Landmarks, computed results, result view/overlay | Educational only; no clinical diagnostic claims | Yes | `pages/cephalometrics*.tsx`, `routes/ceph.ts` |
| Administration | Sidebar → Administration → Tags / Users / Audit Log / Integrity | `admin` or `superadmin` as noted below; web/Electron | Dedicated admin test accounts | Control is present and update/filter is visible | Never show real users, IPs, audit trail, backup codes | Yes | `pages/admin/*`, `routes/admin.ts`, `router.tsx` |
| 2FA, timeout, retention, legal hold, disclosures | Settings or patient More menu | Web/Electron; role must be confirmed per action | Dedicated synthetic compliance record | Confirmation/dialog/report state | Never record QR secret, recovery code, or authentic account session | Yes | `pages/settings.tsx`, `patient-detail.tsx`, chatbot prompt |
| Desktop license/LAN | Settings → License; desktop window/local server | Electron only | Nonproduction activated/trial build, safe LAN | License state or LAN address view | Mask machine ID, activation code, IP/path | Yes | `electron-app/src/main.ts`, `SELF_HOSTING.md` |
| Mobile capture / assignment | Mobile tabs → Capture / Patients → unassigned gallery → long press → Assign / Move | Expo mobile only | Synthetic mobile account, camera/media permission | Uploaded item, assignment confirmation, refreshed target list | Mobile permits unassigned upload after warning; no editor handoff | Yes | `mobile/app/(tabs)/camera.tsx`, `index.tsx`, `patient/[id].tsx` |
| Mobile connection, session, delivery | Mobile Settings / server setup / login | Expo mobile only | Test server URL and test account | Connection validation/session state | Mask QR URL/token; confirm timeout behavior in build | Mixed | `mobile/contexts/*`, `mobile/app/_layout.tsx`, `app.json`, `eas.json` |

## Reconciliation register — resolve before role-sensitive recording

| ID | Conflict / uncertainty | Recording rule |
|---|---|---|
| R-01 | The chatbot/manual describe roles as **User, Doctor, Superadministrator**. Router and API checks use `user`, `admin`, `superadmin`. | Use the current UI’s displayed role in screen capture. Say “clinical administrator” in draft narration until product owners choose one naming scheme. Do not use a role-permission animation as final media. |
| R-02 | Chatbot states Doctors manage patient edits, exports, presentations, templates, retention, and cephalometric templates. Several API guards use `admin`; retention/legal hold appears superadmin-only. | Verify each action with three test accounts. Label the lesson “role-restricted” and withhold its final release if observed behavior differs from approved policy. |
| R-03 | Chatbot says the Image Library is entirely separate from Gallery. Gallery code shows library assets when “All Patients” is selected. | Teach: “Library is the management home for reusable non-clinical assets; Gallery can also show them in its all-patients view.” |
| R-04 | Chatbot describes 15-minute inactivity, two-minute warning, and 15-minute mobile background logout. Mobile code currently defaults to a 30-minute background timeout with a final one-minute warning and foreground refresh. | Record web and mobile session behavior as separate lessons only after time-accelerated test verification. Do not quote durations in final media until verified in the target build. |
| R-05 | Web capture selects a patient then opens the editor; mobile allows an unassigned upload after an explicit confirmation and uploads without an editor. | Keep `MV-04` and `MV-05` separate. |
| R-06 | Some router pages are visible to authenticated users while API actions are role-protected. | Capture successful workflows with a verified role; do not infer permission from a visible URL or menu item. |
| R-07 | LAN/server-folder import is desktop/LAN-only. The mobile app has a public-server fallback, so server setup is not always first-launch required. | State platform condition directly and avoid mandatory language. |

## Evidence limits

This package is evidence-based from the source tree and configuration. It does not substitute for a controlled, current-build capture pass. The production agent must attach a dated evidence still for every lesson with a permission, timeout, export, deletion, migration, license, or clinical-measurement claim.