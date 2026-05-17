import path from "path";
import fs from "fs";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_STORAGE_DIR =
  process.env["STORAGE_DIRECTORY"] ?? path.join(process.cwd(), "uploads");

export async function getStorageDirectory(): Promise<string> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "storageDirectory"));

  const dir = row?.value ?? DEFAULT_STORAGE_DIR;

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}
