"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Eye, Plus, Power, PowerOff } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { EMPLOYEE_PERSONALIZATION_SCOPE_LABELS, EMPLOYEE_PERSONALIZATION_STATUS_LABELS, type EmployeePersonalizationListData, type EmployeePersonalizationRule, type EmployeePersonalizationStatus } from "@/components/employee-personalization/employee-personalization-types";
import { RuleDialog } from "@/components/employee-personalization/employee-personalization-rule-dialog";
import { requestJson } from "@/components/employee-personalization/employee-personalization-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
