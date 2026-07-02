import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { createRequire } from "node:module";

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

export default router;
