"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  accessScopeOptions,
  normalizeAccessScope,
  requestRoleJson,
  type AccessScope,
  type PermissionRecord,
  type RoleDetail,
  type RoleRecord,
} from "@/components/roles/role-mutation-shared";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function RolePermissionsDialog({
  role,
  open,
  onOpenChange,
}: {
  role: RoleRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [selected, setSelected] = useState<Record<string, AccessScope>>({});

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      requestRoleJson<RoleDetail>(`/api/backend/roles/${role.id}`),
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
  }, [open, role.id]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

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
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存角色权限失败");
      }
    });
  }

  const groupedPermissions = permissions.reduce<Record<string, PermissionRecord[]>>(
    (groups, permission) => {
      const key = permission.module || "未分组";
      groups[key] = groups[key] || [];
      groups[key].push(permission);
      return groups;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="flex h-[86vh] max-w-[860px] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <KeyRound className="size-4" />
            </div>
            <div>
              <DialogTitle>配置角色权限</DialogTitle>
              <DialogDescription>
                {role.name} · 已选择 {Object.keys(selected).length} 个权限点
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              正在加载权限点
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {Object.entries(groupedPermissions).map(([module, items]) => (
                <div key={module} className="rounded-md border">
                  <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
                    <div className="text-sm font-medium">{module}</div>
                    <Badge variant="outline">{items.length} 项</Badge>
                  </div>
                  <div className="divide-y">
                    {items.map((permission) => {
                      const checked = Boolean(selected[permission.id]);
                      return (
                        <div
                          key={permission.id}
                          className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_180px]"
                        >
                          <label className="flex min-w-0 items-start gap-3">
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
                                {permission.name || permission.description || permission.code}
                              </span>
                              <span className="block break-all text-xs text-muted-foreground">
                                {permission.code}
                              </span>
                              {permission.description ? (
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {permission.description}
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
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={close} disabled={pending}>
            取消
          </Button>
          <Button type="button" onClick={save} disabled={loading || pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            保存权限
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
