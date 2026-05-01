"use client";

import { ChangeEvent, FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Loader2, Plus, Power, RotateCcw, Shield } from "lucide-react";
import {
  PERMISSION_CODE_VALUES,
  PermissionCodeConfig,
  type PermissionCode,
} from "@gooes/domain";
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

type PermissionFormState = {
  code: string;
  name: string;
  module: string;
  resource: string;
  action: string;
  description: string;
  status: string;
};

const SELECT_CLASS_NAME =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function uniq(values: string[]) {
  return Array.from(new Set(values)).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function inferPermissionFields(code: PermissionCode) {
  const module = PermissionCodeConfig[code]?.module || code.split(".")[0];
  const rest = code.startsWith(`${module}.`) ? code.slice(module.length + 1) : code;
  const segments = rest.split(".");
  const resource = segments.length > 1 ? `${module}_${segments.slice(0, -1).join("_")}` : module;
  const action = segments.at(-1) || rest;

  return {
    code,
    name: PermissionCodeConfig[code]?.label || code,
    module,
    resource,
    action,
  };
}

const PERMISSION_FIELD_OPTIONS = PERMISSION_CODE_VALUES.map(inferPermissionFields);
const PERMISSION_MODULE_OPTIONS = uniq(PERMISSION_FIELD_OPTIONS.map((item) => item.module));
const PERMISSION_RESOURCE_OPTIONS = uniq(PERMISSION_FIELD_OPTIONS.map((item) => item.resource));
const PERMISSION_ACTION_OPTIONS = uniq(PERMISSION_FIELD_OPTIONS.map((item) => item.action));

function isPermissionCodeValue(value: string): value is PermissionCode {
  return PERMISSION_CODE_VALUES.includes(value as PermissionCode);
}

function SelectField({
  id,
  name,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  options: string[];
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <select
      id={id}
      name={name}
      value={value}
      disabled={disabled}
      required
      className={SELECT_CLASS_NAME}
      onChange={onChange}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

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
  const defaults = useMemo<PermissionFormState>(() => {
    const permissionCode = permission?.code || "";
    const code = isPermissionCodeValue(permissionCode)
      ? permissionCode
      : PERMISSION_CODE_VALUES[0];
    const inferred = inferPermissionFields(code);

    return {
      code,
      name: permission?.name || inferred.name,
      module: permission?.module || inferred.module,
      resource: permission?.resource || inferred.resource,
      action: permission?.action || inferred.action,
      description: permission?.description || "",
      status: permission?.status || "active",
    };
  }, [permission]);
  const [formState, setFormState] = useState<PermissionFormState>(defaults);

  if (!open) return null;

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      code: formState.code.trim(),
      name: formState.name.trim() || undefined,
      module: formState.module.trim(),
      resource: formState.resource.trim(),
      action: formState.action.trim(),
      description: formState.description.trim() || null,
      status: formState.status || "active",
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
              <select
                id={`${mode}-permission-code`}
                name="code"
                value={formState.code}
                disabled={pending}
                required
                className={SELECT_CLASS_NAME}
                onChange={(event) => {
                  const code = event.target.value;
                  if (!isPermissionCodeValue(code)) return;
                  const next = inferPermissionFields(code);
                  setFormState((current) => ({
                    ...current,
                    ...next,
                    description: current.description,
                    status: current.status,
                  }));
                }}
              >
                {PERMISSION_CODE_VALUES.map((code) => (
                  <option key={code} value={code}>
                    {code} - {PermissionCodeConfig[code]?.label || code}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${mode}-permission-name`}>权限名称</Label>
              <Input
                id={`${mode}-permission-name`}
                name="name"
                value={formState.name}
                placeholder="例如 查看员工"
                disabled={pending}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  name: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-permission-module`}>模块</Label>
              <SelectField
                id={`${mode}-permission-module`}
                name="module"
                disabled={pending}
                value={formState.module}
                options={PERMISSION_MODULE_OPTIONS}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  module: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-permission-resource`}>资源</Label>
              <SelectField
                id={`${mode}-permission-resource`}
                name="resource"
                disabled={pending}
                value={formState.resource}
                options={PERMISSION_RESOURCE_OPTIONS}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  resource: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-permission-action`}>动作</Label>
              <SelectField
                id={`${mode}-permission-action`}
                name="action"
                disabled={pending}
                value={formState.action}
                options={PERMISSION_ACTION_OPTIONS}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  action: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-permission-status`}>状态</Label>
              <select
                id={`${mode}-permission-status`}
                name="status"
                value={formState.status}
                disabled={pending}
                className={SELECT_CLASS_NAME}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  status: event.target.value,
                }))}
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
                value={formState.description}
                placeholder="可留空"
                disabled={pending}
                className="min-h-[84px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  description: event.target.value,
                }))}
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
