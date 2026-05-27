"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import {
  ACCESS_SCOPE_VALUES,
  AccessScopeConfig,
  ROLE_STATUS_VALUES,
  RoleStatusConfig,
  type AccessScope,
  type RoleStatus,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Edit3, KeyRound, Loader2, Plus, Shield } from "lucide-react";
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
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export type RoleRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: RoleStatus | string;
  created_at?: string;
  updated_at?: string;
};

type PermissionRecord = {
  id: string;
  code: string;
  name: string | null;
  module: string;
  description: string | null;
  access_scope?: AccessScope | string;
};

type RoleDetail = RoleRecord & {
  permissions: PermissionRecord[];
  permission_count: number;
};

type RoleMode = "create" | "edit";

const roleStatusOptions = ROLE_STATUS_VALUES.map((value) => ({
  value,
  label: RoleStatusConfig[value].label,
}));

const accessScopeOptions = ACCESS_SCOPE_VALUES.map((value) => ({
  value,
  label: AccessScopeConfig[value].label,
}));

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }

  return payload.data as T;
}

function RoleDialog({
  mode,
  role,
  open,
  onOpenChange,
}: {
  mode: RoleMode;
  role?: RoleRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const defaults = useMemo(() => ({
    code: role?.code || "",
    name: role?.name || "",
    description: role?.description || "",
    status: ROLE_STATUS_VALUES.includes(role?.status as RoleStatus)
      ? role?.status as RoleStatus
      : "active",
  }), [role]);
  const [status, setStatus] = useState<RoleStatus>(defaults.status);

  useEffect(() => {
    if (!open) return;
    setStatus(defaults.status);
    setError("");
  }, [defaults.status, open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();

    setError("");
    startTransition(async () => {
      try {
        await requestJson(
          role?.id ? `/api/backend/roles/${role.id}` : "/api/backend/roles",
          {
            method: role?.id ? "PATCH" : "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name,
              description: description || null,
              status,
            }),
          },
        );
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存角色失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Shield className="size-4" />
            </div>
            <div>
              <DialogTitle>{mode === "create" ? "新增角色" : "编辑角色"}</DialogTitle>
              <DialogDescription>
                角色用于承载一组权限点，再分配给员工。
              </DialogDescription>
              {mode === "edit" && defaults.code ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  系统编码：{defaults.code}
                </div>
              ) : null}
            </div>
          </div>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${mode}-role-name`}>角色名称</FieldLabel>
              <Input
                id={`${mode}-role-name`}
                name="name"
                defaultValue={defaults.name}
                placeholder="例如 财务主管"
                maxLength={100}
                required
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-role-status`}>状态</FieldLabel>
              <FormSelect
                id={`${mode}-role-status`}
                value={status}
                options={roleStatusOptions}
                disabled={pending}
                onChange={(value) => setStatus(value as RoleStatus)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-role-description`}>说明</FieldLabel>
              <Textarea
                id={`${mode}-role-description`}
                name="description"
                defaultValue={defaults.description}
                placeholder="可填写角色职责和适用范围"
                maxLength={500}
                disabled={pending}
              />
            </Field>
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RolePermissionsDialog({
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
      requestJson<RoleDetail>(`/api/backend/roles/${role.id}`),
      requestJson<{ list: PermissionRecord[] }>(
        "/api/backend/permissions?page=1&pageSize=200&status=active",
      ),
    ])
      .then(([detail, permissionData]) => {
        if (cancelled) return;
        const nextSelected: Record<string, AccessScope> = {};
        for (const item of detail.permissions || []) {
          nextSelected[item.id] = ACCESS_SCOPE_VALUES.includes(item.access_scope as AccessScope)
            ? item.access_scope as AccessScope
            : "self";
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
        await requestJson(`/api/backend/roles/${role.id}/permissions`, {
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

export function CreateRoleButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        新增角色
      </Button>
      <RoleDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

export function RoleRowActions({ role }: { role: RoleRecord }) {
  const [editOpen, setEditOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setPermissionsOpen(true)}
      >
        <KeyRound />
        权限
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setEditOpen(true)}
      >
        <Edit3 />
        编辑
      </Button>
      <RoleDialog
        mode="edit"
        role={role}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <RolePermissionsDialog
        role={role}
        open={permissionsOpen}
        onOpenChange={setPermissionsOpen}
      />
    </div>
  );
}
