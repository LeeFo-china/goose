"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Pagination } from "@/components/usage/usage-types";
import { buildUsageHref, type UsageTab } from "@/components/usage/usage-list-navigation";

export function UsagePagination({
  basePath,
  pagination,
  pageKey,
  tab,
  dateFrom,
  dateTo,
  keyword,
  tenantId,
  aiStatus,
  smsStatus,
  socialVideoStatus,
  socialVideoBillable,
  unit,
}: {
  basePath: string;
  pagination: Pagination;
  pageKey: "page" | "aiPage" | "smsPage" | "socialVideoPage";
  tab: UsageTab;
  dateFrom: string;
  dateTo: string;
  keyword?: string;
  tenantId?: string;
  aiStatus?: string;
  smsStatus?: string;
  socialVideoStatus?: string;
  socialVideoBillable?: string;
  unit: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const totalPages = Math.max(1, pagination.totalPages || 1);
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= totalPages || pending;

  function navigate(page: number) {
    startTransition(() => {
      router.push(buildUsageHref({
        basePath,
        tab,
        page: pageKey === "page" ? page : undefined,
        aiPage: pageKey === "aiPage" ? page : undefined,
        smsPage: pageKey === "smsPage" ? page : undefined,
        socialVideoPage: pageKey === "socialVideoPage" ? page : undefined,
        dateFrom,
        dateTo,
        keyword,
        tenantId,
        aiStatus,
        smsStatus,
        socialVideoStatus,
        socialVideoBillable,
      }));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">
        第 {pagination.page} / {totalPages} 页，共 {pagination.total} {unit}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={previousDisabled}
          onClick={() => navigate(Math.max(1, pagination.page - 1))}
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronLeft data-icon="inline-start" />}
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={nextDisabled}
          onClick={() => navigate(pagination.page + 1)}
        >
          下一页
          {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
        </Button>
      </div>
    </div>
  );
}
