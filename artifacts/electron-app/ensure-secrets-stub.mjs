/**
 * Ensures src/secrets.generated.ts exists before a plain `build`/`dev` run.
 *
 * The real file (with the production LICENSE_HMAC_SECRET baked in) is only
 * ever written by build-full.mjs, right before packaging, and is gitignored
 * so the real secret is never committed. Without this stub, `tsc` fails on
 * every ordinary `pnpm build`/`pnpm dev` because the import target is
 * missing from a fresh checkout.
 *
 * This script only writes the file if it does NOT already exist, so it
 * never clobbers a real secret written by build-full.mjs.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetPath = path.join(__dirname, "src", "secrets.generated.ts");

if (!fs.existsSync(targetPath)) {
  const stub = `// AUTO-GENERATED stub by ensure-secrets-stub.mjs — DO NOT EDIT or COMMIT
// This file is excluded from version control via .gitignore. It is a
// placeholder for local dev/build only; build-full.mjs overwrites it with
// the real LICENSE_HMAC_SECRET before packaging a release.
export const LICENSE_HMAC_SECRET = "max7-dev-fallback-secret-CHANGEME";
`;
  fs.writeFileSync(targetPath, stub, "utf-8");
  console.log("▶ Generated dev stub src/secrets.generated.ts (not for production builds)");
}
