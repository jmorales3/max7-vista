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
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function run(cmd, cwd = root, extraEnv = {}) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...extraEnv } });
}

// 1. Frontend — PORT is required by vite.config.ts (dev-server config);
//    during a production build it is only validated, never used for listening.
//    BASE_PATH is "/" for the Electron desktop shell (served at root by Express).
run("pnpm --filter @workspace/patient-images run build", root, {
  PORT: "8080",
  BASE_PATH: "/",
  NODE_ENV: "production",
});

// 2. API server — ELECTRON_BUILD=true enables the @workspace/db → SQLite alias
run("pnpm --filter @workspace/api-server run build", root, {
  ELECTRON_BUILD: "true",
});

// 3. Electron main process
run("tsc -p tsconfig.json", __dirname);

// 4. Copy static assets that TypeScript doesn't include
fs.copyFileSync(
  path.join(__dirname, "src", "splash.html"),
  path.join(__dirname, "dist", "splash.html"),
);
console.log("▶ Copied splash.html → dist/splash.html");

console.log("\n✅ Full build complete — ready for electron-builder packaging.");
