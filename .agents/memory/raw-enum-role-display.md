---
name: Raw enum/role values slip through untranslated UI display
description: When relabeling role/status enum values in a locale file, grep for every raw `{value}` render site, not just the ones near primary nav/settings gating logic.
---

When a role or status enum gets a new display label (e.g. `admin` role relabeled "Doctor" in a permission-matrix redesign), some UI locations render the raw enum value directly (e.g. `{user.role}` with just a `capitalize` CSS class) instead of looking it up through the translation/label map used elsewhere (e.g. `t("admin.roleAdmin")` / `roleLabels[user.role]`).

**Why:** These raw-render sites are easy to miss because they're small, incidental UI (e.g. a sidebar footer identity badge) far from the main gating/settings code that gets the bulk of review attention. An e2e UI test caught this — a plain code review of the gating logic did not.

**How to apply:** After renaming/relabeling an enum's display text, grep the whole frontend for the raw field access pattern (e.g. `user.role`, `.status}`) in addition to the translation-key call sites, and fix every render site to go through the shared label/translation lookup. Don't rely solely on grepping for the translation key — also grep for the raw field itself.
