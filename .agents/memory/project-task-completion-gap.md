---
name: No main-agent path to close arbitrary project tasks
description: Confirmed tooling limitation — main agent cannot mark other PENDING project tasks as done, even when verified complete in code.
---

`mark_task_complete` only closes the single task explicitly bound to the current session. `markTaskInProgress` only works on tasks already in the `IMPLEMENTED` state — calling it on a `PENDING` task fails with "cannot report working from state PENDING".

There is no main-agent-callable function to transition an arbitrary *other* project task (one not bound to this session) out of `PENDING`, even after confirming via code inspection that the feature is fully implemented.

**Why:** Verified via repeated failed calls across multiple sessions/tasks. This is a deliberate boundary in the task-tracking tool surface, not a bug to work around.

**How to apply:** When auditing project tasks against actual code state and finding tasks that are already implemented but still show PENDING/"Active", do not attempt to mark them complete yourself. Tell the user precisely which tasks are confirmed done in code and that they need to manually mark/dismiss them in the task list UI.
