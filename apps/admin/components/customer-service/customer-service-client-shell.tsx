"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  CustomerServiceFilters,
  CustomerServicePagination,
} from "@/components/customer-service/customer-service-list-actions";
import { CustomerServiceDetailDialog } from "@/components/customer-service/customer-service-detail-dialog";
import { CustomerServiceTable } from "@/components/customer-service/customer-service-table";
import type {
  CustomerServicePagination as PaginationMeta,
  CustomerServiceTicket,
} from "@/components/customer-service/customer-service-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function CustomerServiceClientShell({
  tickets,
  pagination,
  status,
  category,
  keyword,
  initialTicketId,
  error,
}: {
  tickets: CustomerServiceTicket[];
  pagination: PaginationMeta;
  status: string;
  category: string;
  keyword: string;
  initialTicketId: string;
  error: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTicketId) {
      setDetailTicketId(initialTicketId);
    }
  }, [initialTicketId]);

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }

  function refreshList() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <CustomerServiceFilters
            status={status}
            category={category}
            keyword={keyword}
            pending={pending}
            onNavigate={navigate}
          />
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <CustomerServiceTable
              tickets={tickets}
              onOpenDetail={setDetailTicketId}
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
              <span>当前显示 {tickets.length} 条，共 {pagination.total} 条</span>
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
            <CustomerServicePagination
              pagination={pagination}
              status={status}
              category={category}
              keyword={keyword}
              pending={pending}
              onNavigate={navigate}
            />
          </div>
        </CardContent>
      </Card>

      <CustomerServiceDetailDialog
        ticketId={detailTicketId}
        open={Boolean(detailTicketId)}
        onOpenChange={(open) => {
          if (!open) setDetailTicketId(null);
        }}
        onChanged={refreshList}
      />
    </div>
  );
}
