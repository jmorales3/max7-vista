import { Router, type IRouter } from "express";
import fs from "fs";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { getStorageDirectory, getSetting, setSetting } from "../lib/storage";
import { scanDirectory } from "../lib/scanDirectory";

const router: IRouter = Router();

router.get("/settings", async (_req, res): Promise<void> => {
  const storageDirectory = await getStorageDirectory();
  const lastScanAt = await getSetting("lastScanAt");

  res.json({
    storageDirectory,
    lastScanAt: lastScanAt ?? null,
  });
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.storageDirectory) {
    await setSetting("storageDirectory", parsed.data.storageDirectory);
    if (!fs.existsSync(parsed.data.storageDirectory)) {
      fs.mkdirSync(parsed.data.storageDirectory, { recursive: true });
    }
  }

  const storageDirectory = await getStorageDirectory();
  const lastScanAt = await getSetting("lastScanAt");

  res.json({
    storageDirectory,
    lastScanAt: lastScanAt ?? null,
  });
});

router.post("/settings/scan-directory", async (_req, res): Promise<void> => {
  const storageDir = await getStorageDirectory();
  const result = await scanDirectory(storageDir);
  res.json(result);
});

export default router;
