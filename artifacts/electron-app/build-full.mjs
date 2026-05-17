/**
 * Full Electron production build pipeline.
 *
 * Steps:
 *  1. Build the React/Vite frontend  → artifacts/patient-images/dist/
 *  2. Build the Express API server   → artifacts/api-server/dist/
 *  3. Compile the Electron main process → artifacts/electron-app/dist/
 *
 * electron-builder's extraResources then copies:
 *  - api-server dist → resources/api-server/
 *  - frontend dist   → resources/api-server/dist-frontend/
 *    (which is where app.ts looks for static files in production)
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function run(cmd, cwd = root) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

// 1. Frontend
run("pnpm --filter @workspace/patient-images run build");

// 2. API server
run("pnpm --filter @workspace/api-server run build");

// 3. Electron main process
run("tsc -p tsconfig.json", __dirname);

console.log("\n✅ Full build complete — ready for electron-builder packaging.");
