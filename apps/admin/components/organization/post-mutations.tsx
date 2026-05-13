"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import {
  EMPLOYEE_POST_CODE_VALUES,
  EmployeePostConfig,
  SALARY_TYPE_VALUES,
  PostStatusConfig,
  SalaryTypeConfig,
  type SalaryType,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BriefcaseBusiness, Edit3, Loader2, Plus, Power, RotateCcw } from "lucide-react";
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

type PostMode = "create" | "edit";
type PostDepartmentOption = Pick<
  DepartmentPostRuleDepartment,
  "id" | "tenant_department_id" | "code" | "name"
>;

const EMPTY_DEPARTMENT_VALUE = "__none";

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

async function mutatePost(input: {
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

function PostDialog({
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
  const [code, setCode] = useState(defaults.code);
  const [salaryType, setSalaryType] = useState(defaults.salaryType);
  const [status, setStatus] = useState(defaults.status);
  const [departmentId, setDepartmentId] = useState(defaults.departmentId);
  const departmentOptions = useMemo(() => [
    { value: EMPTY_DEPARTMENT_VALUE, label: "请选择部门" },
    ...departments
      .map((department) => ({
        value: department.tenant_department_id || department.id,
        label: `${department.name} · ${department.code}`,
      }))
      .filter((option) => option.value),
  ], [departments]);

  useEffect(() => {
    if (!open) return;
    setCode(defaults.code);
    setSalaryType(defaults.salaryType);
    setStatus(defaults.status);
    setDepartmentId(defaults.departmentId);
    setError("");
  }, [defaults.code, defaults.departmentId, defaults.salaryType, defaults.status, open]);

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
    const codeValue = code.trim().toUpperCase();
    const normalizedDepartmentId = departmentId === EMPTY_DEPARTMENT_VALUE
      ? ""
      : departmentId;

    if (mode === "create" && !normalizedDepartmentId) {
      setError("请先选择部门，再新增岗位");
      return;
    }

    const payload = {
      name: String(formData.get("name") || "").trim(),
      code: codeValue,
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
        router.refresh();
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
                  ? "先确定部门，再在部门下新增岗位，保存后自动写入部门岗位规则。"
                  : "岗位用于员工职责标识、薪资类型和业务角色管理。"}
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
                name="code"
                value={code}
                list={`${mode}-post-code-suggestions`}
                placeholder="例如 CUSTOMER_SERVICE"
                maxLength={64}
                required
                disabled={pending}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
              />
              <datalist id={`${mode}-post-code-suggestions`}>
                {EMPLOYEE_POST_CODE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {EmployeePostConfig[value].label}
                  </option>
                ))}
              </datalist>
              <FieldDescription>
                使用大写字母、数字、下划线，且以大写字母开头；会用于项目角色匹配。
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

export function CreatePostButton({
  departments = [],
  defaultDepartmentId = "",
  lockDepartment = false,
  disabled = false,
  label = "新增岗位",
}: {
  departments?: PostDepartmentOption[];
  defaultDepartmentId?: string;
  lockDepartment?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        disabled={disabled || departments.length === 0}
        onClick={() => setOpen(true)}
      >
        <Plus data-icon="inline-start" />
        {label}
      </Button>
      <PostDialog
        mode="create"
        departments={departments}
        defaultDepartmentId={defaultDepartmentId}
        lockDepartment={lockDepartment}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function PostRowActions({
  post,
}: {
  post: PostRecord;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const enabled = post.status !== 0;

  function toggleStatus() {
    startTransition(async () => {
      try {
        await mutatePost({
          method: "PATCH",
          id: post.id,
          payload: { status: enabled ? 0 : 1 },
        });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "岗位状态更新失败");
      }
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
        <Edit3 data-icon="inline-start" />
        编辑
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={toggleStatus}>
        {pending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : enabled ? (
          <Power data-icon="inline-start" />
        ) : (
          <RotateCcw data-icon="inline-start" />
        )}
        {enabled ? "停用" : "启用"}
      </Button>
      <PostDialog
        mode="edit"
        post={post}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
