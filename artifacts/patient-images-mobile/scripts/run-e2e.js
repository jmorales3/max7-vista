#!/usr/bin/env node
/**
 * run-e2e.js — wrapper that sets LD_LIBRARY_PATH to the Nix store paths that
 * Chrome headless shell needs on this NixOS-based environment, then runs
 * `playwright test`.
 *
 * Why this is necessary:
 *   Playwright downloads a pre-compiled Chrome headless shell binary.  On
 *   NixOS, system libraries live in /nix/store rather than /lib or /usr/lib,
 *   so the binary cannot find them via the default dynamic-linker search path.
 *   Setting LD_LIBRARY_PATH to the correct Nix store dirs fixes this.
 *
 * Pre-requisites:
 *   1. The Expo Metro dev server must be running on port 8081:
 *        pnpm --filter @workspace/patient-images-mobile run dev
 *   2. The API server must be running on port 8080:
 *        pnpm --filter @workspace/api-server run dev
 *   3. Pre-warm the Metro bundle (first compile takes ~30-60 s) by curling the
 *      bundle URL shown in the Metro terminal output after startup.
 *
 * The LD_LIBRARY_PATH was assembled by:
 *   1. Running `ldd <chrome-headless-shell>` to list missing libraries.
 *   2. Using `nix-instantiate --eval -E 'with import <nixpkgs> {}; "${<pkg>}/lib"'`
 *      to locate each package's lib directory in the Nix store.
 *   3. Verifying with `ldd ... | grep "not found"` until the list was empty.
 */

const { execFileSync } = require("child_process");
const path = require("path");

// Nix store library directories for Chrome headless shell dependencies.
// These were resolved against nixpkgs 25.05 (the NixOS version in use).
const NIX_LIB_PATHS = [
  "/nix/store/y3nxdc2x8hwivppzgx5hkrhacsh87l21-glib-2.84.3/lib",
  "/nix/store/gpb87pb8s826aggy1s3f352alp40dkj8-nspr-4.36/lib",           // 64-bit; the 32-bit variant in the same Nix store must be avoided
  "/nix/store/2jsrwgic869zynqljiqa4g7dqzpwm2yd-nss-3.101.2/lib",
  "/nix/store/231d6mmkylzr80pf30dbywa9x9aryjgy-dbus-1.14.10-lib/lib",
  "/nix/store/sisfq9wihyqqjzmrpik9b4xksifw97ha-libxkbcommon-1.8.1/lib",
  "/nix/store/1nsvsrqp5zm96r9p3rrq3yhlyw8jiy91-libX11-1.8.12/lib",
  "/nix/store/2y2hhlki6macaj9j1409q1j6i33l6igf-libxcb-1.17.0/lib",
  "/nix/store/qrij2csr7p6jsfa40d7h4ckzqg4wd5w2-at-spi2-core-2.56.2/lib", // provides libatk-1.0 + libatk-bridge-2.0 + libatspi
  "/nix/store/yw5xqn8lqinrifm9ij80nrmf0i6fdcbx-alsa-lib-1.2.13/lib",
  "/nix/store/wilz94hzz4q3fss6qvv625zvww4a6s4s-mesa-libgbm-25.0.1/lib",  // libgbm (separate from mesa drivers)
  "/nix/store/cpwib3zazj49fm0y04y53w4xkbqsgrgm-mesa-25.0.7/lib",
  "/nix/store/4phl6z95v2i4525y0zpmi9v6ac0n4bx7-libXcomposite-0.4.6/lib",
  "/nix/store/h8143a07cf1vw41s49h0zahnq13zim94-libXdamage-1.1.6/lib",
  "/nix/store/0046rn5sgi6l38zl81bg2r02zlzxqqbc-libXext-1.3.6/lib",
  "/nix/store/94grp8dx897wmf0x3azpdbgzj3krz7v5-libXfixes-6.0.1/lib",
  "/nix/store/5fcbi2lycw2hz7rbn3nl5nrhhk2ki8dd-libXrandr-1.5.4/lib",
  "/nix/store/xpszkfp1gaf8jfmcsll93xg0pb4c0rk7-libdrm-2.4.124/lib",
];

const env = {
  ...process.env,
  LD_LIBRARY_PATH: [
    ...NIX_LIB_PATHS,
    ...(process.env.LD_LIBRARY_PATH ? [process.env.LD_LIBRARY_PATH] : []),
  ].join(":"),
};

const playwrightBin = path.join(
  __dirname,
  "..",
  "node_modules",
  ".bin",
  "playwright"
);

try {
  execFileSync(playwrightBin, ["test", ...process.argv.slice(2)], {
    stdio: "inherit",
    env,
    cwd: path.join(__dirname, ".."),
  });
} catch (err) {
  process.exit(err.status ?? 1);
}
