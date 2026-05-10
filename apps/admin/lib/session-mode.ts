import type { AdminSession } from "@/lib/backend";

export function isPlatformOnlySession(session: AdminSession | null | undefined) {
  return Boolean(
    session?.roles.includes("platform_admin") &&
      (!session.tenant || session.tenant.id === null),
  );
}

