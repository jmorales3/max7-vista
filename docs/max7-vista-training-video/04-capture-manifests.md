# 04 — Capture Manifests and Synthetic Fixtures

## Required manifest fields

Create one JSON or spreadsheet row per recording take. Required fields:

| Field | Requirement |
|---|---|
| Lesson ID / take ID | Example: `MV-04-web-take-01` |
| Capture date and operator | Use local date/time and production-agent identifier. |
| Platform / device / viewport | Example: web Chrome 1920×1080; Electron Windows 1920×1080; iPhone portrait 1179×2556. |
| App build/version | Web deployment revision or desktop/mobile build version; never a private URL. |
| Account role and tenant | Synthetic account alias and displayed role only; no real usernames. |
| Starting route/state | Exact route or mobile tab and signed-in/out state. |
| Fixtures | Synthetic patients, images, documents, tags, template, presentation, staged errors. |
| Actions / expected result | Link to lesson timestamp and state the visible end result. |
| Evidence | Recording filename, still screenshot filename, QA status, reviewer. |
| Exceptions | Any behavior different from the script, R-01 through R-07 reference, and disposition. |

## Fixture kit

Create a disposable training tenant containing:

| Fixture | Safe example | Used by |
|---|---|---|
| Patient A | `Training, Avery`, code `TRN-1001`, DOB `1990-01-15` | Record, capture, gallery, documents, templates |
| Patient B | `Training, Bailey`, code `TRN-1002`, DOB `1988-06-20` | Identity check and image move |
| Patient C | `Training, Casey`, code `TRN-1003`, DOB `2001-11-03` | Access restriction/search test |
| Media | Clearly watermarked synthetic images: `TRAINING ONLY — NOT A PATIENT` | Capture, editor, gallery, presentations |
| Radiograph | Licensed or generated teaching image with embedded `TRAINING ONLY`; documented known ruler length | MV-08, MV-13 |
| Documents | `training-consent.pdf`, `training-summary.docx`, `training-audio.mp3` with dummy content | MV-11 |
| Library assets | Clinic-neutral title, section, and landscape graphics | MV-06, MV-09 |
| Import package | `training-import.zip`, `training-patients.csv`, wrapper-folder variant, safe duplicate variant | MV-12 |
| Accounts | `training-user`, `training-admin`, `training-superadmin` | Role reconciliation and MV-14 |

Use only data generated for this purpose. Do not use even de-identified copies of real clinic files without written approval; names, images, biometric data, metadata, and file history can still be identifying.

## Capture-specific manifests

| Lesson(s) | Platform / starting state | Role / fixtures | Required proof |
|---|---|---|---|
| MV-01 | Web/Electron `/patients` | `training-user` | Sidebar, Manual, translated label, surface boundary card |
| MV-02 | Web login plus staged timeout; mobile card | Each test role | Masked login, visible role restriction, session warning |
| MV-03 | Web `/patients` | verified writer + A/B records | Search result identifiers and saved record |
| MV-04 | Web `/capture` | capture-enabled account + A + test image | Selected patient, queue, completed editor handoff |
| MV-05 | Native device Capture / Patients | mobile account + 3 unassigned images | Permission state, review, warning, long-press selection, assignment |
| MV-06 | Web `/gallery` | tagged media + library asset | filter/tag/unassigned/selection/export state |
| MV-07 | Web `/editor/:id` | disposable media | source image, annotation/tone tool states, saved original/copy distinction |
| MV-08 | Web `/editor/:id` | calibrated reference and overlay images | calibration, ruler/resize/angle result, overlay controls/reset |
| MV-09 | Web `/library`, `/presentations` | decorative assets + test presentation | library title/tag, slide, fullscreen/export |
| MV-10 | Web `/templates` | test template and images | frame/header persistence, safe print dialog |
| MV-11 | Web patient Documents | synthetic PDF/DOCX | attached row, preview and download control |
| MV-12 | Web `/import`, Electron variant | ZIP/CSV/wrapper-folder/date-fallback/corrected-CSV/folder test kit | ZIP, wrapper skip, EXIF date, file-date fallback, corrected re-import/no duplicate, summary, desktop-only label, indexed skip, unassigned result |
| MV-13 | Web `/cephalometrics` | clinical admin + synthetic radiograph | calibration, landmarks, results, overlay |
| MV-14 | Web `/admin/*` | synthetic superadmin/admin tenant | user/access/filter/integrity safe state |
| MV-15 | Electron settings | desktop operator | masked storage/license/updater state |
| MV-16 | Web/mobile staged errors | all safe test states | cancel/retry/access/escalation evidence |
| MV-17 | Web `/editor/:id` | disposable source, destination patient, reset copy | crop, eyedropper, selection, smooth, reassignment, saved copy |
| MV-18 | Web `/cephalometrics` template editor | clinical admin + disposable clinic template | read-only system copy, landmark labels/order, all measurement types, saved reopen |
| MV-19 | Web cephalometric result view | approved synthetic completed results | Steiner/Ricketts/Tweed/Witts labels, units, displayed range, tracing review |
| MV-20 | Web `/settings` | disposable account + test authenticator | masked secret, enabled confirmation, safe disable cancellation |
| MV-21 | Web settings and patient detail | superadmin + eligible/held synthetic records | retention state, purge cancellation, hold badge, disclosure export |
| MV-22 | Web patient/gallery/library/presentation | deletion role + resettable reference fixture | all confirmation wording, cancellation, exact reference impact, post-check |
| MV-23 | Electron Settings source + web Settings destination + Audit Log | two disposable systems, masked archive, intentional duplicate, reset snapshots | source/destination, sensitive archive classes, storage-path exclusion, duplicate skip, summary, audit event, sample post-import validation, stop/recovery |

## Pre-capture gate

- [ ] Correct artifact and current build are running.
- [ ] Capture account has only synthetic data visible.
- [ ] Browser/OS notifications, bookmarks, downloads, clipboard manager, other apps, and desktop files are hidden.
- [ ] Zoom, device font size, audio input, cursor halo, and recording resolution have been tested.
- [ ] All test items have conspicuous training-only labels.
- [ ] Role restrictions and timeout statements have evidence for the exact build.
- [ ] Destructive actions are staged with reset fixtures; deletion/purge/migration is not performed against a shared environment.
- [ ] The exact expected end state appears before narration is recorded.