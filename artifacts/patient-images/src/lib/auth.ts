import { getApiUrl } from "./apiUrl";

export type Role = "user" | "admin" | "superadmin";

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
  tenantId?: number;
  forcePasswordChange?: boolean;
  idleTimeoutMinutes?: number;
}

export class PendingApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PendingApprovalError";
  }
}

export class MfaRequiredError extends Error {
  constructor() {
    super("Two-factor verification code required");
    this.name = "MfaRequiredError";
  }
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch(getApiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({})) as { error?: string; code?: string; mfaRequired?: boolean };
  if (!res.ok) {
    if (body.code === "PENDING_APPROVAL") {
      throw new PendingApprovalError(body.error || "Account pending approval");
    }
    throw new Error(body.error || "Login failed");
  }
  if (body.mfaRequired) {
    throw new MfaRequiredError();
  }
  return body as AuthUser;
}

export async function verifyMfaLogin(token: string): Promise<AuthUser> {
  const res = await fetch(getApiUrl("/api/auth/mfa/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Verification failed");
  }
  return res.json() as Promise<AuthUser>;
}

export interface MfaSetupInfo {
  secret: string;
  qrCodeDataUrl: string;
}

export async function startMfaSetup(): Promise<MfaSetupInfo> {
  const res = await fetch(getApiUrl("/api/auth/mfa/setup"), {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Failed to start MFA setup");
  }
  return res.json() as Promise<MfaSetupInfo>;
}

export async function enableMfa(secret: string, token: string): Promise<{ backupCodes: string[] }> {
  const res = await fetch(getApiUrl("/api/auth/mfa/enable"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ secret, token }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Failed to enable MFA");
  }
  return res.json() as Promise<{ backupCodes: string[] }>;
}

export async function disableMfa(password: string): Promise<void> {
  const res = await fetch(getApiUrl("/api/auth/mfa/disable"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Failed to disable MFA");
  }
}

export async function getMfaStatus(): Promise<{ mfaEnabled: boolean }> {
  const res = await fetch(getApiUrl("/api/auth/mfa/status"), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch MFA status");
  return res.json() as Promise<{ mfaEnabled: boolean }>;
}

export async function register(username: string, password: string): Promise<void> {
  const res = await fetch(getApiUrl("/api/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Registration failed");
  }
}

export async function logout(): Promise<void> {
  await fetch(getApiUrl("/api/auth/logout"), {
    method: "POST",
    credentials: "include",
  });
}

export async function getSession(): Promise<AuthUser | null> {
  const res = await fetch(getApiUrl("/api/auth/session"), {
    credentials: "include",
  });
  if (res.status === 401) return null;
  if (!res.ok) return null;
  try {
    return await res.json() as AuthUser;
  } catch {
    return null;
  }
}

export async function refreshSession(): Promise<boolean> {
  const res = await fetch(getApiUrl("/api/auth/refresh"), {
    method: "POST",
    credentials: "include",
  });
  return res.ok;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(getApiUrl("/api/auth/change-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Failed to change password");
  }
}

export interface AdminUser {
  id: number;
  username: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  tenantId?: number;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch(getApiUrl("/api/admin/users"), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json() as Promise<AdminUser[]>;
}

export async function updateAdminUser(
  id: number,
  updates: { isActive?: boolean; role?: Role }
): Promise<AdminUser> {
  const res = await fetch(getApiUrl(`/api/admin/users/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Failed to update user");
  }
  return res.json() as Promise<AdminUser>;
}

export async function createAdminUser(
  username: string,
  password: string,
  role: Role = "user"
): Promise<AdminUser> {
  const res = await fetch(getApiUrl("/api/admin/users"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password, role }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Failed to create user");
  }
  return res.json() as Promise<AdminUser>;
}

export async function deleteAdminUser(id: number): Promise<void> {
  const res = await fetch(getApiUrl(`/api/admin/users/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Failed to delete user");
  }
}

export interface TenantSettings {
  idleTimeoutMinutes: number;
  minIdleTimeoutMinutes: number;
  maxIdleTimeoutMinutes: number;
}

export async function getTenantSettings(): Promise<TenantSettings> {
  const res = await fetch(getApiUrl("/api/admin/tenant-settings"), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch tenant settings");
  return res.json() as Promise<TenantSettings>;
}

export async function updateTenantSettings(idleTimeoutMinutes: number): Promise<{ idleTimeoutMinutes: number }> {
  const res = await fetch(getApiUrl("/api/admin/tenant-settings"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ idleTimeoutMinutes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Failed to update tenant settings");
  }
  return res.json() as Promise<{ idleTimeoutMinutes: number }>;
}

export async function getPatientAccess(userId: number): Promise<number[]> {
  const res = await fetch(getApiUrl(`/api/users/${userId}/patient-access`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch patient access");
  const data = await res.json() as { patientIds: number[] };
  return data.patientIds;
}

export async function getPatientAccessSummary(): Promise<Record<number, number>> {
  const res = await fetch(getApiUrl("/api/users/patient-access-summary"), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch patient access summary");
  return res.json() as Promise<Record<number, number>>;
}

export async function setPatientAccess(userId: number, patientIds: number[]): Promise<number[]> {
  const res = await fetch(getApiUrl(`/api/users/${userId}/patient-access`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ patientIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Failed to update patient access");
  }
  const data = await res.json() as { patientIds: number[] };
  return data.patientIds;
}
