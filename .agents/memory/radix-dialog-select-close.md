---
name: Radix Dialog+Select close via click can hang
description: A Dialog containing a Select sometimes won't dismiss via a clicked Cancel/Close button in automated tests; Escape works.
---

When a Radix `Dialog` contains a `Select` (e.g. an "Add to Presentation" modal with dropdowns), a Playwright-driven click on the Dialog's Cancel/Close button can time out/appear unresponsive right after interacting with the Select, even though the feature works fine for a real user clicking through slowly.

**Why:** Likely leftover pointer-events/overlay state from the nested Select portal closing doesn't always sync in time for a fast synthetic click on the Dialog's own close controls.

**How to apply:** When an e2e test plan needs to close a Dialog that contains a Select right after using that Select, prefer closing via the Escape key rather than clicking Cancel/Close, or split the test into a separate step/run. Don't treat this alone as evidence of a real product bug — verify manually/with Escape before concluding the dialog is broken.
