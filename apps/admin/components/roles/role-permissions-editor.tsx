"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Search, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  accessScopeOptions,
  normalizeAccessScope,
  requestRoleJson,
  type AccessScope,
  type PermissionRecord,
  type RoleDetail,
  type RoleRecord,
} from "@/components/roles/role-mutation-shared";
import {
  getModuleLabel,
  getPermissionDescription,
  getPermissionName,
  getPermissionSearchText,
  getPermissionSummary,
  permissionFilterOptions,
  type PermissionFilter,
} from "@/components/roles/role-permission-display";
import { cn } from "@/lib/utils";

export function RolePermissionsEditor({
  role,
  initialRoleDetail,
}: {
  role: RoleRecord;
  initialRoleDetail?: RoleDetail;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [selected, setSelected] = useState<Record<string, AccessScope>>({});
  const [keyword, setKeyword] = useState("");
  const [permissionFilter, setPermissionFilter] = useState<PermissionFilter>("all");
  const [activeModule, setActiveModule] = useState("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const detailRequest = initialRoleDetail
      ? Promise.resolve(initialRoleDetail)
      : requestRoleJson<RoleDetail>(`/api/backend/roles/${role.id}`);

    Promise.all([
      detailRequest,
      requestRoleJson<{ list: PermissionRecord[] }>(
        "/api/backend/permissions?page=1&pageSize=200&status=active",
      ),
    ])
      .then(([detail, permissionData]) => {
        if (cancelled) return;
        const nextSelected: Record<string, AccessScope> = {};
        for (const item of detail.permissions || []) {
          nextSelected[item.id] = normalizeAccessScope(item.access_scope);
        }
        setPermissions(permissionData.list || []);
        setSelected(nextSelected);
        setKeyword("");
        setPermissionFilter("all");
        setActiveModule("all");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "权限点加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialRoleDetail, role.id]);

  function togglePermission(permissionId: string, checked: boolean) {
    setSelected((current) => {
      const next = { ...current };
      if (checked) {
        next[permissionId] = next[permissionId] || "self";
      } else {
        delete next[permissionId];
      }
      return next;
    });
  }

  function updateScope(permissionId: string, scope: string) {
    setSelected((current) => ({
      ...current,
      [permissionId]: scope as AccessScope,
    }));
  }

  function selectPermissions(items: PermissionRecord[]) {
    setSelected((current) => {
      const next = { ...current };
      for (const item of items) {
        next[item.id] = next[item.id] || "self";
      }
      return next;
    });
  }

  function clearPermissions(items: PermissionRecord[]) {
    const ids = new Set(items.map((item) => item.id));
    setSelected((current) => {
      const next = { ...current };
      for (const id of ids) {
        delete next[id];
      }
      return next;
    });
  }

  function save() {
    const payload = {
      permissions: Object.entries(selected).map(([permission_id, access_scope]) => ({
        permission_id,
        access_scope,
      })),
    };

    setError("");
    startTransition(async () => {
      try {
        await requestRoleJson(`/api/backend/roles/${role.id}/permissions`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存角色权限失败");
      }
    });
  }

  const selectedCount = Object.keys(selected).length;
  const normalizedKeyword = keyword.trim().toLowerCase();
  const moduleSummaries = useMemo(() => {
    const map = new Map<string, {
      module: string;
      total: number;
      selected: number;
    }>();
    for (const permission of permissions) {
      const module = permission.module || "未分组";
      const summary = map.get(module) || { module, total: 0, selected: 0 };
      summary.total += 1;
      if (selected[permission.id]) summary.selected += 1;
      map.set(module, summary);
    }

    return Array.from(map.values());
  }, [permissions, selected]);
  const visiblePermissions = useMemo(
    () =>
      permissions.filter((permission) => {
        const isSelected = Boolean(selected[permission.id]);
        const moduleKey = permission.module || "未分组";
        if (activeModule !== "all" && moduleKey !== activeModule) return false;
        if (permissionFilter === "selected" && !isSelected) return false;
        if (permissionFilter === "unselected" && isSelected) return false;
        if (!normalizedKeyword) return true;

        return getPermissionSearchText(permission).includes(normalizedKeyword);
      }),
    [activeModule, normalizedKeyword, permissionFilter, permissions, selected],
  );
  const visibleSelectedCount = visiblePermissions.filter((item) => selected[item.id]).length;
  const groupedPermissions = visiblePermissions.reduce<Record<string, PermissionRecord[]>>(
    (groups, permission) => {
      const key = permission.module || "未分组";
      groups[key] = groups[key] || [];
      groups[key].push(permission);
      return groups;
    },
    {},
  );

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CardHeader className="shrink-0 border-b bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <KeyRound className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base">权限点配置</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                {role.name}，已选择 {selectedCount} 个权限点
              </div>
            </div>
          </div>
          <Badge variant="outline">
            {selectedCount}/{permissions.length} 已选
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b bg-background p-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={keyword}
                  disabled={pending || loading}
                  className="h-9 pr-9 pl-9"
                  placeholder="搜索权限名称、模块、资源或编码"
                  onChange={(event) => setKeyword(event.target.value)}
                />
                {keyword ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-9 w-9 text-muted-foreground"
                    disabled={pending}
                    aria-label="清除搜索"
                    onClick={() => setKeyword("")}
                  >
                    <X />
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {permissionFilterOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={permissionFilter === option.value ? "secondary" : "outline"}
                    disabled={pending || loading}
                    onClick={() => setPermissionFilter(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                当前显示 {visiblePermissions.length} 项，其中已选 {visibleSelectedCount} 项
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || loading || visiblePermissions.length === 0}
                  onClick={() => selectPermissions(visiblePermissions)}
                >
                  全选当前筛选
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending || loading || visibleSelectedCount === 0}
                  onClick={() => clearPermissions(visiblePermissions)}
                >
                  清空当前筛选
                </Button>
              </div>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <Button
                type="button"
                variant={activeModule === "all" ? "secondary" : "outline"}
                size="sm"
                className="h-8 shrink-0"
                disabled={pending || loading}
                onClick={() => setActiveModule("all")}
              >
                全部模块
                <span className="text-muted-foreground">
                  {selectedCount}/{permissions.length}
                </span>
              </Button>
              {moduleSummaries.map((summary) => (
                <Button
                  key={summary.module}
                  type="button"
                  variant={activeModule === summary.module ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={pending || loading}
                  onClick={() => setActiveModule(summary.module)}
                >
                  {getModuleLabel(summary.module)}
                  <span className="text-muted-foreground">
                    {summary.selected}/{summary.total}
                  </span>
                </Button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                正在加载权限点
              </div>
            ) : visiblePermissions.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                没有匹配的权限点
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {Object.entries(groupedPermissions).map(([module, items]) => (
                  <div key={module} className="rounded-md border">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">{getModuleLabel(module)}</div>
                        <Badge variant="outline">
                          {items.filter((item) => selected[item.id]).length}/{items.length} 已选
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          disabled={pending || items.every((item) => selected[item.id])}
                          onClick={() => selectPermissions(items)}
                        >
                          全选本组
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          disabled={pending || items.every((item) => !selected[item.id])}
                          onClick={() => clearPermissions(items)}
                        >
                          清空
                        </Button>
                      </div>
                    </div>
                    <div className="divide-y">
                      {items.map((permission) => {
                        const checked = Boolean(selected[permission.id]);
                        const description = getPermissionDescription(permission);
                        return (
                          <div
                            key={permission.id}
                            className={cn(
                              "grid gap-3 px-4 py-3 transition-colors md:grid-cols-[1fr_180px]",
                              checked ? "bg-primary/5" : "bg-background",
                            )}
                          >
                            <label className="flex min-w-0 cursor-pointer items-start gap-3">
                              <Checkbox
                                checked={checked}
                                disabled={pending}
                                className="mt-1"
                                onCheckedChange={(value) =>
                                  togglePermission(permission.id, value === true)
                                }
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">
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
                            <FormSelect
                              id={`role-${role.id}-permission-${permission.id}-scope`}
                              value={selected[permission.id] || "self"}
                              options={accessScopeOptions}
                              disabled={!checked || pending}
                              onChange={(value) => updateScope(permission.id, value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="shrink-0 border-t bg-background px-4 py-3">
            {error ? <StatusAlert>{error}</StatusAlert> : null}
            <div className="flex justify-end">
              <Button type="button" onClick={save} disabled={loading || pending}>
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                保存权限
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
