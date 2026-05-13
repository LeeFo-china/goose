"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import {
  DEPARTMENT_CODE_VALUES,
  DepartmentConfig,
  type DepartmentCode,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Building2, Edit3, Loader2, Plus } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DepartmentRecord } from "@/components/organization/organization-types";

type DepartmentMode = "create" | "edit";

const departmentCodeOptions = [
  ...DEPARTMENT_CODE_VALUES.map((value) => ({
    value,
    label: `${DepartmentConfig[value].label} · ${value}`,
  })),
];

const enabledOptions = [
  { value: "true", label: "启用" },
  { value: "false", label: "停用" },
];

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function mutateDepartment(input: {
  method: "POST" | "PATCH";
  id?: string;
  payload: unknown;
}) {
  const response = await fetch(
    input.id ? `/api/backend/departments/${input.id}` : "/api/backend/departments",
    {
      method: input.method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.payload),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }
  return payload;
}

function toDepartmentCode(value: string | null | undefined): DepartmentCode {
  return value && DEPARTMENT_CODE_VALUES.includes(value as DepartmentCode)
    ? value as DepartmentCode
    : DEPARTMENT_CODE_VALUES[0];
}

function DepartmentDialog({
  mode,
  department,
  open,
  onOpenChange,
}: {
  mode: DepartmentMode;
  department?: DepartmentRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const defaults = useMemo(() => ({
    name: department?.name || "",
    code: toDepartmentCode(department?.code),
    enabled: department?.enabled === false ? "false" : "true",
    sort: department?.sort != null ? String(department.sort) : "0",
  }), [department]);
  const [code, setCode] = useState<DepartmentCode>(defaults.code);
  const [enabled, setEnabled] = useState(defaults.enabled);
  const [name, setName] = useState(defaults.name || DepartmentConfig[defaults.code].label);

  useEffect(() => {
    if (!open) return;
    setCode(defaults.code);
    setEnabled(defaults.enabled);
    setName(defaults.name || DepartmentConfig[defaults.code].label);
    setError("");
  }, [defaults.code, defaults.enabled, defaults.name, open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nameValue = name.trim();
    const sortValue = String(formData.get("sort") || "").trim();
    const payload = {
      name: nameValue,
      ...(mode === "create" ? { code } : {}),
      enabled: enabled === "true",
      sort: sortValue ? Number(sortValue) : 0,
    };

    setError("");
    startTransition(async () => {
      try {
        await mutateDepartment({
          method: mode === "create" ? "POST" : "PATCH",
          id: department?.id,
          payload,
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存部门失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Building2 className="size-4" />
            </div>
            <div>
              <DialogTitle>{mode === "create" ? "启用部门" : "部门配置"}</DialogTitle>
              <DialogDescription>
                {mode === "create"
                  ? "从平台标准部门中选择启用，并设置租户侧显示名称。"
                  : "标准部门编码不可修改，可调整租户侧显示名称、启停和排序。"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${mode}-department-name`}>显示名称</FieldLabel>
              <Input
                id={`${mode}-department-name`}
                name="name"
                value={name}
                placeholder={DepartmentConfig[code].label}
                maxLength={50}
                required
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
              />
              <FieldDescription>
                可按公司习惯设置别名，系统底层仍使用标准部门编码。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-department-code`}>标准部门</FieldLabel>
              {mode === "create" ? (
                <FormSelect
                  id={`${mode}-department-code`}
                  value={code}
                  options={departmentCodeOptions}
                  disabled={pending}
                  onChange={(nextCode) => {
                    setCode(nextCode as DepartmentCode);
                    setName(DepartmentConfig[nextCode as DepartmentCode].label);
                  }}
                />
              ) : (
                <div className="flex min-h-9 items-center gap-2 rounded-md border bg-muted/35 px-3 text-sm">
                  <span className="font-medium">{DepartmentConfig[code].label}</span>
                  <Badge variant="outline">{code}</Badge>
                </div>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-department-enabled`}>状态</FieldLabel>
              <FormSelect
                id={`${mode}-department-enabled`}
                value={enabled}
                options={enabledOptions}
                disabled={pending}
                onChange={setEnabled}
              />
              <FieldDescription>
                停用后不会出现在员工、岗位新增的候选部门中。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-department-sort`}>排序</FieldLabel>
              <Input
                id={`${mode}-department-sort`}
                name="sort"
                type="number"
                min="0"
                step="1"
                defaultValue={defaults.sort}
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

export function EnableDepartmentButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        启用部门
      </Button>
      <DepartmentDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

export function DepartmentRowActions({
  department,
}: {
  department: DepartmentRecord;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex justify-end">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Edit3 data-icon="inline-start" />
        编辑
      </Button>
      <DepartmentDialog
        mode="edit"
        department={department}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
