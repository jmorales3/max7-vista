import { db, auditLogTable } from "@workspace/db";
import type { Request } from "express";

export async function logAudit(
  req: Request,
  action: string,
  entityType: string = "system",
  entityId?: number | null,
  details?: string,
): Promise<void> {
  try {
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket?.remoteAddress ??
      null;
    await db.insert(auditLogTable).values({
      tenantId: (req.session as any)?.tenantId ?? null,
      userId: (req.session as any)?.userId ?? null,
      username: (req.session as any)?.username ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      details: details ?? null,
      ipAddress: ip,
    });
  } catch (err) {
    console.error("[audit] log failed:", err);
  }
}
