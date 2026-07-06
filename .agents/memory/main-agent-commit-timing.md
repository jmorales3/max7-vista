---
name: Main agent git commits are not continuous
description: Working-tree edits by main agent are not committed until the session/task finalizes; you cannot tag or push mid-session even for non-force operations.
---

Editing files (via the `edit`/`write` tools) leaves them as uncommitted working-tree changes (`git status` shows `M`) for the entire duration of a session — there is no background/periodic auto-commit while you are actively working. A commit only lands when the current task is finalized (e.g. via `mark_task_complete`).

**Why:** confirmed by editing two files and polling `git log`/`git status`/`git reflog` over 20+ seconds with no new commit appearing, while prior commits in reflog were all tagged `commit: <task description>` — i.e. one commit per finalized task, not per edit or per elapsed time.

**How to apply:** if a task requires a git tag or release build that depends on your current edits being committed (e.g. pushing a version tag to trigger a CI release workflow), you cannot do this within the same response/turn as the edits — the commit doesn't exist yet to tag. Either: (a) end the current response and let the automatic "Loop ended" checkpoint commit land, then handle tagging in your next turn, or (b) explicitly tell the user this step is pending until after the commit lands, rather than silently attempting `git tag`/`git push` against stale HEAD.

**Correction (2026-07-06):** in a long-running, non-task-bound main-agent session, commits DO land automatically and fairly promptly — observed as `checkpoint_created ("Loop ended")` automatic_updates after each response, each with its own real commit id. Do NOT call `mark_task_complete` to try to force this commit — in this session shape it errors with `FAILED_PRECONDITION: cannot report done from state MERGED` (that tool is for task-bound sessions, not continuous main-agent ones). Just end the response normally; the checkpoint fires on its own between turns, then tag/push in the next turn once `git log` confirms the new commit is HEAD.
