---
name: GitHub Git Data API commit message needs trailing newline for SHA parity
description: Replaying/recreating git commits via GitHub's REST Git Data API (create blob/tree/commit) to reproduce byte-identical SHAs to local objects
---

When recreating a local commit object via GitHub's `POST /git/commits` API (same tree, parent, author, committer) to get an identical SHA1 to the original local commit, the `message` field must end with a trailing `\n`.

**Why:** Git's raw commit object format always stores the message with a trailing newline, even if the message string itself doesn't end in one — it's appended by git core, not part of the message content proper. If you extract a commit's message via `git cat-file -p <sha>` and strip trailing newlines (e.g. for parsing/display), then pass that trimmed string straight to the GitHub API without re-adding `\n`, GitHub creates a commit object with different raw bytes -> different SHA1 -> your replayed history silently diverges from the original despite every other field (tree, parent, author/committer identity+timestamp) matching exactly.

**How to apply:** When reconstructing git history object-by-object through a REST API (e.g. to merge diverged histories without local `.git` write access), always append `"\n"` to any message extracted this way before sending it to the API. Verify by comparing the returned commit `sha` against the expected local SHA after each call — a mismatch on an otherwise-identical commit is very likely this issue. This technique (recreating blobs/trees/commits via the API with `base_tree` for incremental trees) is otherwise a valid way to push git objects when direct `git push`/`fetch`/ref writes are blocked in the environment.
