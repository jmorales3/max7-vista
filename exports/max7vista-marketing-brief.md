# Max7 Vista — Product & Marketing Brief
_For the Max7Vista.com marketing / subscription-billing platform_

**Purpose of this document:** everything the new marketing site's Agent needs to describe Max7 Vista's value to a prospective clinic — written in benefit language, not implementation detail. Max7 Vista itself is the clinical product; this new project (max7vista.com) is a separate marketing + subscription/billing front door for it, so it should NOT try to reproduce clinical functionality — only sell it, sign customers up, and manage billing/plans.

---

## 1. What Max7 Vista Is

Max7 Vista is a clinical patient image management system built for dental, orthodontic, and surgical practices that need to capture, organize, annotate, present, and securely store before/after patient photography and radiographs — without juggling loose folders, USB drives, or generic consumer photo apps.

It replaces an ad-hoc mix of phone cameras, shared drives, and PowerPoint with one purpose-built system spanning capture → clinical editing/measurement → patient-ready presentations → secure long-term storage, all while meeting healthcare compliance requirements out of the box.

**Available as:** a cloud web app, a desktop/LAN application (Electron, for clinics that want on-premise data control), and a companion mobile app for on-the-go capture.

---

## 2. Who It's For

- Orthodontic and dental practices doing routine before/after case documentation
- Oral & maxillofacial / cosmetic surgical practices tracking treatment progress photographically
- Multi-doctor group practices and small clinic chains (multi-tenant, multi-user, role-based)
- Practices that need cephalometric (radiographic) analysis as part of treatment planning
- Any clinic that currently uses patient photos for consultations and needs a safer, faster, more professional way to manage and present them

---

## 3. Core Value Pillars (lead with these)

1. **Everything in one place** — capture, edit, measure, present, and store patient images without leaving one system.
2. **Built for chairside and consult-room use** — designed around real clinical workflows (before/after, overlays, annotated explanations to patients), not a generic file manager.
3. **Compliance-ready from day one** — HIPAA-oriented audit logging, session timeouts, data retention/legal hold controls, and role-based access are built in, not bolted on.
4. **Flexible deployment** — cloud (web), on-premise (desktop/LAN for clinics wanting local data control), and mobile capture, all working from the same data model.
5. **Multi-tenant by design** — each clinic/organization's data is fully isolated, making it viable to sell to individual practices as well as multi-location groups.
6. **Grows with the practice** — from a solo practitioner to a multi-doctor, multi-role organization with per-user permissions and per-patient access control.

---

## 4. Feature Set, by Marketing Category

### A. Patient Records & Organization
- Full patient record management: name, patient code, date of birth, clinical notes.
- Fast search and filtering across the patient list.
- A unified image gallery with 1/2/4/8-per-row viewing density, filterable by patient or shown "unassigned" for triage.
- Tag-based filtering across both patient images and a separate branding/decorative image library (see below).
- **Sell it as:** "Find any patient's photo history in seconds, not folders."

### B. Capture, Anywhere
- Capture directly via webcam or upload existing files, from desktop or the mobile app.
- Images open straight into the editor after capture — no extra steps to start annotating.
- **Sell it as:** "Snap it chairside, it's organized and ready to edit instantly."

### C. Professional Clinical Image Editor
- Crop, zoom, rotate, freehand draw and erase.
- Directional arrows and circles to highlight anatomical structures for patient education.
- Draggable text labels placed anywhere on the image.
- Eyedropper for annotation color matching.
- **Precision measurement tools:** a calibrated ruler (draw over a known reference, enter its real-world length, and every subsequent measurement on that image is to scale), a resize tool that rescales an image to a known measurement, and an angle tool for clinical angle measurements.
- **Overlay comparison:** lay one patient image semi-transparently over another (with opacity, scale, and position controls) for side-by-side progress comparisons.
- Smoothing for freehand strokes, and select/cut/copy/move tools for image regions.
- "Save as Copy" preserves the original while creating an edited version — nothing is ever destructively lost.
- **Sell it as:** "Real clinical annotation and measurement tools, not just a paint app — explain treatment to patients visually, with accuracy."

### D. Patient-Facing Presentations
- Build slide presentations directly from a patient's images, with per-slide captions and full annotation support.
- Full-screen presentation mode for in-office consultations.
- Presentations can be single-patient case reviews or cross-patient (e.g., a "smile gallery" of past results for new-patient consultations).
- Export any presentation as a shareable **PDF or PowerPoint file** — every slide type (single image, video thumbnail, before/after compare, overlay) renders faithfully outside the app.
- **Sell it as:** "Turn a folder of photos into a persuasive, professional case presentation in minutes — and hand the patient a takeaway."

### E. Branding & Non-Clinical Content Library
- A separate Image Library for reusable non-clinical assets — clinic logo slides, section headers, background images — kept apart from patient data.
- Drop these into any presentation alongside patient images for a polished, on-brand look.
- **Sell it as:** "Every case presentation looks like it came from your brand, not a generic export."

### F. Cephalometric Analysis (a genuine clinical differentiator)
- A full radiographic landmark-tracing and measurement module for lateral cephalograms.
- Ships with the four analysis systems orthodontists actually use — **Steiner, Ricketts, Tweed, and Witts** — plus the ability for a clinic to build entirely custom analysis templates (their own landmarks and measurement formulas).
- Guided workflow: calibrate scale from a known reference → place landmarks → get automated measurements and treatment-relevant values (e.g., Witts Appraisal for Class II/III sagittal jaw relationship) instantly, no manual protractor/ruler work.
- **Sell it as:** "Built-in orthodontic diagnostic analysis — the calculations orthodontists do by hand, done for you in the same platform as your patient photos."

### G. Patient Documents
- Attach any file type to a patient record — Word, Excel, PowerPoint, PDF, images, video, audio.
- Preview most formats directly in the browser (no download/Office install required).
- **Sell it as:** "Consent forms, treatment plans, insurance docs, and photos — one patient file, not five systems."

### H. Print-Ready Layouts
- A layout designer for clinics that still want printed photo boards/handouts — drag-and-drop picture frames, a movable/resizable clinic-branded header, saved per document.
- **Sell it as:** "Print professional patient handouts without opening a separate design tool."

### I. Bulk Import & Migration (a strong "switch to us" argument)
- Bulk-import an entire existing photo archive in one step (ZIP upload or direct server folder import), with automatic patient matching via folder structure or an optional CSV of patient details.
- Full migration tooling to move all data (patients, images, users, settings) between the desktop/on-premise version and the cloud version, with duplicate protection.
- **Sell it as:** "Bring your existing years of patient photos with you — we don't make you start from zero, and you're never locked into one deployment model."

### J. Security & Compliance (major differentiator for healthcare buyers)
- **Role-based permissions** across three tiers — front-desk/general User, Doctor (full clinical management), and Superadministrator (full org administration) — so access matches real clinical hierarchy.
- **Per-patient access restriction**, letting an organization limit specific staff to only the patients they're authorized to see.
- **Full audit logging** of logins, record changes, image access, uploads, exports, and migrations — with IP address, timestamp, and user attribution — filterable for compliance investigations.
- **Automatic session timeout** (idle logout with warning countdown) aligned to HIPAA technical safeguard requirements.
- **Two-factor authentication** (TOTP-based, with backup codes) available per user.
- **Data retention & legal hold controls** — configurable retention windows, an "eligible for deletion" review queue (nothing auto-deletes), and per-patient legal holds to block deletion during litigation/disputes.
- **Accounting of Disclosures reporting** — generate a report of exactly who accessed or exported a given patient's data and when, exportable as JSON/CSV — directly supports a common HIPAA patient-rights request.
- **Multi-tenancy with full data isolation** between organizations.
- **Sell it as:** "Compliance isn't an add-on module — access control, audit trails, retention policy, and disclosure reporting are built into the core product."

### K. Multi-Language
- Full UI in English, Spanish, French, and Portuguese today.
- **Sell it as:** "Ready for multi-lingual staff and international practices out of the box."

### L. Flexible Deployment Model
- **Cloud/Web:** zero-install, always up to date, accessible from any device.
- **Desktop/LAN (Electron):** for clinics that want patient imagery to stay on local infrastructure; includes its own license/activation and trial system, and can migrate to/from the cloud version at any time.
- **Mobile companion app:** capture and review on the go.
- **Sell it as:** "You choose where your data lives — cloud convenience or on-premise control — without giving up any functionality."

---

## 5. Licensing / Plan-Relevant Facts (for the billing platform to model)

The clinical app already has some structure the subscription platform should build pricing tiers around:

- **Per-organization (tenant) licensing** is the natural unit of sale — each clinic/practice is one isolated tenant.
- The **desktop/on-premise version has its own trial (30 days) and machine-locked activation code system** — the new marketing/billing platform should be the system that issues/manages these activation codes and tracks trial-to-paid conversion, if that responsibility is being centralized here.
- Natural upsell axes to consider for plan tiers: number of users/seats, number of patient records or storage volume, access to the Cephalometric Analysis module, custom branding/Image Library limits, audit log retention length, and cloud vs. on-premise deployment.
- Role tiers (User / Doctor / Superadministrator) already exist in-product and map naturally to seat-based pricing discussions.

_Note: Max7 Vista's own codebase does not currently contain billing/subscription logic — that is intentionally the job of this new max7vista.com project. Cross-organization functions like creating tenants, billing, and activating/deactivating organizations are reserved for a system-owner role outside any single clinic's app instance, which is exactly the role this new platform should fill._

---

## 6. Suggested Messaging Angles

- **For practices still using phones + shared drives:** "Stop losing track of before/after photos in camera rolls and shared folders — one system, one patient timeline."
- **For practices worried about compliance:** "Audit logs, access control, retention policy, and disclosure reporting are already built in — not something you configure yourself or bolt on later."
- **For orthodontic-specific buyers:** "Built-in Steiner, Ricketts, Tweed, and Witts cephalometric analysis — skip the manual tracing and hand calculations."
- **For multi-doctor groups:** "Role-based access and per-patient restrictions mean every staff member sees exactly what they should — no more, no less."
- **For practices switching from another system:** "Bulk-import your entire existing photo archive in one step, and migrate between cloud and on-premise anytime without losing data."

---

## 7. What NOT to Promise on the Marketing Site

- Do not describe patient data as being stored or processed by max7vista.com itself — this marketing/billing site is a separate project from the clinical application and its patient data.
- Do not commit to specific pricing numbers, seat counts, or plan names in copy until the plan structure is finalized on this new platform.
- Avoid clinical/diagnostic claims beyond what's listed here (e.g., don't imply AI-driven diagnosis — the Cephalometric module performs calculations from user-placed landmarks, it does not auto-diagnose).
