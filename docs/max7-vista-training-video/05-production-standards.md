# 05 — Production, Accessibility, and Naming Standards

## What can be automated

| Work | Approved approach | Limitation |
|---|---|---|
| Concept cards / diagrams | Code-based animated video is suitable for short, auto-playing concept explanations under about two minutes. | It must not imitate an unverified control or live application workflow. |
| Title/end cards, lower thirds, callouts | Generate from a reusable branded template after product review. | Use high contrast and leave enough time to read. |
| Screen procedures | Record the real app with a screen-recording tool and controlled fixture. | A generic video model cannot reliably execute verified live clicks by itself. |
| Captions / transcript draft | Generate from approved narration, then human-review timestamps, product terms, and every number. | Never auto-publish unreviewed captions. |
| Final edit / voice quality | Use production tooling or approved voice pipeline. | The code-based workflow is not a timeline editor or a substitute for professional capture/voice review. |

## Framing and callouts

- Web/Electron master: 16:9 at 1920×1080 or higher. Keep key controls inside a 10% safe margin.
- Mobile master: 9:16 at 1080×1920 or native device capture. Show only the real mobile application; do not letterbox web captures into a phone.
- Cursor: use a 36–48 px halo, click pulse, and an optional 1.5× zoom for dense editor controls. Do not move the cursor before narration identifies the target.
- Callout: one active focus box at a time. Prefer the control’s real label. Avoid arrows that cover data or UI state.
- Pace: pause after state changes and before confirmation; use cuts instead of speeding through typing or exports.
- Warnings: use icon + label + spoken explanation, never red alone.

## Voiceover, captions, and accessibility

- Narration must say the control name, action, and expected result. Example: “Select **Save as Copy**; a second image appears in Gallery.”
- Supply both a proofread plain-text transcript and timed WebVTT or SRT captions. Captions must include meaningful UI feedback, warnings, and error text.
- Spell out initials once when clinical context requires it; preserve units such as `mm`.
- Do not use “click here,” “the red button,” or position-only language without naming the item.
- Do not rely on audio to communicate patient identity, role restriction, selection state, calibration, or a warning.
- Provide alt text / descriptive notes for title cards and conceptual diagrams in the delivery manifest.

## Audio and export targets

- Record clean mono narration at 48 kHz; target integrated loudness appropriate for the chosen distribution channel (document the applied value).
- Keep background music optional and at least 20 dB beneath narration; omit it from procedural sections when it reduces clarity.
- Deliver: high-bitrate master, distribution MP4/H.264, captions, transcript, thumbnail, and editable project/source where licensing allows.
- Review every export at 100% scale and at a small embedded-player scale.

## Naming convention

Use:

```text
max7-vista_[lesson-id]_[short-slug]_[platform]_[build]_[yyyy-mm-dd]_[asset-type].[ext]
```

Examples:

```text
max7-vista_MV-05_mobile-capture-assignment_ios_1.0.0_2026-08-24_master.mp4
max7-vista_MV-06_gallery-essentials_web_build-123_2026-08-24_en.vtt
max7-vista_MV-12_bulk-import-electron_windows_build-123_2026-08-24_manifest.json
```

Allowed asset types: `recording`, `master`, `distribution`, `captions`, `transcript`, `thumbnail`, `manifest`, `evidence`, `project`.

## Final package QA

- [ ] Lesson matches one approved script and capture manifest.
- [ ] Platform, role, build, and starting state are visible in the manifest.
- [ ] Every button, menu, role statement, timeout, output, and warning matches the captured build.
- [ ] No real patient data, credentials, QR/2FA secret, recovery code, token, private URL, machine ID, real path, or IP is visible/audible.
- [ ] Cursor, focus box, narration, captions, and expected result agree.
- [ ] Text is legible at normal and small playback sizes.
- [ ] Audio is intelligible, captions align, and transcript is proofread.
- [ ] Clinical concepts have qualified product/clinical review and disclaimers where required.
- [ ] The end card includes lesson title and captured build/version.