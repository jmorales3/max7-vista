import { getApiUrl } from "./apiUrl";

export type Role = "user" | "admin" | "superadmin";

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
  tenantId?: number;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch(getApiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || "Login failed");
  }
  return res.json() as Promise<AuthUser>;
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
