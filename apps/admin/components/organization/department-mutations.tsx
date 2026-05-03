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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DepartmentRecord } from "@/components/organization/organization-types";

type DepartmentMode = "create" | "edit";

const departmentCodeOptions = [
  { value: "__none", label: "不设置编码" },
  ...DEPARTMENT_CODE_VALUES.map((value) => ({
    value,
    label: `${DepartmentConfig[value].label} · ${value}`,
  })),
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

function toDepartmentCode(value: string | null | undefined) {
  return value && DEPARTMENT_CODE_VALUES.includes(value as DepartmentCode)
    ? value
    : "__none";
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
  }), [department]);
  const [code, setCode] = useState(defaults.code);

  useEffect(() => {
    if (!open) return;
    setCode(defaults.code);
    setError("");
  }, [defaults.code, open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const payload = {
      name,
      code: code === "__none" ? null : code,
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
              <DialogTitle>{mode === "create" ? "新增部门" : "编辑部门"}</DialogTitle>
              <DialogDescription>
                部门用于员工归属、部门级权限范围和业务数据可见性。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${mode}-department-name`}>部门名称</FieldLabel>
              <Input
                id={`${mode}-department-name`}
                name="name"
                defaultValue={defaults.name}
                placeholder="例如 设计部"
                maxLength={50}
                required
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-department-code`}>部门编码</FieldLabel>
              <FormSelect
                id={`${mode}-department-code`}
                value={code}
                options={departmentCodeOptions}
                disabled={pending}
                onChange={setCode}
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

export function CreateDepartmentButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        新增部门
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
