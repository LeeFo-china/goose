"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { EmployeeStatus } from "@gooes/domain";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  EmployeeSearchForm,
  EmployeesPagination,
  EmployeesStatusFilters,
  EmployeesStructuredFilters,
} from "@/components/employees/employee-list-actions";
import {
  EmployeesTable,
  type EmployeeRecord,
} from "@/components/employees/employees-table";
import type {
  EmployeeDepartmentOption,
  EmployeePostOption,
} from "@/components/employees/employee-mutations";
import type { RoleOption } from "@/components/employees/employee-mutation-shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type StatusOption = {
  label: string;
  value: "" | EmployeeStatus;
};

export function EmployeesClientShell({
  employees,
  pagination,
  status,
  keyword,
  tenantDepartmentId,
  postId,
  roleId,
  error,
  statusOptions,
  departments,
  posts,
  roles,
}: {
  employees: EmployeeRecord[];
  pagination: Pagination;
  status: string;
  keyword: string;
  tenantDepartmentId: string;
  postId: string;
  roleId: string;
  error: string | null;
  statusOptions: StatusOption[];
  departments: EmployeeDepartmentOption[];
  posts: EmployeePostOption[];
  roles: RoleOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }

  function refreshEmployees() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-2 xl:flex-row xl:flex-wrap xl:items-center">
              <EmployeesStatusFilters
                options={statusOptions}
                currentStatus={status}
                keyword={keyword}
                tenantDepartmentId={tenantDepartmentId}
                postId={postId}
                roleId={roleId}
                pending={pending}
                onNavigate={navigate}
              />
              <EmployeesStructuredFilters
                status={status}
                keyword={keyword}
                tenantDepartmentId={tenantDepartmentId}
                postId={postId}
                roleId={roleId}
                departments={departments}
                posts={posts}
                roles={roles}
                pending={pending}
                onNavigate={navigate}
              />
            </div>
            <EmployeeSearchForm
              status={status}
              keyword={keyword}
              tenantDepartmentId={tenantDepartmentId}
              postId={postId}
              roleId={roleId}
              pending={pending}
              onNavigate={navigate}
            />
          </div>
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <EmployeesTable
              employees={employees}
              departments={departments}
              posts={posts}
              onEmployeeChanged={refreshEmployees}
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
              {pending ? (
                <Badge variant="secondary">
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                  正在更新
                </Badge>
              ) : (
                <Badge variant="outline" className="tabular-nums">
                  第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
                </Badge>
              )}
              <span className="tabular-nums">
                当前显示 {employees.length} 条，共 {pagination.total} 条
              </span>
            </div>
            <EmployeesPagination
              pagination={pagination}
              status={status}
              keyword={keyword}
              tenantDepartmentId={tenantDepartmentId}
              postId={postId}
              roleId={roleId}
              pending={pending}
              onNavigate={navigate}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
