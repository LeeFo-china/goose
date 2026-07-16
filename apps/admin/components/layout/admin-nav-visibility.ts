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
    session.permissions.some((permission) => {
      if (permission.code !== requirement.code) return false;
      if (!requirement.scope) return true;
      return permission.scope === requirement.scope;
    }),
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
