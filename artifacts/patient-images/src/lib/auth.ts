import { getApiUrl } from "./apiUrl";

export type Role = "user" | "admin" | "superadmin";

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
  tenantId?: number;
}

export class PendingApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PendingApprovalError";
  }
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch(getApiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; code?: string };
    if (body.code === "PENDING_APPROVAL") {
      throw new PendingApprovalError(body.error || "Account pending approval");
    }
    throw new Error(body.error || "Login failed");
  }
  return res.json() as Promise<AuthUser>;
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
