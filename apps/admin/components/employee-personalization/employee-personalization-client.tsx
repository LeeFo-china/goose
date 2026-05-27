"use client";

import { type FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Eye, Loader2, Plus, Power, PowerOff } from "lucide-react";
import { FormSelect, type SelectOption } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  EMPLOYEE_PERSONALIZATION_SCOPE_LABELS,
  EMPLOYEE_PERSONALIZATION_STATUS_LABELS,
  type EmployeePersonalizationListData,
  type EmployeePersonalizationRule,
  type EmployeePersonalizationScope,
  type EmployeePersonalizationStatus,
} from "@/components/employee-personalization/employee-personalization-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

const SCOPE_OPTIONS = Object.entries(EMPLOYEE_PERSONALIZATION_SCOPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);
const STATUS_OPTIONS = Object.entries(EMPLOYEE_PERSONALIZATION_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);

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

function stringifyContent(rule?: EmployeePersonalizationRule) {
  return JSON.stringify(rule?.content_json ?? { blocks: [], quick_actions: [] }, null, 2);
}

function toOptionLabel(name?: string | null, code?: string | null) {
  return [name, code].filter(Boolean).join(" / ") || code || name || "未命名";
}

function RuleDialog({
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

export function EmployeePersonalizationClient({
  data,
  error,
}: {
  data: EmployeePersonalizationListData;
  error: string | null;
}) {
  const router = useRouter();
  const [dialogRule, setDialogRule] = useState<EmployeePersonalizationRule | null | undefined>();
  const [pendingId, setPendingId] = useState("");
  const [previewText, setPreviewText] = useState("");
  const activeCount = useMemo(
    () => data.list.filter((item) => item.status === "active").length,
    [data.list],
  );

  async function updateStatus(rule: EmployeePersonalizationRule, status: EmployeePersonalizationStatus) {
    setPendingId(rule.id);
    try {
      await requestJson(`/api/backend/admin/employee-personalization-rules/${rule.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setPendingId("");
    }
  }

  async function preview(rule: EmployeePersonalizationRule) {
    setPendingId(rule.id);
    setPreviewText("");
    try {
      const payload = await requestJson<unknown>("/api/backend/admin/employee-personalization-rules/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scene: rule.scene,
          employee_id: rule.employee_id,
          tenant_department_id: rule.tenant_department_id,
          post_id: rule.post_id,
          role_codes: rule.role_code ? [rule.role_code] : [],
        }),
      });
      setPreviewText(JSON.stringify(payload, null, 2));
    } finally {
      setPendingId("");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {previewText ? (
        <Card>
          <CardHeader>
            <CardTitle>预览结果</CardTitle>
            <CardDescription>后端按当前身份上下文返回的最终命中配置。</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[320px] overflow-auto rounded-md bg-muted p-3 text-xs">{previewText}</pre>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>规则总数</CardDescription>
            <CardTitle>{data.pagination.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本页启用</CardDescription>
            <CardTitle>{activeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>配置选项</CardDescription>
            <CardTitle>{data.options.employees.length} 名员工</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>个性化规则</CardTitle>
              <CardDescription>按员工、部门岗位、岗位、部门、角色和租户默认配置员工端内容。</CardDescription>
            </div>
            <Button onClick={() => setDialogRule(null)}>
              <Plus data-icon="inline-start" />
              新增规则
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>场景</TableHead>
                <TableHead>层级</TableHead>
                <TableHead>优先级</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.list.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.scene}</TableCell>
                  <TableCell>{EMPLOYEE_PERSONALIZATION_SCOPE_LABELS[rule.scope]}</TableCell>
                  <TableCell>{rule.priority}</TableCell>
                  <TableCell>
                    <Badge variant={rule.status === "active" ? "default" : "secondary"}>
                      {EMPLOYEE_PERSONALIZATION_STATUS_LABELS[rule.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(rule.updated_at).toLocaleString("zh-CN")}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" disabled={pendingId === rule.id} onClick={() => preview(rule)}>
                        <Eye data-icon="inline-start" />
                        预览
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDialogRule(rule)}>
                        <Edit3 data-icon="inline-start" />
                        编辑
                      </Button>
                      {rule.status === "active" ? (
                        <Button variant="outline" size="sm" disabled={pendingId === rule.id} onClick={() => updateStatus(rule, "disabled")}>
                          <PowerOff data-icon="inline-start" />
                          停用
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled={pendingId === rule.id} onClick={() => updateStatus(rule, "active")}>
                          <Power data-icon="inline-start" />
                          启用
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RuleDialog
        rule={dialogRule || undefined}
        data={data}
        open={dialogRule !== undefined}
        onOpenChange={(open) => {
          if (!open) setDialogRule(undefined);
        }}
      />
    </div>
  );
}
