"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export const ADMIN_SESSION_STORAGE_PREFIX = "gooes:admin-session:";

export type AdminSessionScope = Readonly<{
  tenantId: string | null;
  userId: string;
  storageScope: string;
}>;

type AdminSessionScopedStorage = Pick<
  Storage,
  "key" | "length" | "removeItem"
>;

const AdminSessionScopeContext = createContext<AdminSessionScope | null>(null);

export function createAdminSessionScope(
  tenantId: string | null | undefined,
  userId: string,
): AdminSessionScope | null {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return null;
  const normalizedTenantId = tenantId?.trim() || null;
  const tenantScope = normalizedTenantId
    ? `tenant:${encodeURIComponent(normalizedTenantId)}`
    : "platform";
  return Object.freeze({
    tenantId: normalizedTenantId,
    userId: normalizedUserId,
    storageScope: `${tenantScope}:user:${encodeURIComponent(normalizedUserId)}`,
  });
}

export function AdminSessionScopeProvider({
  tenantId,
  userId,
  children,
}: {
  tenantId: string | null;
  userId: string;
  children: ReactNode;
}) {
  const scope = useMemo(
    () => createAdminSessionScope(tenantId, userId),
    [tenantId, userId],
  );
  return (
    <AdminSessionScopeContext.Provider value={scope}>
      {children}
    </AdminSessionScopeContext.Provider>
  );
}

export function useAdminSessionScope() {
  return useContext(AdminSessionScopeContext);
}

export function clearAdminSessionScopedStorage(
  storage: AdminSessionScopedStorage | null,
) {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(ADMIN_SESSION_STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    return;
  }
}
