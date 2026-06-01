"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import {
  SALARY_TYPE_VALUES,
  PostStatusConfig,
  SalaryTypeConfig,
  type SalaryType,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Loader2 } from "lucide-react";
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  DepartmentPostRuleDepartment,
  PostRecord,
} from "@/components/organization/organization-types";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export type PostMode = "create" | "edit";
export type PostDepartmentOption = Pick<
  DepartmentPostRuleDepartment,
  "id" | "tenant_department_id" | "code" | "name"
>;

const EMPTY_DEPARTMENT_VALUE = "__none";

export function getTenantDepartmentOptionValue(department: PostDepartmentOption) {
  return department.tenant_department_id || "";
}

const salaryTypeOptions = [
  { value: "__none", label: "不设置薪资类型" },
  ...SALARY_TYPE_VALUES.map((value) => ({
    value,
    label: SalaryTypeConfig[value].label,
  })),
];

const statusOptions = [
  { value: "1", label: PostStatusConfig[1].label },
  { value: "0", label: PostStatusConfig[0].label },
];

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function mutatePost(input: {
  method: "POST" | "PATCH";
  id?: string;
  payload: unknown;
}) {
  const response = await fetch(
    input.id ? `/api/backend/posts/${input.id}` : "/api/backend/posts",
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

function toSalaryType(value: string | null | undefined) {
  return value && SALARY_TYPE_VALUES.includes(value as SalaryType) ? value : "__none";
}

export function PostDialog({
  mode,
  post,
  departments = [],
  defaultDepartmentId = "",
  lockDepartment = false,
  open,
  onOpenChange,
}: {
  mode: PostMode;
  post?: PostRecord;
  departments?: PostDepartmentOption[];
  defaultDepartmentId?: string;
  lockDepartment?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const defaults = useMemo(() => ({
    name: post?.name || "",
    code: post?.code || "",
    baseSalary: post?.base_salary != null ? String(post.base_salary) : "",
    salaryType: toSalaryType(post?.salary_type),
    sort: post?.sort != null ? String(post.sort) : "0",
    status: post?.status === 0 ? "0" : "1",
    description: post?.description || "",
    departmentId: defaultDepartmentId,
  }), [defaultDepartmentId, post]);
  const [salaryType, setSalaryType] = useState(defaults.salaryType);
  const [status, setStatus] = useState(defaults.status);
  const [departmentId, setDepartmentId] = useState(defaults.departmentId);
  const departmentOptions = useMemo(() => [
    { value: EMPTY_DEPARTMENT_VALUE, label: "请选择部门" },
    ...departments
      .map((department) => ({
        value: getTenantDepartmentOptionValue(department),
        label: `${department.name} · ${department.code}`,
      }))
      .filter((option) => option.value),
  ], [departments]);

  useEffect(() => {
    if (!open) return;
    setSalaryType(defaults.salaryType);
    setStatus(defaults.status);
    setDepartmentId(defaults.departmentId);
    setError("");
  }, [defaults.departmentId, defaults.salaryType, defaults.status, open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const baseSalaryValue = String(formData.get("base_salary") || "").trim();
    const sortValue = String(formData.get("sort") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const normalizedDepartmentId = departmentId === EMPTY_DEPARTMENT_VALUE
      ? ""
      : departmentId;

    if (mode === "create" && !normalizedDepartmentId) {
      setError("请先选择部门，再新增岗位");
      return;
    }

    const payload = {
      name: String(formData.get("name") || "").trim(),
      base_salary: baseSalaryValue ? Number(baseSalaryValue) : null,
      salary_type: salaryType === "__none" ? null : salaryType,
      sort: sortValue ? Number(sortValue) : 0,
      status: Number(status),
      description: description || null,
      ...(mode === "create" ? { tenant_department_id: normalizedDepartmentId } : {}),
    };

    setError("");
    startTransition(async () => {
      try {
        await mutatePost({
          method: mode === "create" ? "POST" : "PATCH",
          id: post?.id,
          payload,
        });
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存岗位失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <BriefcaseBusiness className="size-4" />
            </div>
            <div>
              <DialogTitle>{mode === "create" ? "新增岗位" : "编辑岗位"}</DialogTitle>
              <DialogDescription>
                {mode === "create"
                  ? "先确定部门，再在部门下新增岗位，岗位编码由系统自动生成。"
                  : "岗位编码由系统维护，其他信息可按业务需要调整。"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {mode === "create" ? (
              <Field className="md:col-span-2">
                <FieldLabel htmlFor={`${mode}-post-department`}>所属部门</FieldLabel>
                <FormSelect
                  id={`${mode}-post-department`}
                  value={departmentId || EMPTY_DEPARTMENT_VALUE}
                  options={departmentOptions}
                  disabled={pending || lockDepartment}
                  onChange={setDepartmentId}
                />
                <FieldDescription>
                  岗位创建后会自动加入该部门的可选岗位。
                </FieldDescription>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor={`${mode}-post-name`}>岗位名称</FieldLabel>
              <Input
                id={`${mode}-post-name`}
                name="name"
                defaultValue={defaults.name}
                placeholder="例如 设计师"
                maxLength={50}
                required
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-post-code`}>岗位编码</FieldLabel>
              <Input
                id={`${mode}-post-code`}
                value={mode === "create" ? "保存后自动生成" : defaults.code}
                readOnly
                disabled
              />
              <FieldDescription>
                编码用于系统规则匹配，创建后不可手工修改。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-post-salary-type`}>薪资类型</FieldLabel>
              <FormSelect
                id={`${mode}-post-salary-type`}
                value={salaryType}
                options={salaryTypeOptions}
                disabled={pending}
                onChange={setSalaryType}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-post-base-salary`}>基础薪资</FieldLabel>
              <Input
                id={`${mode}-post-base-salary`}
                name="base_salary"
                type="number"
                min="0"
                step="0.01"
                defaultValue={defaults.baseSalary}
                placeholder="例如 8000"
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-post-sort`}>排序</FieldLabel>
              <Input
                id={`${mode}-post-sort`}
                name="sort"
                type="number"
                min="0"
                step="1"
                defaultValue={defaults.sort}
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-post-status`}>状态</FieldLabel>
              <FormSelect
                id={`${mode}-post-status`}
                value={status}
                options={statusOptions}
                disabled={pending}
                onChange={setStatus}
              />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor={`${mode}-post-description`}>说明</FieldLabel>
              <Textarea
                id={`${mode}-post-description`}
                name="description"
                defaultValue={defaults.description}
                placeholder="可填写岗位职责、适用范围或薪资说明"
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
