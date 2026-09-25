# 03 — Lesson Scripts and Storyboards

## Direction used by every lesson

Use a calm instructional voice at 130–145 words/minute. A screen action always follows the spoken cue by about 0.5 seconds. Show a high-contrast cursor halo on clicks, box only the active control, and pause 1.5 seconds on an expected result. Use a 16:9 master for web/Electron and a 9:16 master for mobile; never crop web controls into a vertical frame. Each title card: **Max7 Vista | [Lesson]**. Each end card: **Confirm the result before continuing | Version [capture build]**.

`[REC]` means real product capture required. `[ANI]` means a simple, explicitly conceptual animation is allowed.

## MV-01 — Orientation, navigation, language, and help (75 s)

**Audience/platform:** all authenticated users; web/Electron. **Setup:** clean test account on Patients. **Outcome:** learner can choose the correct work area and locate help.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:06 | [ANI] title card with three labeled surfaces: Web, Desktop/LAN, Mobile. | “Max7 Vista has a full web and desktop workspace, plus a focused mobile companion.” |
| 0:06–0:22 | [REC] Slowly point to sidebar items Patients, Capture, Gallery, Manual. Click Patients, then Gallery, returning to Patients. | “Use Patients to work with records, Capture to add media, and Gallery to find images. The Editor opens from an image rather than the sidebar.” |
| 0:22–0:37 | [REC] Open Manual; click one section. Open chatbot if available, then close without entering data. | “The Manual explains product workflows. The in-app guide can help you find a feature. Never enter patient details, passwords, or codes into a help conversation.” |
| 0:37–0:52 | [REC] Open language selector; choose and restore a test language. | “Choose English, Spanish, French, or Portuguese from the language selector. Confirm labels change before continuing.” |
| 0:52–1:09 | [ANI] Split screen: web/desktop full modules; mobile Patients, Capture, Settings. | “Mobile is designed for patient lookup and image capture. Advanced web modules stay on the web or desktop surface.” |
| 1:09–1:15 | [REC] Sidebar returns to Patients; success callout. | “You are ready when you can return to Patients and find help without exposing clinical data.” |

**If different:** if a sidebar item is absent, stop; it may be role- or platform-specific. **Accessibility:** say each destination by name; captions must retain “Editor opens from an image.”

## MV-02 — Sign-in, privacy, roles, and session safety (90 s)

**Audience/platform:** all users; web/Electron with a mobile comparison card. **Setup:** synthetic login and staged warning state. **Outcome:** learner protects data and recognizes a restricted action.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:12 | [ANI] title + shield over synthetic record. | “Clinical images require safe use: use only your own account, keep test and patient data separate, and lock your screen.” |
| 0:12–0:30 | [REC] Use synthetic credentials; show successful sign-in, never type readable password. Mask all entries. | “Sign in with your approved account. Do not record, share, or reuse credentials.” |
| 0:30–0:48 | [REC] Show a controlled role-restricted menu or Access Denied state with no real usernames. | “What you can do depends on your assigned role. A missing or blocked action is a permission boundary, not a reason to use someone else’s account.” |
| 0:48–1:05 | [REC] Stage idle warning; click Stay signed in, then show Sign out in a separate reset state. | “When the session warning appears, save your work. Choose Stay signed in only if you are still present; otherwise sign out.” |
| 1:05–1:20 | [ANI] 2FA/recovery-code privacy card; no QR/secret graphic. | “If your organization enables two-factor authentication, store recovery codes outside this recording and never share a code.” |
| 1:20–1:30 | [ANI] mobile timer comparison labeled “verify build duration.” | “Mobile background timing can differ from web. Follow the warning shown by your installed build.” |

**If different:** do not quote timeout minutes unless the current target build has been timed. **Accessibility:** captions include “permission boundary” and describe the warning without relying on color.

## MV-03 — Find, create, and open a patient record (90 s)

**Audience/platform:** verified write role; web/Electron. **Setup:** two synthetic patients with similar names and different codes. **Outcome:** correct record is opened or created.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:12 | [REC] Focus search box; type a synthetic patient code. | “Start with search. Use the patient code or a precise name before browsing a list.” |
| 0:12–0:28 | [REC] Compare two synthetic results; highlight code and date of birth; click correct result. | “Confirm at least two identifiers before opening a record.” |
| 0:28–0:47 | [REC] Open New Patient; fill only synthetic values; save. | “If no match exists, create a record with the required identifiers and save.” |
| 0:47–1:04 | [REC] Show patient detail sections: images, documents, ceph tracings; do not open sensitive content. | “The patient detail page is the hub for that patient’s clinical media and related work.” |
| 1:04–1:20 | [REC] Briefly show edit action only if verified for capture role. | “Edit and deletion controls can be role-restricted. If a control is unavailable, request the appropriate workflow through your administrator.” |
| 1:20–1:30 | [REC] Return to correct patient header with success callout. | “Success is the correct synthetic record, verified before you capture or upload.” |

**If different:** search results delayed or absent: retry precise code; do not create a duplicate until identity is confirmed. **Accessibility:** read the identifiers rather than relying on row position.

## MV-04 — Capture or upload an image safely (105 s)

**Audience/platform:** capture-enabled web/Electron user. **Setup:** one synthetic patient, disposable image file/webcam scene. **Outcome:** image is linked to that patient and editor opens.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:12 | [REC] From sidebar open Capture; show patient selector first. | “Before adding media, select and confirm the correct patient.” |
| 0:12–0:30 | [REC] Choose synthetic patient; highlight selected name/code. | “Pause here. A wrong patient association is harder to correct than a careful confirmation.” |
| 0:30–0:50 | [REC] Capture one test image or add one test file; show queue/review. | “Capture a new image or add an approved file. Review the queued image before saving.” |
| 0:50–1:10 | [REC] Save/upload; cursor stays away from unrelated controls. | “Save the item only after the patient and image are correct.” |
| 1:10–1:25 | [REC] Show editor opening and image header; show no editing. | “After web or desktop capture, Max7 Vista opens the editor for the new image.” |
| 1:25–1:45 | [ANI] warning card: “Mobile behaves differently—see MV-05.” | “Mobile can allow an unassigned upload after a clear warning and does not open this editor flow.” |

**If different:** cancel the capture if the patient selector does not match; do not “fix it later” inside a production demo. **Accessibility:** label selected patient in captions; do not rely on thumbnail-only confirmation.

## MV-05 — Mobile capture, review, and batch assignment (115 s)

**Audience/platform:** Expo mobile user. **Setup:** native phone with test camera/media permissions, one selected patient, three unassigned test images. **Outcome:** reviewed images are assigned or moved correctly.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:12 | [REC] Vertical title; mobile tabs Patients, Capture, Settings. | “Mobile is for focused capture and patient-image handling.” |
| 0:12–0:32 | [REC] Capture tab: show front/back/flash, take test image or choose test gallery items. | “Use the device camera or select approved images. Camera capture requires the native mobile app.” |
| 0:32–0:52 | [REC] Review/reorder screen; add a harmless test note; choose patient. | “Review each item, adjust its order or note if needed, and select the patient before upload whenever possible.” |
| 0:52–1:06 | [REC] Stage unassigned confirmation; cancel once, then demonstrate only with synthetic test data. | “If no patient is selected, the app warns you. Cancel to correct the association, or continue only when an unassigned upload is intentional.” |
| 1:06–1:28 | [REC] Patients tab → Unassigned → long press one image → select more → Select All only if test set is safe. | “To correct several unassigned images, long press one item to enter selection mode, then choose the images to move.” |
| 1:28–1:47 | [REC] Assign selected → select synthetic patient → confirm; show refreshed patient gallery. | “Assign the selection to the verified patient and confirm the refreshed result.” |
| 1:47–1:55 | [REC] Patient detail selection + Move, brief success state. | “The patient detail screen also supports moving selected images between patients.” |

**If different:** if permissions are denied, use the operating system’s settings path and restart—not repeated in-app taps. **Accessibility:** narration names each gesture and selection state; visible taps use a halo.

## MV-06 — Gallery essentials: filters, grid, selection, and download (105 s)

**Audience/platform:** web/Electron; export role verified. **Setup:** tagged images, one unassigned item, one library asset. **Outcome:** learner locates and safely selects the intended media.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:16 | [REC] Open Gallery; choose patient filter; show grid-density buttons. | “Gallery helps you find media. Start with the patient filter, then choose the grid density that lets you inspect safely.” |
| 0:16–0:35 | [REC] Toggle one tag and then Show All; show controlled result. | “Tag filters narrow the view. Show All clears filters; in the all-patients view, reusable library assets may also appear.” |
| 0:35–0:53 | [REC] Select Unassigned; explain no generic content. | “Use Unassigned to find media that needs an intentional patient association.” |
| 0:53–1:14 | [REC] Select mode → choose two synthetic items. | “Enter Select mode before choosing multiple items. Check the selection count and thumbnails before any next action.” |
| 1:14–1:33 | [REC] Demonstrate permitted individual download or ZIP export; show browser download indicator, no real path. | “When your role permits it, choose the appropriate download option. Exported media stays protected by your clinic’s handling policy.” |
| 1:33–1:45 | [REC] Clear selection and filters. | “Clear the selection when you are done, so the next action cannot include stale items.” |

**If different:** unavailable export control means capture account lacks the verified permission. **Accessibility:** captions state that the all-patients view can include library assets.

## MV-07 — Image editor essentials: annotate and save safely (120 s)

**Audience/platform:** web/Electron. **Setup:** disposable image. **Outcome:** learner adds a simple annotation and preserves the original when needed.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:15 | [REC] Open image from Gallery; point to editor tool area and zoom controls. | “Open an image from Gallery or Capture. Keep the original image and its purpose in mind before editing.” |
| 0:15–0:36 | [REC] Demonstrate zoom, rotate, then reset/review. | “Use zoom and rotate to inspect the image. Review each change at a useful scale.” |
| 0:36–0:58 | [REC] Draw one arrow, one circle, and one text label; move text in Pointer mode. | “Use arrows, circles, and text to call attention to an area. Place labels deliberately, then use Pointer mode to reposition them.” |
| 0:58–1:14 | [REC] Show freehand and Erase or Smooth on test marks. | “Freehand, Erase, and Smooth are for clear annotations, not for changing clinical evidence.” |
| 1:14–1:35 | [REC] Open Tone & Sharpness, adjust one slider, Reset. | “Tone and sharpness controls preview adjustments. They are written to the file only when you save.” |
| 1:35–1:53 | [REC] Save as Copy; return to gallery with original and copy. | “Choose Save as Copy when the original must remain unchanged. Save writes the current work to the existing image.” |
| 1:53–2:00 | [ANI] end card. | “Confirm the correct version appears before sharing or presenting it.” |

**If different:** if a tool is unavailable, verify the image state and current role; do not substitute another tool in final media. **Accessibility:** voiceover names annotation type and Save versus Save as Copy.

## MV-08 — Measurement, resize, angle, and overlay comparison (120 s)

**Audience/platform:** web/Electron, clinical staff. **Setup:** synthetic reference image with documented known length and a second comparison image. **Outcome:** learner knows calibration precedes a meaningful measurement.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:12 | [ANI] warning: “Training workflow, not clinical advice.” | “This lesson shows the software workflow. Measurements must follow your clinic’s clinical protocol.” |
| 0:12–0:37 | [REC] Click Measure; draw known reference; enter synthetic real-world length; show calibration confirmation. | “Select Measure first. Draw across a known reference, enter its true length, and confirm the scale before measuring anything else.” |
| 0:37–0:55 | [REC] Draw a ruler line; read displayed result without interpretation. | “The ruler uses the calibrated scale. Record or interpret results only under your approved clinical process.” |
| 0:55–1:13 | [REC] Click Resize; draw landmark line; enter target; show image change. | “Resize changes the image scale to match a target length. Verify the target before applying it.” |
| 1:13–1:31 | [REC] Angle: click three points slowly; reveal numeric readout. | “For Angle, click three points in order. Pause so the learner can see the expected angle result.” |
| 1:31–1:51 | [REC] Overlay picker; choose synthetic comparison image; show opacity, scale, X/Y, reset. | “Overlay adds a comparison layer. Use opacity, scale, and position controls, and Reset if alignment is no longer useful.” |
| 1:51–2:00 | [ANI] end card. | “Calibration, careful review, and clinical oversight come before any decision.” |

**If different:** never approximate a reference length for a demonstration. **Accessibility:** captions state the required click order and label every numeric result with units.

## MV-09 — Reusable library assets and presentations (110 s)

**Audience/platform:** verified presentation role; web/Electron. **Setup:** decorative assets, test patient images, empty test presentation. **Outcome:** reusable assets are kept distinct from patient content and added intentionally.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:15 | [REC] Open Library; title card says “non-clinical reusable assets.” | “Use Image Library for reusable, non-clinical assets such as title slides and approved clinic branding.” |
| 0:15–0:35 | [REC] Upload/drag test graphic; edit title; apply tag. | “Upload only approved reusable assets. Give each one a clear title and tag.” |
| 0:35–0:52 | [REC] Select asset; Add to Presentation; create test presentation. | “Select the asset, then add it to an existing presentation or create a new test presentation.” |
| 0:52–1:15 | [REC] Presentations hub; add selected synthetic patient image(s); type caption. | “Presentations can use selected assets and patient images. Use captions that identify the teaching purpose without adding unnecessary patient detail.” |
| 1:15–1:34 | [REC] Full-screen; then export menu with PDF/PowerPoint. | “Review in full screen, then export only through your clinic’s approved sharing process.” |
| 1:34–1:50 | [REC] Hover delete icon on a library test asset; cancel. | “Deleting a library asset removes it from storage. Check its presentation use before you confirm.” |

**If different:** retain R-03 wording: library is managed separately but can appear in Gallery’s all-patients view. **Accessibility:** describe fullscreen and export choices in narration.

## MV-10 — Templates and printed documents (110 s)

**Audience/platform:** verified template role; web/Electron. **Setup:** approved template and synthetic patient images. **Outcome:** learner fills and checks a document without overwriting an unsafe layout.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:16 | [REC] Templates list; open test template. | “Templates are reusable print layouts. Open a test template before editing a clinic-approved layout.” |
| 0:16–0:38 | [REC] Layout Designer: Add frame, drag, resize; no accidental delete. | “Add picture frames, then drag and resize them for the intended layout.” |
| 0:38–0:58 | [REC] Open document fill state; click empty frame; select synthetic image. | “In the document, click an empty frame to assign the approved patient image.” |
| 0:58–1:18 | [REC] Drag image inside frame; drag/resize clinic header; toggle Header On/Off. | “Reposition the image inside its frame. The clinic header can be moved, resized, and turned on or off for this document.” |
| 1:18–1:38 | [REC] Save; refresh/reopen to show persisted result. | “Save, then reopen or refresh to confirm the image and header settings persisted.” |
| 1:38–1:50 | [REC] Print dialog reached with test printer/PDF target; cancel. | “Verify the final layout and approved print destination before printing.” |

**If different:** final production is blocked until R-02 confirms available roles and existing-print consequences. **Accessibility:** captions name frame, header, save, and print states.

## MV-11 — Patient documents: attach, preview, and download (75 s)

**Audience/platform:** verified document role; web/Electron. **Setup:** synthetic PDF and DOCX named for training. **Outcome:** attachment is visible and safe preview/download option is understood.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:12 | [REC] Correct patient detail → Documents. | “Open the verified patient record, then use its Documents section.” |
| 0:12–0:30 | [REC] Upload or drag synthetic PDF; wait for attached row. | “Attach an approved file and wait until it appears in the patient document list.” |
| 0:30–0:47 | [REC] Preview PDF; return. | “Use Preview for supported formats. Viewer behavior can depend on your browser and file type.” |
| 0:47–1:02 | [REC] Download control; show safe browser indicator. | “Download only when the file must leave the application and your policy permits it.” |
| 1:02–1:15 | [ANI] supported-type card. | “Documents can include office files, PDF, images, video, and audio. Treat every attachment as patient information.” |

**If different:** unsupported preview: use Download only if approved; do not call it an upload failure. **Accessibility:** captions list “Preview” and “Download” as separate actions.

## MV-12 — Bulk import, indexing, and migration safeguards (120 s)

**Audience/platform:** web/Electron; server-folder portion Electron/LAN only. **Setup:** disposable ZIP, CSV, and local test folder. **Outcome:** operator reads import summary and knows when to stop.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:13 | [ANI] diagram: ZIP/CSV versus Desktop server folder, labeled “test environment.” | “Bulk import is an operator workflow. Practice only with a disposable archive and test tenant.” |
| 0:13–0:29 | [REC] Bulk Import → Upload ZIP; select synthetic ZIP whose patient folders use identifiers. | “Choose Upload ZIP for an archive. Patient folders use the approved identifier convention.” |
| 0:29–0:43 | [REC] Repeat with a wrapper-folder fixture; show recognized inner patient folder in summary. | “The test package includes a single wrapper folder. Confirm the importer detects and skips that wrapper before you rely on an archive layout.” |
| 0:43–0:57 | [REC] Attach synthetic CSV; show capture-date result sourced from EXIF and a separate file-date fallback fixture. | “An optional CSV provides patient details. Capture dates can come from image metadata, with file date used when metadata is unavailable.” |
| 0:57–1:12 | [REC] Run import; hold on created, matched, imported, skipped, and error results. | “Read every summary category. Stop and investigate errors rather than retrying blindly.” |
| 1:12–1:27 | [REC] Re-import corrected CSV against matched test record; show matched update/no duplicate result. | “A corrected CSV re-import should update the matching test record, not create a duplicate. Verify that result before continuing.” |
| 1:27–1:42 | [REC] Desktop-only Server Folder and Settings → Scan Legacy Directory; mask path; show already-indexed skip plus unassigned result. | “Server Folder is desktop/LAN only. Legacy indexing skips already-indexed files and leaves unmatched folders unassigned for review.” |
| 1:42–2:00 | [ANI] handoff to MV-23. | “Migration between systems is a separate controlled workflow. Use the migration lesson and its explicit source-to-target checks.” |

**Required capture proof:** ZIP import, wrapper-folder detection, EXIF date, file-date fallback, corrected-CSV re-import, no-duplicate result, server-folder platform label, already-indexed skip, unassigned result, and final summary. **If different:** platform option missing: confirm whether capture is web or Electron; never claim parity. **Accessibility:** all summary numbers and error labels must be read aloud.

## MV-13 — Cephalometric templates, tracing, and results (120 s)

**Audience/platform:** verified clinical-admin role; web/Electron. **Setup:** synthetic radiograph, known scale, approved test template. **Outcome:** tracing is calibrated, saved, computed, and reviewable.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:12 | [ANI] clinical disclaimer. | “This is a software workflow demonstration, not clinical interpretation or treatment guidance.” |
| 0:12–0:29 | [REC] Cephalometrics dashboard; View system template; Copy to Edit only if account permits. | “System templates are reference layouts. Use a copy when the current role is permitted to edit.” |
| 0:29–0:46 | [REC] Synthetic patient → Ceph Tracings → New Tracing → choose radiograph and phase. | “From the patient record, start a tracing with the correct radiograph and documented treatment phase.” |
| 0:46–1:08 | [REC] Step 1 calibrate two points and known mm; Apply. | “First calibrate against a known reference. Enter the true length and apply the scale.” |
| 1:08–1:29 | [REC] Step 2 place two landmarks; drag adjustment; Save Progress. | “Place landmarks in sequence. Adjust only under your clinical protocol, and save progress before moving on.” |
| 1:29–1:46 | [REC] Step 3 Compute Measurements; results table. | “Compute measurements, then review the displayed values and ranges in the approved clinical context.” |
| 1:46–2:00 | [REC] result View; Eye toggle; Save to Gallery; do not delete. | “The result view can show or hide the tracing and save an overlay to Gallery for controlled follow-up use.” |

**If different:** do not state clinical ideal ranges in narration until subject-matter review. **Accessibility:** captions describe every step—Calibrate, Landmarks, Results—without relying on position.

## MV-14 — Administration, access, audit, and compliance (120 s)

**Audience/platform:** `superadmin` or verified role; web/Electron. **Setup:** isolated tenant with synthetic user accounts, staged audit events. **Outcome:** admin can demonstrate least-privilege behavior without exposing security data.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:14 | [ANI] least-privilege diagram with role labels marked “verify current naming.” | “Administrative access is tenant-scoped. Use the least privilege needed for the work.” |
| 0:14–0:34 | [REC] Administration → User Management; synthetic user row; Access panel. | “Use User Management only with an authorized administrative account. Patient access restrictions should be intentional and reviewed.” |
| 0:34–0:50 | [REC] Tags management with test tag; cancel deletion. | “Manage tags consistently so staff can find images without inventing personal shortcuts.” |
| 0:50–1:12 | [REC] Audit Log; filter a staged synthetic event and show pagination. | “Audit Log helps investigate activity. Filter by approved fields and protect the information it displays.” |
| 1:12–1:32 | [REC] Settings 2FA/retention view with no QR/recovery content; staged legal hold or disclosure menu if verified. | “Security, retention, legal hold, and disclosure controls are regulated workflows. Follow your organization’s approved policy and role assignment.” |
| 1:32–1:50 | [REC] Integrity page safe status or conceptual card. | “Use integrity tools according to the operator runbook. Record no live tenant data in training media.” |
| 1:50–2:00 | [ANI] escalation card. | “If the action is missing, blocked, or unclear, stop and escalate rather than changing another account.” |

**If different:** release blocked by R-01/R-02; do not use “Doctor” as an implementation role without confirmed policy. **Accessibility:** say filter names and page results aloud.

## MV-15 — Desktop/LAN operation, licensing, and updates (100 s)

**Audience/platform:** Electron desktop/LAN operator only. **Setup:** safe desktop test build, masked machine ID/path/LAN address. **Outcome:** operator recognizes desktop-only controls and correct delivery path.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:14 | [ANI] Web, Electron LAN, and Mobile delivery diagram. | “Desktop/LAN operation is different from the published web application and the phone companion.” |
| 0:14–0:33 | [REC] Electron Settings → storage chooser; show test folder label only. | “Electron can use local storage and a native folder chooser. Never record real file-system paths.” |
| 0:33–0:49 | [REC] Electron-only Server Folder card, with masked path. | “Server-folder import is a desktop/LAN operator feature, not a browser or mobile workflow.” |
| 0:49–1:09 | [REC] License section in a safe state; mask machine ID; no code entry. | “Desktop licensing can show trial, active, expired, or tampered states. Activation is machine-specific; keep identifiers and codes private.” |
| 1:09–1:25 | [REC] Safe updater status or [ANI] desktop update card. | “Electron updates follow the desktop release process.” |
| 1:25–1:40 | [ANI] web Publish versus Expo OTA card. | “Publishing web or API changes does not update a phone app’s JavaScript. Mobile bundles use the Expo production update channel.” |

**If different:** no license panel may indicate web capture; stop and relabel surface. **Accessibility:** distinguish every delivery channel in captions, not by icon alone.

## MV-16 — Troubleshooting: wrong patient, failed upload, access, and escalation (100 s)

**Audience/platform:** all; capture examples separately labeled. **Setup:** staged, harmless error states. **Outcome:** learner preserves data and collects useful escalation information.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:15 | [ANI] stop-sign card: “Do not guess with patient data.” | “When a workflow looks wrong, stop before creating duplicate records, changing permissions, or deleting media.” |
| 0:15–0:32 | [REC] Wrong-patient staged example; show cancel/back and correct search. | “If the patient is wrong, cancel before upload. Confirm two identifiers, then restart the safe path.” |
| 0:32–0:48 | [REC] Mobile failed-item retry in a test state. | “On mobile, review the failed item and retry only after connection and patient selection are correct.” |
| 0:48–1:06 | [REC] Web no-permission/Access Denied state. | “A missing control or access message is a permission boundary. Do not borrow another user’s account.” |
| 1:06–1:22 | [REC] Gallery unassigned filter and assignment pathway. | “Use Unassigned to review intentional or corrected unlinked media. Avoid bulk actions until every selected thumbnail is verified.” |
| 1:22–1:35 | [ANI] support checklist. | “For escalation, share the surface, app version, time, safe reproduction steps, and a redacted screenshot—never patient data or credentials.” |
| 1:35–1:40 | [ANI] end card. | “Protect the record first; troubleshoot second.” |

**If different:** capture the exact screen and route it to the product owner as a possible documentation defect. **Accessibility:** warnings use text, icon, and narration; no color-only meaning.

## MV-17 — Advanced image editing: crop, selections, color sampling, and reassignment (120 s)

**Audience/platform:** editor-enabled test role; web/Electron. **Setup:** disposable image, a second synthetic patient, and a resettable source image. **Outcome:** learner completes precise edits while preserving the original and correct patient association.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:14 | [REC] Open disposable image; show Crop tool and crop bounds. | “Use Crop to frame the image deliberately. Keep clinically relevant image context according to your clinic’s protocol.” |
| 0:14–0:30 | [REC] Drag crop handles; Apply; show before/after review. | “Adjust the crop handles, apply the change, and review the result before saving.” |
| 0:30–0:46 | [REC] Eyedropper samples a visible test color; draw an arrow with sampled color. | “Eyedropper samples a color from the image so annotations remain easy to see.” |
| 0:46–1:08 | [REC] Select rectangular region; copy or move it on the disposable image; undo/reset if available. | “Select isolates a rectangular or freehand region for cut, copy, or move. Use this only on a training image until your workflow is approved.” |
| 1:08–1:24 | [REC] Draw short freehand mark; apply Smooth/Wand; show difference. | “Smooth, also called Wand, refines a freehand stroke. It does not replace clinical review.” |
| 1:24–1:44 | [REC] Assign image to second synthetic patient; cancel once, then confirm only after two-identifier check. | “If an image must be reassigned, confirm both source and destination records. Cancel when either identifier is wrong.” |
| 1:44–2:00 | [REC] Save as Copy; Gallery confirms new copy and intended patient. | “Save as Copy preserves the source. Confirm the new copy and its patient association in Gallery.” |

**If different:** do not demonstrate destructive region edits without a reset fixture. **Accessibility:** name Crop, Eyedropper, Select, Smooth, Assign, and Save as Copy in captions.

## MV-18 — Cephalometric template authoring (120 s)

**Audience/platform:** verified clinical-admin role; web/Electron. **Setup:** disposable clinic template and approved synthetic landmarks. **Outcome:** learner can safely author an editable clinic template while preserving system templates.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:12 | [ANI] disclaimer: “Software configuration; clinical content requires qualified review.” | “Template configuration changes how the application organizes tracing. Use approved clinical definitions.” |
| 0:12–0:29 | [REC] Cephalometrics dashboard; select a system template; show read-only notice; Copy to Edit. | “System templates are read-only references. Copy one to create an editable clinic template when your role permits it.” |
| 0:29–0:48 | [REC] New Template or copied editor; add landmark short label and full name. | “Add a short landmark label and a clear full name. Labels must match the point names used by measurements.” |
| 0:48–1:05 | [REC] Drag landmark rows to reorder; pencil edit; show delete but cancel. | “Order landmarks intentionally. Edit labels carefully and cancel deletion unless the template is disposable.” |
| 1:05–1:31 | [REC] Add measurement; show type selector: Line, Angle, Perpendicular, Line-Line Angle; fill matching labels. | “Choose the measurement type, then enter point labels exactly as defined in Landmarks.” |
| 1:31–1:47 | [REC] Select Line-Line Angle and an available quadrant option; reorder measurements. | “For a line-line angle, set the appropriate quadrant when the template requires it, then order measurements for review.” |
| 1:47–2:00 | [REC] Save and reopen test template. | “Save and reopen the template to confirm landmark and measurement order persisted.” |

**If different:** system template editing must never be implied where the UI is read-only. **Accessibility:** captions list all four measurement types and explain that labels must match.

## MV-19 — Understanding cephalometric result types (100 s)

**Audience/platform:** clinical staff; web/Electron. **Setup:** approved synthetic completed results for Steiner, Ricketts, Tweed, and Witts. **Outcome:** learner can identify the software’s displayed analysis families without treating output as a diagnosis.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:12 | [ANI] disclaimer and result-table legend. | “Results are software outputs for qualified clinical review, not a diagnosis or treatment recommendation.” |
| 0:12–0:28 | [REC] System template list: Steiner and Ricketts; open synthetic results. | “Steiner and Ricketts templates display their configured angular and linear measurements from the traced landmarks.” |
| 0:28–0:43 | [REC] Tweed result row(s); cursor identifies label and unit only. | “Tweed results are shown as configured by the template. Read the label, value, and unit together.” |
| 0:43–1:05 | [REC] Witts template/result; [ANI] x-only vertical projection to occlusal plane, not geometric perpendicular. | “Witts Appraisal reports the sagittal relationship by vertically projecting AO and BO onto the occlusal plane. The value is in millimeters; the displayed ideal range, when present, is a reference—not a decision.” |
| 1:05–1:23 | [REC] Results table with any displayed ideal range; hide/show tracing. | “Review each result beside its displayed reference range and the traced image. Do not rely on a number without checking landmark placement.” |
| 1:23–1:40 | [ANI] escalation card. | “If a value or unit differs from the approved template, stop and have a qualified reviewer verify the template and tracing.” |

**If different:** never narrate a clinical range that is absent from the captured template. **Accessibility:** captions identify units and define “vertical projection” without relying on the diagram alone.

## MV-20 — Two-factor authentication and secure recovery (75 s)

**Audience/platform:** account holder; web/Electron. **Setup:** disposable account plus an approved test authenticator. **Outcome:** learner can follow the secure setup/disable boundary without exposing secrets.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:12 | [ANI] title + “Never record QR codes, secrets, or recovery codes.” | “Two-factor authentication protects an account. The one-time secret and recovery codes must never appear in training media.” |
| 0:12–0:29 | [REC] Settings → Two-Factor Authentication → Set Up; replace QR/code area with an approved opaque privacy mask. | “Open Settings and choose Set Up. Scan the code with your authenticator or enter it privately; this recording masks the secret.” |
| 0:29–0:45 | [REC] Enter a masked test verification code; show success state. | “Enter the current six-digit verification code and confirm the enabled state.” |
| 0:45–0:58 | [ANI] recovery-code rule. | “Save recovery codes only in your organization’s approved secure location. They are shown once and must not be copied into a video, chat, or shared document.” |
| 0:58–1:15 | [REC] Disable action opens password confirmation; cancel. | “To disable two-factor authentication, use the account’s approved recovery process and confirm with the password. Cancel if you are only reviewing the setting.” |

**If different:** if 2FA is organization-managed rather than optional, relabel this lesson and have security review it. **Accessibility:** privacy mask is described in captions so no viewer needs the hidden content.

## MV-21 — Retention, legal hold, and disclosures (115 s)

**Audience/platform:** verified superadmin role; web/Electron. **Setup:** synthetic record eligible for deletion, separate record under a test legal hold, staged audit events. **Outcome:** administrator can review, protect, report on, and safely avoid an irreversible purge.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:13 | [ANI] warning: “Policy-controlled and potentially irreversible.” | “Retention and disclosure tasks are compliance workflows. Follow your organization’s policy and verified role assignment.” |
| 0:13–0:31 | [REC] Settings retention control; display approved synthetic retention value; save only in reset tenant. | “Set or review the retention policy only in the approved administration workflow. This setting determines when records become eligible for review, not automatic deletion.” |
| 0:31–0:47 | [REC] Eligible for Deletion list; select synthetic record; Purge confirmation opens; cancel. | “An eligible record still requires a deliberate purge. Review the record and cancel unless the approved process authorizes deletion.” |
| 0:47–1:08 | [REC] Synthetic patient More → Place Legal Hold; enter generic test reason; confirm badge. | “A legal hold prevents a protected record from being purged. Enter the required approved reason and confirm the Legal Hold badge.” |
| 1:08–1:23 | [REC] Release Legal Hold confirmation opens; cancel. | “Release a hold only when the documented authorization permits it. The cancellation path is the safe default in training.” |
| 1:23–1:43 | [REC] More → Generate Disclosure Report; set a safe date range; choose JSON or CSV; show download indicator. | “Generate a disclosure report to review access or export activity for the patient. Use an authorized date range and protect the exported report.” |
| 1:43–1:55 | [ANI] escalation card. | “If any control or expected badge differs, stop and escalate—do not work around it with another account.” |

**If different:** release blocked until R-01/R-02 and the actual role guards are verified. **Accessibility:** captions distinguish eligibility, purge, legal hold, release, and disclosure report.

## MV-22 — Safe deletion and presentation-reference checks (90 s)

**Audience/platform:** verified deletion role; web/Electron. **Setup:** isolated patient, patient image, library asset, and presentation that references the asset; reset fixture after each take. **Outcome:** learner checks impact and uses cancellation before destructive confirmation.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:13 | [ANI] warning: “Deletion can be permanent and can affect related content.” | “Deletion is a controlled workflow. Use a disposable fixture in training and review references before confirming.” |
| 0:13–0:29 | [REC] Patient detail More → Delete; confirmation appears; cancel. | “Before deleting a patient, verify the record and related documents, images, tracings, and presentations. Use Cancel when the impact is not fully understood.” |
| 0:29–0:45 | [REC] Gallery/test image delete control; confirmation appears; cancel. | “The same discipline applies to media. Do not use a deletion action as an editing shortcut.” |
| 0:45–1:04 | [REC] Library asset selected; locate test presentation reference; invoke delete confirmation; capture exact observed impact wording; cancel. | “Before deleting a reusable library asset, identify presentations that use it. The current build’s confirmation and downstream result must be captured exactly—never assume a warning is present.” |
| 1:04–1:18 | [REC] Open test presentation after a reset-state reference check; show intact asset or exact post-test result in separate disposable take. | “After any approved destructive test, reopen the affected presentation and verify the expected state before publishing this lesson.” |
| 1:18–1:30 | [ANI] retention card. | “Keep the evidence still, manifest, and reset record with the production package.” |

**If different:** withhold this lesson if a confirmation, reference consequence, or recovery expectation is not observed and approved. **Accessibility:** every confirmation and cancellation control is named in captions.

## MV-23 — Safe LAN-to-web migration and post-import validation (120 s)

**Audience/platform:** verified superadmin/operator; Electron/LAN source and web destination. **Setup:** two empty disposable systems, a documented synthetic source fixture, one intentional duplicate in the destination, and reset snapshots. **Outcome:** operator understands the controlled transfer direction, expected duplicate behavior, excluded local path, audit proof, and stop condition.

| Time | Screen direction | Voiceover / captions |
|---:|---|---|
| 0:00–0:15 | [ANI] Direction card: “Electron/LAN source → migration archive → web destination,” with a lock over archive contents. | “Migration transfers a controlled archive between systems. Use an approved, empty test source and destination—not production data.” |
| 0:15–0:31 | [REC] Electron Settings → Migration; show Download migration archive action; do not open the archive. | “On the source system, download the migration archive. The archive can contain patient records, image files, users, and settings, so treat it as sensitive data.” |
| 0:31–0:45 | [ANI] archive inventory card: patients, images, users, settings; excluded `storageDirectory` path; no secret values. | “The local storage-directory setting is excluded so each system preserves its own path. Do not expose archive files, paths, passwords, or user details in training media.” |
| 0:45–1:03 | [REC] Web destination Settings → Migration → Import archive; choose masked synthetic archive; begin import. | “At the destination, import the approved archive. Keep the source and destination roles and direction visible in the manifest.” |
| 1:03–1:20 | [REC] Import outcome showing inserted and skipped/matched duplicate behavior; hold long enough to read. | “Existing patient and user records are expected to be skipped rather than duplicated. If the summary differs from the approved test expectation, stop here.” |
| 1:20–1:37 | [REC] Audit Log filter for synthetic migration event; no IP or real user data. | “Verify the migration audit event in the destination’s Audit Log using the synthetic event and safe filter.” |
| 1:37–1:51 | [REC] Post-import checks: one synthetic patient, image count, test user, storage setting remains destination-local. | “Validate a sample record, its images, the expected test user, and that the destination’s local storage setting has not been replaced.” |
| 1:51–2:00 | [ANI] stop/recovery card. | “On any mismatch, stop the rollout, preserve the manifest and summary, restore the disposable test environment, and escalate through the approved migration runbook.” |

**Required capture proof:** source platform, destination platform, archive sensitivity warning, documented archive classes, local-storage-path exclusion, intentional duplicate skip, import summary, audit event, sample post-import validation, and stop/recovery card. **If different:** do not repeat the migration against a shared environment; restore the test snapshot and escalate. **Accessibility:** captions state source, destination, each archive class, the exclusion, duplicate handling, and recovery condition.