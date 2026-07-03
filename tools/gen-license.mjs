#!/usr/bin/env node
/**
 * Max7 Vista — License Code Generator
 *
 * Usage:
 *   node tools/gen-license.mjs \
 *     --machineId <machineId> \
 *     --plan 6mo|1yr|lifetime \
 *     --secret <hmacSecret> \
 *     [--exp 2026-12-31]
 *
 * The machine ID is shown in the desktop app under Settings > License.
 * --secret must match the LICENSE_HMAC_SECRET baked into the build.
 */

import crypto from "crypto";
import { parseArgs } from "util";

let parsed;
try {
  parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      machineId: { type: "string" },
      plan:      { type: "string" },
      secret:    { type: "string" },
      exp:       { type: "string" },
      help:      { type: "boolean", short: "h" },
    },
  });
} catch (e) {
  console.error("Argument error:", e.message);
  process.exit(1);
}

const { values } = parsed;

if (values.help || !values.machineId || !values.plan || !values.secret) {
  console.log(`
Usage: node tools/gen-license.mjs --machineId <machineId> --plan <plan> --secret <hmacSecret> [--exp YYYY-MM-DD]

Options:
  --machineId <id>     32-char hex machine ID shown in Settings > License
  --plan      <plan>   One of: 6mo, 1yr, lifetime
  --secret    <key>    LICENSE_HMAC_SECRET matching the target build
  --exp       <date>   Override expiry date (ISO format). Auto-calculated if omitted.
  -h, --help           Show this message
`);
  process.exit(values.help ? 0 : 1);
}

const SECRET = values.secret;

const validPlans = ["6mo", "1yr", "lifetime"];
if (!validPlans.includes(values.plan)) {
  console.error(`Invalid plan "${values.plan}". Choose from: ${validPlans.join(", ")}`);
  process.exit(1);
}

if (!/^[0-9a-f]{32}$/.test(values.machineId)) {
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
    const months = values.plan === "1yr" ? 12 : 6;
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    exp = d.toISOString();
  }
}

const payload = { mid: values.machineId, plan: values.plan, exp };
const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = crypto.createHmac("sha256", SECRET).update(b64).digest("hex");
const code = `MAX7-${b64}.${sig}`;

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(" Max7 Vista — License Code");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(` Machine ID : ${values.machineId}`);
console.log(` Plan       : ${values.plan}`);
console.log(` Expires    : ${exp ?? "Never (Lifetime)"}`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
console.log(code);
console.log("\n");
