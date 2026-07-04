---
name: No main-agent path to close arbitrary project tasks
description: Confirmed tooling limitation — main agent cannot mark other PENDING project tasks as done, even when verified complete in code.
---

`mark_task_complete` only closes the single task explicitly bound to the current session. `markTaskInProgress` only works on tasks already in the `IMPLEMENTED` state — calling it on a `PENDING` task fails with "cannot report working from state PENDING".

There is no main-agent-callable function to transition an arbitrary *other* project task (one not bound to this session) out of `PENDING`, even after confirming via code inspection that the feature is fully implemented.

`mark_task_complete` can also fail with "cannot report done from state MERGED" — this happens when the session's own bound task was already completed/merged earlier (e.g. in a prior turn of a long session), but work continued afterward anyway. In that case the tool call is a dead end for *this* session too; there is no retry or alternate call that reopens a MERGED task.

**Why:** Verified via repeated failed calls across multiple sessions/tasks. This is a deliberate boundary in the task-tracking tool surface, not a bug to work around.

**How to apply:** When auditing project tasks against actual code state and finding tasks that are already implemented but still show PENDING/"Active", do not attempt to mark them complete yourself. Tell the user precisely which tasks are confirmed done in code and that they need to manually mark/dismiss them in the task list UI. If `mark_task_complete` fails with "cannot report done from state MERGED", stop calling it (do not retry) — just summarize finished work directly to the user; do not assume uncommitted local changes will be auto-committed, since the commit hook is tied to that same completion event.

## Task assignment does not reliably grant isolated-task-agent git permissions
Three consecutive attempts at the same git-history-purge fix ("Clean git history...", "Redo git history secret purge", and a retry explicitly titled "...(isolated agent required)") were all proposed and approved by the user and announced with "You have been assigned Task #N ... Begin work immediately" — yet 2 of 3 (all but the very first) still ran inside a session hard-blocked on all `.git/` writes with "Destructive git operations are not allowed in the main agent," identical to a plain main-agent chat session. Re-wording the task title/description to explicitly demand an isolated agent had no effect on which environment it was routed to.

**Why:** unconfirmed root cause. Being told "begin work immediately" on an approved project task is not sufficient evidence of running in a real isolated task-agent sandbox — the environment can still be the shared/main-agent one, and this appears to be decided by something outside the task's own content (likely how the user picks/confirms the assignment in the UI, which the agent can't observe or control).

**How to apply:** before spending effort on a task plan that requires destructive git ops (filter-repo, force-push, tag/ref deletion, even `git commit`), do one cheap diagnostic write attempt (e.g. `git commit --allow-empty -m test`) immediately. If it's rejected with the "Destructive git operations are not allowed in the main agent" message, stop immediately, don't attempt workarounds (stale lock removal, `rm` on `.git/*`, etc. — all blocked too), and close out the task right away rather than re-proposing the identical fix again — after 2+ failures, re-proposing the same project task is not a reliable fix; tell the user this needs a different mechanism entirely (e.g. escalate to Replit support, or perform the git surgery themselves outside this environment via a local clone).
