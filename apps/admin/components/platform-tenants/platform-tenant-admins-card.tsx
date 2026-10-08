"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlatformTenantAdminPhoneDialog } from "./platform-tenant-admin-phone-dialog";
import type { PhoneChangeResult, TenantAdmin, TenantAdminList } from "./platform-tenant-admin-phone-state";
import { requestPlatformTenantJson } from "./platform-tenant-requests";

export function PlatformTenantAdminsCard({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TenantAdminList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TenantAdmin | null>(null);
  const [changed, setChanged] = useState<PhoneChangeResult | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await requestPlatformTenantJson<TenantAdminList>(
        `/platform/tenants/${tenantId}/admins?page=${page}&pageSize=20`,
        { cache: "no-store", fallbackMessage: "当前管理员加载失败" },
      );
      if (request === generation.current) {
        if (page > 1 && page > result.pagination.totalPages) {
          setPage(Math.max(1, result.pagination.totalPages));
        } else {
          setData(result);
        }
      }
      return result;
    } catch (failure) {
      if (request === generation.current) setError(failure instanceof Error ? failure.message : "当前管理员加载失败");
      return null;
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [tenantId, page]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  function onChanged(result: PhoneChangeResult) {
    setSelected(null);
    setChanged(result);
    setData((current) => current ? { ...current, list: current.list.map((item) => item.id === result.employee_id
      ? { ...item, phone_masked: result.phone_masked, version: result.version } : item) } : current);
    toast.success("登录手机号已变更，请管理员使用新号码重新登录后台。");
    void load();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>当前租户管理员</CardTitle>
            <CardDescription>按当前管理员角色列出员工；换号操作仅适用于管理员本人未变更的情况。</CardDescription>
          </div>
          <Button type="button" variant="outline" disabled={loading || Boolean(selected)} onClick={() => void load()}>刷新列表</Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4" aria-busy={loading}>
        {changed ? <Alert><AlertDescription className="flex flex-col gap-1">
          <p>登录手机号已变更为 {changed.phone_masked}，请管理员使用新号码重新登录后台。</p>
          <p>变更时间：{new Date(changed.changed_at).toLocaleString("zh-CN")}</p>
          <Link className="underline" href="/platform/audit-logs?action=tenant_admin_phone_change">查看变更审计</Link>
        </AlertDescription></Alert> : null}
        {error ? <Alert variant="destructive"><AlertDescription>{error}，请刷新列表重试。</AlertDescription></Alert> : null}
        {loading ? <p role="status" className="text-sm text-muted-foreground">正在加载管理员…</p> : null}
        {data ? <>
          <Table>
            <TableHeader><TableRow>
              <TableHead>管理员</TableHead><TableHead>登录手机号</TableHead><TableHead>状态</TableHead>
              <TableHead>登录绑定</TableHead><TableHead className="text-right">操作</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.list.length ? data.list.map((admin) => <TableRow key={admin.id}>
                <TableCell>{admin.name || "未填写姓名"}</TableCell>
                <TableCell className="whitespace-nowrap">{admin.phone_masked || "未设置"}</TableCell>
                <TableCell><Badge variant={admin.status === "active" ? "success" : "secondary"}>{admin.status === "active" ? "启用" : admin.status || "未知"}</Badge></TableCell>
                <TableCell className="whitespace-nowrap">{admin.has_login_binding ? "已绑定" : "未绑定"}</TableCell>
                <TableCell className="text-right">
                  {admin.can_change ? <Button type="button" size="sm" variant="outline" disabled={loading || Boolean(error)}
                    onClick={() => setSelected(admin)}>变更登录手机号</Button>
                    : <span className="text-sm text-muted-foreground">{admin.disabled_reason || "不可变更"}</span>}
                </TableCell>
              </TableRow>) : <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无当前管理员</TableCell></TableRow>}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">共 {data.pagination.total} 位管理员 · 每页 {data.pagination.pageSize} 位 · 第 {data.pagination.page} / {Math.max(1, data.pagination.totalPages)} 页</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={loading || Boolean(selected) || data.pagination.page <= 1} onClick={() => setPage(data.pagination.page - 1)}>上一页</Button>
              <Button type="button" size="sm" variant="outline" disabled={loading || Boolean(selected) || data.pagination.page >= data.pagination.totalPages} onClick={() => setPage(data.pagination.page + 1)}>下一页</Button>
            </div>
          </div>
        </> : null}
      </CardContent>
      {selected ? <PlatformTenantAdminPhoneDialog key={selected.id} tenantId={tenantId} tenantName={tenantName} admin={selected}
        onClose={() => setSelected(null)} onChanged={onChanged}
        onRefresh={async () => (await load())?.list.find((item) => item.id === selected.id) ?? null} /> : null}
    </Card>
  );
}
