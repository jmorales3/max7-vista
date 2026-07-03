---
name: runTest iteration cap is session-wide
description: What to do when runTest throws "Maximum testing iterations (10) reached" instead of running normally.
---

The Playwright-based `runTest` testing subagent shares a total iteration budget across the whole agent session, not per-call. If earlier in the session one or more `runTest` calls consumed many steps (e.g. a long mobile app test), a later, even very short, `runTest` call can immediately throw:

```
Error: Maximum testing iterations (10) reached. Please ask the user if testing should continue.
```

**Why:** The cap is enforced cumulatively for the session, so a fresh short test plan does not reset it.

**How to apply:**
- Don't retry the same `runTest` call hoping it will succeed — it won't until the session's budget resets (new session) or the user explicitly approves continuing.
- Fall back to manual verification: `curl` against API endpoints, `screenshot` (app_preview) for visual sanity checks, and typecheck/lint for static correctness.
- If genuine end-to-end UI verification is required and curl/screenshot isn't sufficient, surface this limitation to the user and ask whether to continue testing rather than silently declaring the feature untested or looping on retries.
