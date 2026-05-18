import { db, auditLogTable } from "@workspace/db";
import type { Request } from "express";

export async function logAudit(
  req: Request,
  action: string,
  entityType: string,
  entityId: number | null,
  details?: string
): Promise<void> {
  const userId = req.session?.userId ?? null;
  const username = req.session?.username ?? null;
  await db.insert(auditLogTable).values({
    userId,
    username,
    action,
    entityType,
    entityId,
    details: details ?? null,
  });
}
