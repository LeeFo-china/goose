"use client";

import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  accessScopeOptions,
  type AccessScope,
  type PermissionRecord,
} from "@/components/roles/role-mutation-shared";
import {
  getPermissionDescription,
  getPermissionName,
  getPermissionSummary,
} from "@/components/roles/role-permission-display";
import {
  getPermissionGroupCheckState,
  type PermissionGroupCheckState,
  type PermissionModuleGroup,
} from "@/components/roles/role-permission-tree";
import { cn } from "@/lib/utils";

function toCheckboxValue(state: PermissionGroupCheckState) {
  return state === "indeterminate" ? "indeterminate" : state === "checked";
}

function getModulePermissions(moduleGroup: PermissionModuleGroup) {
  return moduleGroup.resources.flatMap((resource) => resource.permissions);
}

export function RolePermissionTreeView({
  roleId,
  permissionTree,
  selected,
  pending,
  expandedModules,
  expandedResources,
  onModuleExpanded,
  onResourceExpanded,
  onGroupPermissions,
  onTogglePermission,
  onUpdateScope,
}: {
  roleId: string;
  permissionTree: PermissionModuleGroup[];
  selected: Record<string, AccessScope>;
  pending: boolean;
  expandedModules: Record<string, boolean>;
  expandedResources: Record<string, boolean>;
  onModuleExpanded: (module: string, open: boolean) => void;
  onResourceExpanded: (resource: string, open: boolean) => void;
  onGroupPermissions: (items: PermissionRecord[], checked: boolean) => void;
  onTogglePermission: (permissionId: string, checked: boolean) => void;
  onUpdateScope: (permissionId: string, scope: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {permissionTree.map((moduleGroup) => {
        const modulePermissions = getModulePermissions(moduleGroup);
        const moduleOpen = expandedModules[moduleGroup.key] ?? true;

        return (
          <Collapsible
            key={moduleGroup.key}
            open={moduleOpen}
            onOpenChange={(open) => onModuleExpanded(moduleGroup.key, open)}
          >
            <div className="rounded-md border bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-8">
                    <ChevronRight
                      className={cn("transition-transform", moduleOpen ? "rotate-90" : "")}
                    />
                  </Button>
                </CollapsibleTrigger>
                <Checkbox
                  checked={toCheckboxValue(
                    getPermissionGroupCheckState(modulePermissions, selected),
                  )}
                  disabled={pending}
                  aria-label={`选择${moduleGroup.label}`}
                  onCheckedChange={(value) => onGroupPermissions(modulePermissions, value === true)}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{moduleGroup.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {moduleGroup.resources.length} 个资源
                  </div>
                </div>
                <Badge variant={moduleGroup.selected > 0 ? "secondary" : "outline"}>
                  {moduleGroup.selected}/{moduleGroup.total} 已选
                </Badge>
              </div>
              <CollapsibleContent>
                <div className="divide-y">
                  {moduleGroup.resources.map((resourceGroup) => {
                    const resourceOpen = expandedResources[resourceGroup.key] ?? true;

                    return (
                      <Collapsible
                        key={resourceGroup.key}
                        open={resourceOpen}
                        onOpenChange={(open) => onResourceExpanded(resourceGroup.key, open)}
                      >
                        <div className="bg-background">
                          <div className="flex flex-wrap items-center gap-2 px-3 py-2 pl-8">
                            <CollapsibleTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8"
                              >
                                <ChevronRight
                                  className={cn(
                                    "transition-transform",
                                    resourceOpen ? "rotate-90" : "",
                                  )}
                                />
                              </Button>
                            </CollapsibleTrigger>
                            <Checkbox
                              checked={toCheckboxValue(
                                getPermissionGroupCheckState(
                                  resourceGroup.permissions,
                                  selected,
                                ),
                              )}
                              disabled={pending}
                              aria-label={`选择${resourceGroup.label}`}
                              onCheckedChange={(value) =>
                                onGroupPermissions(resourceGroup.permissions, value === true)
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm">{resourceGroup.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {resourceGroup.total} 个权限点
                              </div>
                            </div>
                            <Badge variant="outline">
                              {resourceGroup.selected}/{resourceGroup.total} 已选
                            </Badge>
                          </div>
                          <CollapsibleContent>
                            <div className="divide-y border-t">
                              {resourceGroup.permissions.map((permission) => {
                                const checked = Boolean(selected[permission.id]);
                                const description = getPermissionDescription(permission);

                                return (
                                  <div
                                    key={permission.id}
                                    className={cn(
                                      "grid gap-3 px-3 py-3 pl-12 transition-colors md:grid-cols-[1fr_160px]",
                                      checked ? "bg-primary/5" : "bg-background",
                                    )}
                                  >
                                    <label className="flex min-w-0 cursor-pointer items-start gap-3">
                                      <Checkbox
                                        checked={checked}
                                        disabled={pending}
                                        className="mt-1"
                                        onCheckedChange={(value) =>
                                          onTogglePermission(permission.id, value === true)
                                        }
                                      />
                                      <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">
                                          {getPermissionName(permission)}
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                          {getPermissionSummary(permission)}
                                        </span>
                                        {description ? (
                                          <span className="mt-1 block text-xs text-muted-foreground">
                                            {description}
                                          </span>
                                        ) : null}
                                      </span>
                                    </label>
                                    <Select
                                      value={selected[permission.id] || "self"}
                                      disabled={!checked || pending}
                                      onValueChange={(value) =>
                                        onUpdateScope(permission.id, value)
                                      }
                                    >
                                      <SelectTrigger
                                        id={`role-${roleId}-permission-${permission.id}-scope`}
                                        className="h-8 bg-card shadow-none"
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectGroup>
                                          {accessScopeOptions.map((option) => (
                                            <SelectItem
                                              key={option.value}
                                              value={option.value}
                                            >
                                              {option.label}
                                            </SelectItem>
                                          ))}
                                        </SelectGroup>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
