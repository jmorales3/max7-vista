import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { createRequire } from "node:module";
import os from "os";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../package.json") as { version: string };

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/api/version", (_req, res) => {
  const version = process.env.APP_VERSION?.trim() || pkg.version;
  res.json({ version });
});

// Public, unauthenticated: lets staff see this clinic server's LAN address
// (and the phone/tablet app read it) without anyone having to type or
// remember an IP. Only exposes local network info, nothing sensitive.
router.get("/server-info", (req, res) => {
  const isHttps = req.secure || req.protocol === "https";
  const scheme = isHttps ? "https" : "http";
  const port =
    process.env.PORT?.trim() ||
    (req.socket as { localPort?: number }).localPort?.toString() ||
    "8080";

  const nets = os.networkInterfaces();
  const addresses: string[] = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(`${scheme}://${iface.address}:${port}`);
      }
    }
  }

  res.json({
    hostname: os.hostname(),
    addresses,
    primaryAddress: addresses[0] ?? null,
  });
});

export default router;
