---
name: Workflow restart method
description: How to correctly restart workflows without triggering Replit checkpoint/SIGTERM cycles
---

Use `restartWorkflow()` via the `code_execution` sandbox tool — NOT the `restart_workflow` tool.

**Why:** The `restart_workflow` tool triggers a screenshot which causes a Replit checkpoint + SIGTERM cycle, killing live servers unexpectedly.

**How to apply:** Any time you need to restart the API server or web dev server during a session, call `restartWorkflow({ name: "..." })` inside a `code_execution` block.
