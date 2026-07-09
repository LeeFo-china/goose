import type { AccessScope, PermissionRecord } from "./role-mutation-shared";
import {
  getPermissionGroup,
  getPermissionResourceLabel,
} from "./role-permission-display";

export type PermissionGroupCheckState = "checked" | "indeterminate" | "unchecked";

export type PermissionSelectionDelta = {
  added: number;
  removed: number;
  scopeChanged: number;
  hasChanges: boolean;
};

export type PermissionResourceGroup = {
  key: string;
  resource: string;
  label: string;
  permissions: PermissionRecord[];
  total: number;
  selected: number;
};

export type PermissionModuleGroup = {
  key: string;
  module: string;
  label: string;
  resources: PermissionResourceGroup[];
  total: number;
  selected: number;
};

export function buildPermissionTree(
  permissions: PermissionRecord[],
  selected: Record<string, AccessScope>,
): PermissionModuleGroup[] {
  const moduleMap = new Map<string, PermissionModuleGroup>();
  const moduleOrderMap = new Map<string, number>();

  for (const permission of permissions) {
    const permissionGroup = getPermissionGroup(permission);
    const module = permissionGroup.key;
    const resource = permission.resource || "未分组";
    const resourceKey = `${module}::${resource}`;
    let moduleGroup = moduleMap.get(module);

    if (!moduleGroup) {
      moduleGroup = {
        key: module,
        module,
        label: permissionGroup.label,
        resources: [],
        total: 0,
        selected: 0,
      };
      moduleMap.set(module, moduleGroup);
      moduleOrderMap.set(module, permissionGroup.order);
    }

    let resourceGroup = moduleGroup.resources.find((item) => item.key === resourceKey);
    if (!resourceGroup) {
      resourceGroup = {
        key: resourceKey,
        resource,
        label: getPermissionResourceLabel(resource),
        permissions: [],
        total: 0,
        selected: 0,
      };
      moduleGroup.resources.push(resourceGroup);
    }

    moduleGroup.total += 1;
    resourceGroup.total += 1;
    resourceGroup.permissions.push(permission);

    if (selected[permission.id]) {
      moduleGroup.selected += 1;
      resourceGroup.selected += 1;
    }
  }

  return Array.from(moduleMap.values()).sort((first, second) => {
    const orderDiff = (moduleOrderMap.get(first.key) ?? 900)
      - (moduleOrderMap.get(second.key) ?? 900);

    return orderDiff || first.label.localeCompare(second.label, "zh-Hans-CN");
  });
}

export function getPermissionGroupCheckState(
  permissions: PermissionRecord[],
  selected: Record<string, AccessScope>,
): PermissionGroupCheckState {
  if (permissions.length === 0) return "unchecked";

  const selectedCount = permissions.filter((permission) => selected[permission.id]).length;
  if (selectedCount === 0) return "unchecked";
  if (selectedCount === permissions.length) return "checked";

  return "indeterminate";
}

export function getPermissionSelectionDelta(
  initial: Record<string, AccessScope>,
  current: Record<string, AccessScope>,
): PermissionSelectionDelta {
  let added = 0;
  let removed = 0;
  let scopeChanged = 0;

  for (const [permissionId, accessScope] of Object.entries(current)) {
    const initialScope = initial[permissionId];
    if (!initialScope) {
      added += 1;
    } else if (initialScope !== accessScope) {
      scopeChanged += 1;
    }
  }

  for (const permissionId of Object.keys(initial)) {
    if (!current[permissionId]) removed += 1;
  }

  return {
    added,
    removed,
    scopeChanged,
    hasChanges: added > 0 || removed > 0 || scopeChanged > 0,
  };
}
