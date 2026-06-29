---
name: Stale .d.ts rebuild pattern for workspace packages
description: When a workspace package's source exports change, its dist/ .d.ts files must be rebuilt or downstream TS checks see stale types
---

Packages with `composite: true` and `emitDeclarationOnly: true` in tsconfig generate `.d.ts` files into `dist/`. TypeScript project references use these `.d.ts` files, NOT the source `.ts` files.

If you add a new export to a package's `src/index.ts` but don't rebuild, downstream packages get "has no exported member" errors even though the source clearly exports it.

**Why:** TS project references follow the compiled output path, not the source path.

**How to apply:** After changing exports in any `lib/` package (api-client-react, api-zod, db, etc.), run:
```
cd lib/<package> && pnpm exec tsc --noEmit false --emitDeclarationOnly --outDir dist
```
Affected packages in this project: `@workspace/api-client-react`, `@workspace/api-zod`, `@workspace/db`.
