"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { KeyRound, Layers3, Loader2, Power, ShieldCheck } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  PermissionFilters,
  PermissionsPagination,
} from "@/components/permissions/permission-list-actions";
import { type PermissionRecord } from "@/components/permissions/permission-mutations";
import { PermissionsTable } from "@/components/permissions/permissions-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function PermissionsClientShell({
  permissions,
  pagination,
  status,
  module,
  keyword,
  error,
}: {
  permissions: PermissionRecord[];
  pagination: Pagination;
  status: string;
  module: string;
  keyword: string;
  error: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }
  const activeCount = permissions.filter((permission) => permission.status === "active").length;
  const inactiveCount = permissions.filter((permission) => permission.status === "inactive").length;
  const moduleCount = new Set(permissions.map((permission) => permission.module).filter(Boolean)).size;

  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <KeyRound />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">当前筛选权限</div>
              <div className="text-xl font-semibold">{pagination.total}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <ShieldCheck />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页启用</div>
              <div className="text-xl font-semibold">{activeCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Power />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页停用</div>
              <div className="text-xl font-semibold">{inactiveCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-warning text-warning-foreground">
              <Layers3 />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页模块</div>
              <div className="text-xl font-semibold">{moduleCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>权限点列表</CardTitle>
              <CardDescription>
                筛选条件作用于下方权限点表格，当前共 {pagination.total} 条记录。
              </CardDescription>
            </div>
            {pending ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新
              </Badge>
            ) : (
              <Badge variant="outline">
                第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
              </Badge>
            )}
          </div>
          <PermissionFilters
            status={status}
            module={module}
            keyword={keyword}
            pending={pending}
            onNavigate={navigate}
          />
        </CardHeader>
        <CardContent className="relative flex flex-col gap-4 p-0">
          <PermissionsTable permissions={permissions} />
          {pending ? (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新列表
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 px-4 pb-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              每页 {pagination.pageSize} 条，共 {pagination.total} 条
            </div>
            <PermissionsPagination
              pagination={pagination}
              status={status}
              module={module}
              keyword={keyword}
              pending={pending}
              onNavigate={navigate}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
