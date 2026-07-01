#!/usr/bin/env node
/**
 * Max7 Vista — License Code Generator
 *
 * Usage:
 *   LICENSE_HMAC_SECRET=<secret> node tools/gen-license.mjs \
 *     --mid <machineId> \
 *     --plan 1yr|2yr|lifetime \
 *     [--exp 2026-12-31]
 *
 * The machine ID is shown in the desktop app under Settings > License.
 * LICENSE_HMAC_SECRET must match the secret baked into the build.
 */

import crypto from "crypto";
import { parseArgs } from "util";

const SECRET = process.env["LICENSE_HMAC_SECRET"];
if (!SECRET) {
  console.error("ERROR: LICENSE_HMAC_SECRET env var is required.");
  console.error("  Example: LICENSE_HMAC_SECRET=my-secret node tools/gen-license.mjs --mid abc123 --plan 1yr");
  process.exit(1);
}

let parsed;
try {
  parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      mid:  { type: "string" },
      plan: { type: "string" },
      exp:  { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (e) {
  console.error("Argument error:", e.message);
  process.exit(1);
}

const { values } = parsed;

if (values.help || !values.mid || !values.plan) {
  console.log(`
Usage: node tools/gen-license.mjs --mid <machineId> --plan <plan> [--exp YYYY-MM-DD]

Options:
  --mid   <id>     32-char hex machine ID shown in Settings > License
  --plan  <plan>   One of: 1yr, 2yr, lifetime
  --exp   <date>   Override expiry date (ISO format). Auto-calculated if omitted.
  -h, --help       Show this message
`);
  process.exit(values.help ? 0 : 1);
}

const validPlans = ["1yr", "2yr", "lifetime"];
if (!validPlans.includes(values.plan)) {
  console.error(`Invalid plan "${values.plan}". Choose from: ${validPlans.join(", ")}`);
  process.exit(1);
}

if (!/^[0-9a-f]{32}$/.test(values.mid)) {
  console.error(`Invalid machine ID format. Expected 32 lowercase hex characters.`);
  process.exit(1);
}

let exp = null;
if (values.plan !== "lifetime") {
  if (values.exp) {
    const d = new Date(values.exp);
    if (isNaN(d.getTime())) {
      console.error(`Invalid --exp date: "${values.exp}". Use ISO format, e.g. 2026-12-31.`);
      process.exit(1);
    }
    exp = d.toISOString();
  } else {
    const months = values.plan === "1yr" ? 12 : 24;
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    exp = d.toISOString();
  }
}

const payload = { mid: values.mid, plan: values.plan, exp };
const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = crypto.createHmac("sha256", SECRET).update(b64).digest("hex");
const code = `MAX7-${b64}.${sig}`;

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(" Max7 Vista — License Code");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(` Machine ID : ${values.mid}`);
console.log(` Plan       : ${values.plan}`);
console.log(` Expires    : ${exp ?? "Never (Lifetime)"}`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
console.log(code);
console.log("\n");
