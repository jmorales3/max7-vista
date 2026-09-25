# Max7 Vista Training Video Production Package

**Purpose:** Give a dedicated production agent enough verified product context to plan, capture, narrate, caption, QA, and maintain a library of short Max7 Vista training videos without rediscovering the application.

**Package status:** Discovery was performed from the current source tree and configuration on 2026-08-24. It is a production brief, not permission to demonstrate unverified behavior. The contradiction register in [01-discovery-and-evidence.md](01-discovery-and-evidence.md) takes precedence over the in-app chatbot whenever a claim conflicts with implementation.

## Start here

1. Read [01-discovery-and-evidence.md](01-discovery-and-evidence.md), including the release-blocking clarification items.
2. Use [02-curriculum.md](02-curriculum.md) to select lessons in learner order.
3. Use [03-lesson-scripts-and-storyboards.md](03-lesson-scripts-and-storyboards.md) as the recording script. Do not improvise controls or permissions.
4. Build and record using [04-capture-manifests.md](04-capture-manifests.md).
5. Apply [05-production-standards.md](05-production-standards.md) before export and [06-change-control-and-qa.md](06-change-control-and-qa.md) at every release.

## Non-negotiable recording rules

- Record only a controlled test tenant with synthetic people, images, documents, usernames, and clinic branding.
- Never show real patient records, credentials, authentication codes, recovery codes, API keys, tokens, private URLs, local file-system paths, IP addresses, or unapproved tenant data.
- A real screen capture is required for operating procedures. Animated diagrams may explain concepts only; they must not portray unverified UI.
- Do not state that a user can access a function until the capture account has demonstrated it. The code currently uses `user`, `admin`, and `superadmin`; some help text instead calls the clinical role “Doctor.”
- Web/Electron and mobile are separate products. Do not imply that the mobile app has the web gallery, editor, presentations, bulk import, templates, cephalometrics, or administration modules.

## Deliverables expected from the production agent

For each approved lesson: a source recording, edited master, title card, end card, narration script, timestamped transcript, captions (`.vtt` or `.srt`), capture manifest, evidence screenshot(s), and completed QA checklist. Use the filenames and retention guidance in the production standards.

## First production batch

Produce these six only after the test fixtures and roles pass the capture readiness checks:

1. `MV-01` Orientation and help
2. `MV-02` Sign-in, privacy, and session safety
3. `MV-03` Find and open a patient record
4. `MV-04` Capture or upload an image safely
5. `MV-05` Mobile capture and batch assignment
6. `MV-06` Gallery essentials

They teach the highest-frequency, lowest-specialist workflows and expose the core platform differences before advanced modules are recorded.