"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Loader2, Plus, Power, RotateCcw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PermissionRecord = {
  id: string;
  code: string;
  name: string | null;
  module: string;
  resource: string;
  action: string;
  description: string | null;
  status: "active" | "inactive" | string;
};

type PermissionMode = "create" | "edit";

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function mutatePermission(input: {
  method: "POST" | "PATCH" | "DELETE";
  id?: string;
  payload?: unknown;
}) {
  const response = await fetch(
    input.id ? `/api/backend/permissions/${input.id}` : "/api/backend/permissions",
    {
      method: input.method,
      headers: input.payload ? { "content-type": "application/json" } : undefined,
      body: input.payload ? JSON.stringify(input.payload) : undefined,
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }
  return payload;
}

function PermissionDialog({
  mode,
  permission,
  open,
  onOpenChange,
}: {
  mode: PermissionMode;
  permission?: PermissionRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const title = mode === "create" ? "新增权限" : "编辑权限";
  const submitText = mode === "create" ? "创建权限" : "保存修改";
  const defaults = useMemo(() => ({
    code: permission?.code || "",
    name: permission?.name || "",
    module: permission?.module || "",
    resource: permission?.resource || "",
    action: permission?.action || "",
    description: permission?.description || "",
    status: permission?.status || "active",
  }), [permission]);

  if (!open) return null;

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      code: String(formData.get("code") || "").trim(),
      name: String(formData.get("name") || "").trim() || undefined,
      module: String(formData.get("module") || "").trim(),
      resource: String(formData.get("resource") || "").trim(),
      action: String(formData.get("action") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      status: String(formData.get("status") || "active"),
    };

    setError("");
    startTransition(async () => {
      try {
        await mutatePermission({
          method: mode === "create" ? "POST" : "PATCH",
          id: permission?.id,
          payload,
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="w-full max-w-[560px] rounded-lg border bg-card shadow-[0_20px_80px_rgba(15,23,42,0.22)]">
        <div className="border-b p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">
                权限编码需存在于后端权限枚举，模块、资源、动作用于后台筛选和维护。
              </p>
            </div>
          </div>
        </div>
        <form className="space-y-4 p-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${mode}-permission-code`}>权限编码</Label>
              <Input
                id={`${mode}-permission-code`}
                name="code"
                defaultValue={defaults.code}
                placeholder="例如 employee.read"
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${mode}-permission-name`}>权限名称</Label>
              <Input
                id={`${mode}-permission-name`}
                name="name"
                defaultValue={defaults.name}
                placeholder="例如 查看员工"
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-permission-module`}>模块</Label>
              <Input
                id={`${mode}-permission-module`}
                name="module"
                defaultValue={defaults.module}
                placeholder="employee"
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-permission-resource`}>资源</Label>
              <Input
                id={`${mode}-permission-resource`}
                name="resource"
                defaultValue={defaults.resource}
                placeholder="employee"
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-permission-action`}>动作</Label>
              <Input
                id={`${mode}-permission-action`}
                name="action"
                defaultValue={defaults.action}
                placeholder="read / create / update"
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-permission-status`}>状态</Label>
              <select
                id={`${mode}-permission-status`}
                name="status"
                defaultValue={defaults.status}
                disabled={pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="active">启用</option>
                <option value="inactive">停用</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${mode}-permission-description`}>说明</Label>
              <textarea
                id={`${mode}-permission-description`}
                name="description"
                defaultValue={defaults.description}
                placeholder="可留空"
                disabled={pending}
                className="min-h-[84px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {submitText}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CreatePermissionButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        新增权限
      </Button>
      <PermissionDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

export function PermissionRowActions({
  permission,
}: {
  permission: PermissionRecord;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const disabled = pending;

  function setStatus(status: "active" | "inactive") {
    const message = status === "inactive"
      ? `确认停用权限「${permission.name || permission.code}」？`
      : `确认恢复权限「${permission.name || permission.code}」？`;
    if (!window.confirm(message)) return;

    setError("");
    startTransition(async () => {
      try {
        if (status === "inactive") {
          await mutatePermission({ method: "DELETE", id: permission.id });
        } else {
          await mutatePermission({
            method: "PATCH",
            id: permission.id,
            payload: { status: "active" },
          });
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败");
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Edit3 />
        编辑
      </Button>
      {permission.status === "inactive" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setStatus("active")}
        >
          {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          恢复
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setStatus("inactive")}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Power />}
          停用
        </Button>
      )}
      <PermissionDialog
        mode="edit"
        permission={permission}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {error ? (
        <div className="absolute right-5 mt-10 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
