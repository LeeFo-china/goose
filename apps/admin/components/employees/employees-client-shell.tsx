"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BadgeCheck, Loader2, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import type { EmployeeStatus } from "@gooes/domain";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  EmployeeSearchForm,
  EmployeesPagination,
  EmployeesStatusFilters,
} from "@/components/employees/employee-list-actions";
import {
  EmployeesTable,
  type EmployeeRecord,
} from "@/components/employees/employees-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  error,
  statusOptions,
}: {
  employees: EmployeeRecord[];
  pagination: Pagination;
  status: string;
  keyword: string;
  error: string | null;
  statusOptions: StatusOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }
  const activeCount = employees.filter((employee) => employee.status === "active").length;
  const pendingCount = employees.filter((employee) => employee.status === "pending").length;
  const boundAccountCount = employees.filter((employee) => Boolean(employee.user_id)).length;

  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <UsersRound />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">当前筛选员工</div>
              <div className="text-xl font-semibold">{pagination.total}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <BadgeCheck />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页在职</div>
              <div className="text-xl font-semibold">{activeCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <UserRound />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页待入职</div>
              <div className="text-xl font-semibold">{pendingCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-warning text-warning-foreground">
              <ShieldCheck />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页已绑定登录</div>
              <div className="text-xl font-semibold">{boundAccountCount}</div>
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
              <CardTitle>员工列表</CardTitle>
              <CardDescription>
                筛选条件作用于下方员工表格，当前共 {pagination.total} 条记录。
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
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <EmployeesStatusFilters
              options={statusOptions}
              currentStatus={status}
              keyword={keyword}
              pending={pending}
              onNavigate={navigate}
            />
            <EmployeeSearchForm
              status={status}
              keyword={keyword}
              pending={pending}
              onNavigate={navigate}
            />
          </div>
        </CardHeader>
        <CardContent className="relative flex flex-col gap-4 p-0">
          <EmployeesTable employees={employees} />
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
            <EmployeesPagination
              pagination={pagination}
              status={status}
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
