---
name: Main agent git commits are not continuous
description: Working-tree edits by main agent are not committed until the session/task finalizes; you cannot tag or push mid-session even for non-force operations.
---

Editing files (via the `edit`/`write` tools) leaves them as uncommitted working-tree changes (`git status` shows `M`) for the entire duration of a session — there is no background/periodic auto-commit while you are actively working. A commit only lands when the current task is finalized (e.g. via `mark_task_complete`).

**Why:** confirmed by editing two files and polling `git log`/`git status`/`git reflog` over 20+ seconds with no new commit appearing, while prior commits in reflog were all tagged `commit: <task description>` — i.e. one commit per finalized task, not per edit or per elapsed time.

**How to apply:** if a task requires a git tag or release build that depends on your current edits being committed (e.g. pushing a version tag to trigger a CI release workflow), you cannot do this within the same session as the edits — the commit doesn't exist yet to tag. Either: (a) finish and let the task complete/commit first, then handle tagging in a subsequent turn/task, or (b) explicitly tell the user this step is pending until after the commit lands, rather than silently attempting `git tag`/`git push` against stale HEAD.
