"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  PERMISSION_CODE_VALUES,
  PERMISSION_STATUS_VALUES,
  PermissionCodeConfig,
  PermissionStatusConfig,
  type PermissionCode,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { Edit3, Loader2, Plus, Power, RotateCcw, Shield } from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { FormSelect, type SelectOption } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
const PERMISSION_CODE_OPTIONS: SelectOption[] = PERMISSION_CODE_VALUES.map((code) => ({
  value: code,
  label: `${code} - ${PermissionCodeConfig[code]?.label || code}`,
}));
const PERMISSION_MODULE_SELECT_OPTIONS: SelectOption[] = PERMISSION_MODULE_OPTIONS.map((value) => ({
  value,
  label: value,
}));
const PERMISSION_RESOURCE_SELECT_OPTIONS: SelectOption[] = PERMISSION_RESOURCE_OPTIONS.map((value) => ({
  value,
  label: value,
}));
const PERMISSION_ACTION_SELECT_OPTIONS: SelectOption[] = PERMISSION_ACTION_OPTIONS.map((value) => ({
  value,
  label: value,
}));
const PERMISSION_STATUS_OPTIONS: SelectOption[] = PERMISSION_STATUS_VALUES.map((value) => ({
  value,
  label: PermissionStatusConfig[value].label,
}));

const PermissionFormSchema = z.object({
  code: z.enum(PERMISSION_CODE_VALUES),
  name: z.string().trim().min(1, "请输入权限名称"),
  module: z.string().trim().min(1, "请选择模块"),
  resource: z.string().trim().min(1, "请选择资源"),
  action: z.string().trim().min(1, "请选择动作"),
  description: z.string(),
  status: z.enum(PERMISSION_STATUS_VALUES),
});

type PermissionFormValues = z.infer<typeof PermissionFormSchema>;

function isPermissionCodeValue(value: string): value is PermissionCode {
  return PERMISSION_CODE_VALUES.includes(value as PermissionCode);
}

function SelectField({
  id,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  options: SelectOption[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FormSelect
      id={id}
      value={value}
      disabled={disabled}
      options={options}
      onChange={onChange}
    />
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
  const defaults = useMemo<PermissionFormValues>(() => {
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
      status: permission?.status === "inactive" ? "inactive" : "active",
    };
  }, [permission]);
  const form = useForm<PermissionFormValues>({
    resolver: zodResolver(PermissionFormSchema as never) as Resolver<PermissionFormValues>,
    defaultValues: defaults,
  });

  useEffect(() => {
    if (open) form.reset(defaults);
  }, [defaults, form, open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(values: PermissionFormValues) {
    const payload = {
      code: values.code.trim(),
      name: values.name.trim(),
      module: values.module.trim(),
      resource: values.resource.trim(),
      action: values.action.trim(),
      description: values.description.trim() || null,
      status: values.status,
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
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Shield className="size-4" />
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                权限编码需存在于后端权限枚举，模块、资源、动作用于后台筛选和维护。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Controller
              name="code"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${mode}-permission-code`}>权限编码</FieldLabel>
                  <FormSelect
                    id={`${mode}-permission-code`}
                    value={field.value}
                    disabled={pending}
                    invalid={fieldState.invalid}
                    options={PERMISSION_CODE_OPTIONS}
                    onChange={(code) => {
                      if (!isPermissionCodeValue(code)) return;
                      const next = inferPermissionFields(code);
                      form.setValue("code", next.code, { shouldValidate: true });
                      form.setValue("name", next.name, { shouldValidate: true });
                      form.setValue("module", next.module, { shouldValidate: true });
                      form.setValue("resource", next.resource, { shouldValidate: true });
                      form.setValue("action", next.action, { shouldValidate: true });
                    }}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${mode}-permission-name`}>权限名称</FieldLabel>
                  <Input
                    {...field}
                    id={`${mode}-permission-name`}
                    placeholder="例如 查看员工"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="module"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${mode}-permission-module`}>模块</FieldLabel>
                  <SelectField
                    id={`${mode}-permission-module`}
                    disabled={pending}
                    value={field.value}
                    options={PERMISSION_MODULE_SELECT_OPTIONS}
                    onChange={field.onChange}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="resource"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${mode}-permission-resource`}>资源</FieldLabel>
                  <SelectField
                    id={`${mode}-permission-resource`}
                    disabled={pending}
                    value={field.value}
                    options={PERMISSION_RESOURCE_SELECT_OPTIONS}
                    onChange={field.onChange}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="action"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${mode}-permission-action`}>动作</FieldLabel>
                  <SelectField
                    id={`${mode}-permission-action`}
                    disabled={pending}
                    value={field.value}
                    options={PERMISSION_ACTION_SELECT_OPTIONS}
                    onChange={field.onChange}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="status"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${mode}-permission-status`}>状态</FieldLabel>
                  <FormSelect
                    id={`${mode}-permission-status`}
                    value={field.value}
                    disabled={pending}
                    invalid={fieldState.invalid}
                    options={PERMISSION_STATUS_OPTIONS}
                    onChange={field.onChange}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${mode}-permission-description`}>说明</FieldLabel>
                  <Textarea
                    {...field}
                    id={`${mode}-permission-description`}
                    placeholder="可留空"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
          {error ? (
            <StatusAlert>{error}</StatusAlert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {submitText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const [statusAction, setStatusAction] = useState<"active" | "inactive" | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const disabled = pending;

  function setStatus(status: "active" | "inactive") {
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
        setStatusAction(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败");
      }
    });
  }

  return (
    <div className="flex min-w-[156px] flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
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
          onClick={() => setStatusAction("active")}
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
          onClick={() => setStatusAction("inactive")}
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
      <ConfirmActionDialog
        open={statusAction !== null}
        onOpenChange={(open) => setStatusAction(open ? statusAction : null)}
        title={statusAction === "inactive" ? "停用权限" : "恢复权限"}
        description={
          statusAction === "inactive"
            ? `确认停用权限「${permission.name || permission.code}」？`
            : `确认恢复权限「${permission.name || permission.code}」？`
        }
        confirmLabel={statusAction === "inactive" ? "确认停用" : "确认恢复"}
        destructive={statusAction === "inactive"}
        pending={pending}
        onConfirm={() => {
          if (statusAction) setStatus(statusAction);
        }}
      />
      {error ? (
        <div className="absolute right-5 mt-10 rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
