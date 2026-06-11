"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  CustomerFilters,
  CustomersPagination,
} from "@/components/customers/customer-list-actions";
import { type CustomerRecord } from "@/components/customers/customer-mutations";
import { CustomersTable } from "@/components/customers/customers-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function CustomersClientShell({
  customers,
  pagination,
  status,
  source,
  customerOrigin,
  keyword,
  follow,
  error,
}: {
  customers: CustomerRecord[];
  pagination: Pagination;
  status: string;
  source: string;
  customerOrigin: string;
  keyword: string;
  follow: string;
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <CustomerFilters
            status={status}
            source={source}
            customerOrigin={customerOrigin}
            keyword={keyword}
            follow={follow}
            pending={pending}
            onNavigate={navigate}
          />
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <CustomersTable customers={customers} />
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
              <span className="tabular-nums">当前显示 {customers.length} 条，共 {pagination.total} 条</span>
            </div>
            <CustomersPagination
              pagination={pagination}
              status={status}
              source={source}
              customerOrigin={customerOrigin}
              keyword={keyword}
              follow={follow}
              pending={pending}
              onNavigate={navigate}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
