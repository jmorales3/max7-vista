import { db, auditLogTable } from "@workspace/db";
import type { Request } from "express";

export interface AuditOpts {
  patientId?: number | null;
  resourceId?: string | null;
}

export function logAudit(
  req: Request,
  action: string,
  entityType: string = "system",
  entityId?: number | null,
  details?: string,
  opts?: AuditOpts,
): void {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    null;
  const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;
  db.insert(auditLogTable).values({
    tenantId: (req.session as any)?.tenantId ?? null,
    userId: (req.session as any)?.userId ?? null,
    username: (req.session as any)?.username ?? null,
    patientId: opts?.patientId ?? null,
    action,
    entityType,
    entityId: entityId ?? null,
    resourceId: opts?.resourceId ?? null,
    details: details ?? null,
    ipAddress: ip,
    userAgent,
  }).catch((err) => {
    console.error("[audit] log failed:", err);
  });
}
