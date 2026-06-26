"use client";

import { useEffect, useState, useTransition } from "react";
import { RoleStatusConfig } from "@gooes/domain";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { requestBackend, type EmployeePermissionContext, type RoleOption } from "@/components/employees/employee-mutation-shared";
import type { EmployeeMutationRecord } from "@/components/employees/employee-types";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function EmployeeRolesDialog({
  employee,
  open,
  onOpenChange,
  onSaved,
}: {
  employee: EmployeeMutationRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      requestBackend<{ list: RoleOption[] }>("/api/backend/roles?page=1&pageSize=100&status=active"),
      requestBackend<EmployeePermissionContext>(`/api/backend/employees/${employee.id}/permissions`),
    ])
      .then(([roleData, context]) => {
        if (cancelled) return;
        const currentRoleIds = new Set((context.roles || []).map((item) => item.id));
        const currentInactiveRoles = (context.roles || []).filter(
          (item) => item.status !== "active",
        );
        const mergedRoles = [
          ...(roleData.list || []),
          ...currentInactiveRoles.filter(
            (item) => !(roleData.list || []).some((role) => role.id === item.id),
          ),
        ];
        setRoles(mergedRoles);
        setSelectedRoleIds([...currentRoleIds]);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "角色数据加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [employee.id, open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function toggleRole(roleId: string, checked: boolean) {
    setSelectedRoleIds((current) => {
      if (checked) return Array.from(new Set([...current, roleId]));
      return current.filter((id) => id !== roleId);
    });
  }

  function save() {
    setError("");
    startTransition(async () => {
      try {
        await requestBackend(`/api/backend/employees/${employee.id}/roles`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role_ids: selectedRoleIds }),
        });
        onOpenChange(false);
        if (onSaved) {
          onSaved();
        } else {
          refreshAfterDialogClose(router);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存员工角色失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="flex h-[82vh] max-w-[620px] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <KeyRound className="size-4" />
            </div>
            <div>
              <DialogTitle>配置员工角色</DialogTitle>
              <DialogDescription>
                {employee.name || "未命名员工"} · 已选择 {selectedRoleIds.length} 个角色
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              正在加载角色
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {roles.length > 0 ? roles.map((role) => {
                const checked = selectedRoleIds.includes(role.id);
                const statusMeta = role.status === "active"
                  ? { label: RoleStatusConfig.active.label, variant: "success" as const }
                  : { label: RoleStatusConfig.inactive.label, variant: "secondary" as const };

                return (
                  <label
                    key={role.id}
                    className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={pending}
                      className="mt-1"
                      onCheckedChange={(value) => toggleRole(role.id, value === true)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{role.name}</span>
                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                      </span>
                      <span className="mt-1 block break-all text-xs text-muted-foreground">
                        {role.code}
                      </span>
                      {role.description ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {role.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              }) : (
                <div className="p-6 text-sm text-muted-foreground">
                  还没有可分配的角色，请先到角色管理页面创建角色。
                </div>
              )}
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
            保存角色
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ManageEmployeeRolesButton({
  employee,
  onSaved,
}: {
  employee: EmployeeMutationRecord;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <KeyRound />
        角色
      </Button>
      <EmployeeRolesDialog
        employee={employee}
        open={open}
        onOpenChange={setOpen}
        onSaved={onSaved}
      />
    </>
  );
}
