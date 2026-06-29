"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Search, X } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
  getPermissionSearchText,
  permissionFilterOptions,
  type PermissionFilter,
} from "@/components/roles/role-permission-display";
import { RolePermissionTreeView } from "@/components/roles/role-permission-tree-view";
import {
  buildPermissionTree,
  getPermissionSelectionDelta,
} from "@/components/roles/role-permission-tree";

const ACTIVE_PERMISSION_PAGE_SIZE = 100;

type PermissionListResponse = {
  list?: PermissionRecord[];
  pagination?: {
    page?: number;
    totalPages?: number;
  };
};

async function loadActivePermissions() {
  const permissions: PermissionRecord[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await requestRoleJson<PermissionListResponse>(
      `/api/backend/permissions?page=${page}&pageSize=${ACTIVE_PERMISSION_PAGE_SIZE}&status=active`,
    );
    const items = data.list || [];
    permissions.push(...items);

    const totalPages = data.pagination?.totalPages;
    hasNextPage = totalPages
      ? page < totalPages
      : items.length === ACTIVE_PERMISSION_PAGE_SIZE;
    page += 1;
  }

  return permissions;
}

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
  const [initialSelected, setInitialSelected] = useState<Record<string, AccessScope>>({});
  const [keyword, setKeyword] = useState("");
  const [permissionFilter, setPermissionFilter] = useState<PermissionFilter>("all");
  const [activeModule, setActiveModule] = useState("all");
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [expandedResources, setExpandedResources] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const detailRequest = initialRoleDetail
      ? Promise.resolve(initialRoleDetail)
      : requestRoleJson<RoleDetail>(`/api/backend/roles/${role.id}`);

    Promise.all([
      detailRequest,
      loadActivePermissions(),
    ])
      .then(([detail, permissionList]) => {
        if (cancelled) return;
        const nextSelected: Record<string, AccessScope> = {};
        for (const item of detail.permissions || []) {
          nextSelected[item.id] = normalizeAccessScope(item.access_scope);
        }
        setPermissions(permissionList);
        setSelected(nextSelected);
        setInitialSelected(nextSelected);
        setKeyword("");
        setPermissionFilter("all");
        setActiveModule("all");
        setExpandedModules({});
        setExpandedResources({});
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

  function setGroupPermissions(items: PermissionRecord[], checked: boolean) {
    if (checked) {
      selectPermissions(items);
    } else {
      clearPermissions(items);
    }
  }

  function resetChanges() {
    setSelected(initialSelected);
  }

  function setModuleExpanded(module: string, open: boolean) {
    setExpandedModules((current) => ({ ...current, [module]: open }));
  }

  function setResourceExpanded(resource: string, open: boolean) {
    setExpandedResources((current) => ({ ...current, [resource]: open }));
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
  const permissionTree = useMemo(
    () => buildPermissionTree(visiblePermissions, selected),
    [visiblePermissions, selected],
  );
  const selectionDelta = useMemo(
    () => getPermissionSelectionDelta(initialSelected, selected),
    [initialSelected, selected],
  );
  const changeSummary = selectionDelta.hasChanges
    ? `新增 ${selectionDelta.added} 项，移除 ${selectionDelta.removed} 项，范围变更 ${selectionDelta.scopeChanged} 项`
    : "无";

  function expandAll() {
    const nextModules: Record<string, boolean> = {};
    const nextResources: Record<string, boolean> = {};

    for (const moduleGroup of permissionTree) {
      nextModules[moduleGroup.key] = true;
      for (const resourceGroup of moduleGroup.resources) {
        nextResources[resourceGroup.key] = true;
      }
    }

    setExpandedModules(nextModules);
    setExpandedResources(nextResources);
  }

  function collapseAll() {
    const nextModules: Record<string, boolean> = {};
    const nextResources: Record<string, boolean> = {};

    for (const moduleGroup of permissionTree) {
      nextModules[moduleGroup.key] = false;
      for (const resourceGroup of moduleGroup.resources) {
        nextResources[resourceGroup.key] = false;
      }
    }

    setExpandedModules(nextModules);
    setExpandedResources(nextResources);
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                当前显示 {visiblePermissions.length} 项，其中已选 {visibleSelectedCount} 项；
                总已选 {selectedCount}/{permissions.length} 项
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
                  variant="outline"
                  size="sm"
                  disabled={pending || loading || permissionTree.length === 0}
                  onClick={expandAll}
                >
                  展开全部
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending || loading || permissionTree.length === 0}
                  onClick={collapseAll}
                >
                  收起全部
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
              <RolePermissionTreeView
                roleId={role.id}
                permissionTree={permissionTree}
                selected={selected}
                pending={pending}
                expandedModules={expandedModules}
                expandedResources={expandedResources}
                onModuleExpanded={setModuleExpanded}
                onResourceExpanded={setResourceExpanded}
                onGroupPermissions={setGroupPermissions}
                onTogglePermission={togglePermission}
                onUpdateScope={updateScope}
              />
            )}
          </div>
          <div className="shrink-0 border-t bg-background px-4 py-3">
            {error ? <StatusAlert>{error}</StatusAlert> : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                本次变更：{changeSummary}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={loading || pending || !selectionDelta.hasChanges}
                  onClick={resetChanges}
                >
                  <RotateCcw data-icon="inline-start" />
                  撤销变更
                </Button>
                <Separator orientation="vertical" className="h-6" />
                <Button type="button" onClick={save} disabled={loading || pending}>
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  保存权限
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
