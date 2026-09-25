# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- **Every new feature must be reflected in five places**: (1) the chatbot system prompt (`artifacts/api-server/src/routes/chat.ts`), (2) the in-app instruction manual (`manual.sections` + `manual.<section>` keys in all four locale files), (3) all four translation files (EN, ES, FR, PT) at `artifacts/patient-images/src/i18n/locales/`, (4) the GitHub build (the project's CI/release build pipeline), and (5) a set of instructions the user will hand off to the "Max7 agent" to carry out the equivalent change on the Max7 side. When wrapping up a feature, proactively remind the user of any of these five that haven't been addressed yet, and draft the Max7 agent instructions when the feature is otherwise complete.

## Deployment & Distribution — READ FIRST BEFORE ANY TROUBLESHOOTING

Each part of the system is delivered a different way. Never assume a code change has reached the user's device without checking which delivery method applies.

| Artifact | How changes reach users | Command / action |
|---|---|---|
| **API server** (`artifacts/api-server`) | Replit Publish | Click Publish in Replit |
| **Web app** (`artifacts/patient-images`) | Replit Publish | Click Publish in Replit |
| **Phone app JS bundle** (`artifacts/patient-images-mobile`) | **Expo OTA update** (expo-updates) | `cd artifacts/patient-images-mobile && npx eas-cli@latest update --channel production --message "..." --non-interactive` |
| **Phone app native shell** | EAS Build + APK install | Full rebuild required — only needed when native modules or app.json change |

**Critical:** Replit Publish does NOT update the phone app's JavaScript. The installed native app (EAS build, `production` channel) fetches bundles from Expo's update servers (`https://u.expo.dev/d925dfed-65f1-4a09-a76a-7bf438eb8f17`). After `eas update`, the user force-closes and reopens the app — Expo downloads the new bundle automatically. The EXPO_TOKEN secret is available; EAS authenticates as `jmorales3`.

## Gotchas

- **Release checklist**: before tagging any new release, ask the agent to run the GitHub sync check first. It compares this workspace's `main` against GitHub's `main` via the API (local `git fetch`/`merge`/ref-writes are blocked in this sandbox) and flags whether it's safe to tag, whether local is just behind (needs catching up before release), or genuinely diverged (needs reconciliation before release). Never tag a release without this check passing clean.
- **Project task merges are a separate approval step from starting the work.** Approving a task only schedules/starts it — once a task agent finishes, it sits in "Ready" state and does NOT merge automatically; merging is a distinct action taken from the tasks UI. Use that as the control point: hold off merging "Ready" tasks while mid-release (between the sync check and pushing the tag), then merge them once the release is out.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
