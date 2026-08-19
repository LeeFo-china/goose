import type { AdminSession } from "@/lib/backend";

export function isPlatformOnlySession(session: AdminSession | null | undefined) {
  return Boolean(
    session &&
      session.tenant === null &&
      (
        session.is_platform_staff === true ||
        session.roles.includes("platform_admin")
      ),
  );
}
