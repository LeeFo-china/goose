import type {
  AdminMenuGroup,
  AdminMenuItem,
  AdminMenuPermissionRequirement,
} from "@/components/layout/menu-config";
import type { AdminSession } from "@/lib/backend";

function buildPermissionRequirements(
  item: AdminMenuItem,
): AdminMenuPermissionRequirement[] {
  const legacyRequirement = item.permission
    ? [{ code: item.permission } satisfies AdminMenuPermissionRequirement]
    : [];

  return [...legacyRequirement, ...(item.requiredPermissions ?? [])];
}

export function hasMenuItemAccess(
  session: AdminSession,
  item: AdminMenuItem,
): boolean {
  const requirements = buildPermissionRequirements(item);
  if (requirements.length === 0) return true;

  return requirements.every((requirement) =>
    isPlatformSuperAdminAccess(session, requirement.code) ||
    session.permissions.some((permission) => {
      if (permission.code !== requirement.code) return false;
      if (!requirement.scope) return true;
      return permission.scope === requirement.scope;
    }),
  );
}

function isPlatformSuperAdminAccess(
  session: AdminSession,
  permissionCode: string,
): boolean {
  return Boolean(
    permissionCode.startsWith("platform.") &&
      session.tenant === null &&
      (
        session.is_platform_super_admin === true ||
        session.roles.includes("platform_admin")
      ),
  );
}

export function getVisibleGroups(
  session: AdminSession,
  groups: AdminMenuGroup[],
): AdminMenuGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasMenuItemAccess(session, item)),
    }))
    .filter((group) => group.items.length > 0);
}
