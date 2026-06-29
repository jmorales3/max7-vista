---
name: Drizzle-kit push in non-TTY shells
description: drizzle-kit push hangs or errors when it needs interactive confirmation and there is no TTY
---

When `drizzle-kit push` detects schema conflicts (new tables vs existing DB state), it prompts interactively. In the Replit agent bash shell, there is no TTY so it throws "Interactive prompts require a TTY terminal."

**Why:** drizzle-kit push uses ink/prompts which require stdin to be a TTY.

**How to apply:** For new table creation, bypass drizzle-kit entirely and use `executeSql({ sqlQuery: 'CREATE TABLE IF NOT EXISTS ...' })` in the code_execution sandbox. This always works and is idempotent. Reserve drizzle-kit push for local dev where TTY is available.
