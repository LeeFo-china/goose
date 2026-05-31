"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FormSelect, type SelectOption } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EMPLOYEE_PERSONALIZATION_SCOPE_LABELS, EMPLOYEE_PERSONALIZATION_STATUS_LABELS, type EmployeePersonalizationListData, type EmployeePersonalizationRule, type EmployeePersonalizationScope, type EmployeePersonalizationStatus } from "@/components/employee-personalization/employee-personalization-types";
import { requestJson, stringifyContent, toOptionLabel } from "@/components/employee-personalization/employee-personalization-shared";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

const SCOPE_OPTIONS = Object.entries(EMPLOYEE_PERSONALIZATION_SCOPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);
const STATUS_OPTIONS = Object.entries(EMPLOYEE_PERSONALIZATION_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export function RuleDialog({
  rule,
  data,
  open,
  onOpenChange,
}: {
  rule?: EmployeePersonalizationRule | null;
  data: EmployeePersonalizationListData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [scope, setScope] = useState<EmployeePersonalizationScope>(
    rule?.scope ?? "tenant_default",
  );
  const [status, setStatus] = useState<EmployeePersonalizationStatus>(
    rule?.status ?? "draft",
  );
  const title = rule ? "编辑个性化规则" : "新增个性化规则";

  const employeeOptions: SelectOption[] = data.options.employees.map((item) => ({
    value: item.id,
    label: toOptionLabel(item.name, item.status),
  }));
  const departmentOptions: SelectOption[] = data.options.departments.map((item) => ({
    value: item.id,
    label: toOptionLabel(item.name, item.code),
  }));
  const postOptions: SelectOption[] = data.options.posts.map((item) => ({
    value: item.id,
    label: toOptionLabel(item.name, item.code),
  }));
  const roleOptions: SelectOption[] = data.options.roles.map((item) => ({
    value: item.code,
    label: toOptionLabel(item.name, item.code),
  }));

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    let contentJson: Record<string, unknown>;
    try {
      const parsed = JSON.parse(String(formData.get("content_json") || "{}"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("配置 JSON 必须是对象");
      }
      contentJson = parsed as Record<string, unknown>;
    } catch (err) {
      setError(err instanceof Error ? err.message : "配置 JSON 解析失败");
      return;
    }

    const payload = {
      scene: String(formData.get("scene") || "employee_home").trim(),
      scope,
      employee_id: scope === "employee" ? String(formData.get("employee_id") || "") || null : null,
      tenant_department_id:
        scope === "department" || scope === "department_post"
          ? String(formData.get("tenant_department_id") || "") || null
          : null,
      post_id:
        scope === "post" || scope === "department_post"
          ? String(formData.get("post_id") || "") || null
          : null,
      role_code: scope === "role" ? String(formData.get("role_code") || "") || null : null,
      priority: Number(formData.get("priority") || 0),
      status,
      content_json: contentJson,
    };

    setError("");
    startTransition(async () => {
      try {
        await requestJson(
          rule
            ? `/api/backend/admin/employee-personalization-rules/${rule.id}`
            : "/api/backend/admin/employee-personalization-rules",
          {
            method: rule ? "PATCH" : "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存规则失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            配置员工端命中的最终内容。小程序只消费返回结果，不计算部门岗位规则。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <FieldGroup>
            <div className="grid gap-3 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="personalization-scene">场景</FieldLabel>
                <Input
                  id="personalization-scene"
                  name="scene"
                  defaultValue={rule?.scene ?? "employee_home"}
                  maxLength={64}
                  required
                  disabled={pending}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="personalization-scope">匹配层级</FieldLabel>
                <FormSelect
                  id="personalization-scope"
                  value={scope}
                  options={SCOPE_OPTIONS}
                  disabled={pending}
                  onChange={(value) => setScope(value as EmployeePersonalizationScope)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="personalization-status">状态</FieldLabel>
                <FormSelect
                  id="personalization-status"
                  value={status}
                  options={STATUS_OPTIONS}
                  disabled={pending}
                  onChange={(value) => setStatus(value as EmployeePersonalizationStatus)}
                />
              </Field>
            </div>

            {scope === "employee" ? (
              <Field>
                <FieldLabel htmlFor="personalization-employee">员工</FieldLabel>
                <select
                  id="personalization-employee"
                  name="employee_id"
                  defaultValue={rule?.employee_id ?? ""}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  disabled={pending}
                  required
                >
                  <option value="">请选择员工</option>
                  {employeeOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </Field>
            ) : null}

            {(scope === "department" || scope === "department_post") ? (
              <Field>
                <FieldLabel htmlFor="personalization-department">租户部门</FieldLabel>
                <select
                  id="personalization-department"
                  name="tenant_department_id"
                  defaultValue={rule?.tenant_department_id ?? ""}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  disabled={pending}
                  required
                >
                  <option value="">请选择部门</option>
                  {departmentOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </Field>
            ) : null}

            {(scope === "post" || scope === "department_post") ? (
              <Field>
                <FieldLabel htmlFor="personalization-post">岗位</FieldLabel>
                <select
                  id="personalization-post"
                  name="post_id"
                  defaultValue={rule?.post_id ?? ""}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  disabled={pending}
                  required
                >
                  <option value="">请选择岗位</option>
                  {postOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </Field>
            ) : null}

            {scope === "role" ? (
              <Field>
                <FieldLabel htmlFor="personalization-role">角色</FieldLabel>
                <select
                  id="personalization-role"
                  name="role_code"
                  defaultValue={rule?.role_code ?? ""}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  disabled={pending}
                  required
                >
                  <option value="">请选择角色</option>
                  {roleOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor="personalization-priority">优先级</FieldLabel>
              <Input
                id="personalization-priority"
                name="priority"
                type="number"
                defaultValue={rule?.priority ?? 0}
                disabled={pending}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="personalization-content">配置 JSON</FieldLabel>
              <Textarea
                id="personalization-content"
                name="content_json"
                defaultValue={stringifyContent(rule ?? undefined)}
                rows={10}
                disabled={pending}
              />
              <FieldDescription>
                示例：{"{"}"blocks":[],"quick_actions":[]{"}"}。保存前会校验必须是 JSON 对象。
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={close}>取消</Button>
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

