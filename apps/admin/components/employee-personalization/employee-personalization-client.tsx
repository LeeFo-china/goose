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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {previewText ? (
        <div className="shrink-0 rounded-md border bg-card p-3">
          <div className="text-sm font-medium">预览结果</div>
          <p className="mt-1 text-xs text-muted-foreground">
            后端按当前身份上下文返回的最终命中配置。
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">{previewText}</pre>
        </div>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>个性化规则</CardTitle>
              <CardDescription>
                本页启用 {activeCount} 条，可选员工 {data.options.employees.length} 名。
              </CardDescription>
            </div>
            <Button onClick={() => setDialogRule(null)}>
              <Plus data-icon="inline-start" />
              新增规则
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <Table className="min-w-[960px]">
              <TableHeader className="sticky top-0 z-10 bg-muted/60">
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
                {data.list.length > 0 ? data.list.map((rule) => (
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
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      暂无个性化规则
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="shrink-0 border-t bg-card px-4 py-3 text-sm text-muted-foreground">
            当前显示 {data.list.length} 条，共 {data.pagination.total} 条
          </div>
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
