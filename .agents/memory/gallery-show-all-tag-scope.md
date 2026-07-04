---
name: "Show All" must not mean "every record system-wide"
description: A gallery's default/"clear filter" view silently became a full unfiltered dump once patient counts grew into the thousands; tags exist per-patient, not per-image.
---

In this app, tags are assigned to *patients* (`patient_tags` table), not to
individual images — an image's "tags" are really its owning patient's tags.
The Gallery's tag filter bar had a "Show All" chip that simply cleared the
tag-id filter, which made the backend return every image for every patient
in the tenant with no restriction at all.

**Why:** This looked fine with a handful of demo patients, but is
impractical the moment a tenant has thousands of images — "Show All" is not
a useful default when it means "download and render everything." The
"clear the filter" affordance and the "narrow the results to something
browsable" affordance are different requirements masquerading as the same
UI control.

**How to apply:** When a filter bar has a chip/button meant to reset to a
sane default (not literally "all data ever"), give the backend an explicit
param for that default (here: `onlyTagged=true` on `GET /images`, which
restricts to patients carrying at least one tag and sorts by tag name)
rather than overloading "no filter present" to mean "unbounded query." Audit
other list endpoints in this codebase for the same pattern before assuming
"clear filters" is safe to leave unbounded.
