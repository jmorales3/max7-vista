# 06 — Change Control, Validation, and Handoff

## When a lesson becomes stale

Mark a video **Review Required** immediately when any of the following changes:

- route, sidebar label, screen title, control label, or control placement;
- role terminology, permission, tenant access rule, access-denied behavior, or session timing;
- image capture, patient assignment, gallery filter/selection/export, editor tool, calibration, overlay, save/copy behavior;
- template, document, import, migration, storage, audit, retention, legal-hold, disclosure, integrity, license, or update behavior;
- mobile capture/review/assignment/move flow, permission prompt, server configuration, or OTA delivery behavior;
- visual design change that makes a callout ambiguous;
- application version/build released to the target audience.

**Scope rule:** review the directly affected lesson first, then every lesson that references the same control, role, platform, or prerequisite. Do not silently leave an old video alongside a changed product workflow.

## Review statuses

| Status | Meaning | Viewer treatment |
|---|---|---|
| Draft | Script/capture exists but is not reviewed. | Never publish. |
| Verified | Recorded against current build; QA and subject review complete. | Publishable. |
| Review Required | A change trigger or unresolved reconciliation item exists. | Remove from default learning path or show a clear outdated notice. |
| Retired | Workflow removed or replaced. | Archive internally; redirect viewers to replacement. |

## Release validation workflow

1. Compare product release notes/diff with the evidence matrix.
2. Identify affected lessons and set their status to Review Required.
3. Re-run the relevant capture manifest using synthetic fixtures and the intended role/platform.
4. Compare the capture frame-by-frame to the approved script; revise words, callouts, captions, and transcript together.
5. Obtain product-owner approval for behavior; obtain clinical/compliance approval for clinical or regulated claims.
6. Export a new version, complete production QA, retain the prior manifest/evidence, and update the lesson register.

## Production-agent handoff checklist

- [ ] Read all six package documents and the reconciliation register.
- [ ] Confirm first batch and audience channels (internal help center, LMS, social, etc.).
- [ ] Select exact final aspect ratio(s) before generating motion assets.
- [ ] Provision isolated synthetic tenant and all fixture kit items.
- [ ] Obtain allowed voice, visual-brand, and screen-recording tools.
- [ ] Capture proof for role permissions, timeout duration, deletion semantics, export, migration, and platform-only claims.
- [ ] Escalate R-01 through R-07 before publishing a conflicting narration.
- [ ] Submit every lesson with manifest, transcript/captions, evidence stills, and completed QA.

## Acceptance criteria for this documentation package

- Every learner-facing product claim has a cited source location or a clear verification requirement.
- The curriculum covers beginner, clinical, administrative/compliance, desktop/LAN, mobile, and troubleshooting tracks.
- Each planned lesson has a time-coded voiceover, real-screen/animation designation, cursor/click/typing direction where relevant, expected result, recovery path, accessibility wording, and review rule.
- Capture manifests require platform, role, route/state, synthetic data, build version, and expected result.
- Production guidance explicitly separates what can be automated from what requires real capture and production tools.
- Privacy, synthetic-data, transcript/caption, naming, QA, and version-staleness requirements are actionable.