"use client";

import { useEffect, useState, useTransition } from "react";
import { useMemo } from "react";
import { PERMISSION_CODE_VALUES } from "@gooes/domain";
import { zodResolver } from "@hookform/resolvers/zod";
import { Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { inferPermissionFields, isPermissionCodeValue, mutatePermission, PermissionFormSchema, PERMISSION_ACTION_SELECT_OPTIONS, PERMISSION_CODE_OPTIONS, PERMISSION_MODULE_SELECT_OPTIONS, PERMISSION_RESOURCE_SELECT_OPTIONS, PERMISSION_STATUS_OPTIONS, SelectField, type PermissionFormValues, type PermissionMode } from "@/components/permissions/permission-mutation-shared";
import type { PermissionRecord } from "@/components/permissions/permission-types";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useRouter } from "next/navigation";

export function PermissionDialog({
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
        refreshAfterDialogClose(router);
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
