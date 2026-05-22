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
    <>
      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex justify-end">
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
        <CardContent className="relative flex flex-col gap-4 p-0">
          <CustomersTable customers={customers} />
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
    </>
  );
}
