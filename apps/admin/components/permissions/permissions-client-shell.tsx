"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  PermissionFilters,
  PermissionsPagination,
} from "@/components/permissions/permission-list-actions";
import { type PermissionRecord } from "@/components/permissions/permission-mutations";
import { PermissionsTable } from "@/components/permissions/permissions-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

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
  canManageDefinitions = false,
}: {
  permissions: PermissionRecord[];
  pagination: Pagination;
  status: string;
  module: string;
  keyword: string;
  error: string | null;
  canManageDefinitions?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>权限点列表</span>
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
        <CardContent className="relative flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <PermissionsTable
              permissions={permissions}
              canManageDefinitions={canManageDefinitions}
            />
          </div>
          {pending ? (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新列表
              </div>
            </div>
          ) : null}
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>当前显示 {permissions.length} 条，共 {pagination.total} 条</span>
              <Badge variant="outline" className="tabular-nums">
                第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
              </Badge>
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
    </div>
  );
}
