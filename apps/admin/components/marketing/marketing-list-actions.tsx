"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  campaignStatusOptions,
  campaignTypeOptions,
} from "@/components/marketing/marketing-constants";
import type { Pagination } from "@/components/marketing/marketing-types";

function buildMarketingHref(input: {
  page?: number;
  campaignType?: string;
  status?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.campaignType) params.set("campaign_type", input.campaignType);
  if (input.status) params.set("status", input.status);
  if (input.keyword) params.set("keyword", input.keyword);
  const query = params.toString();
  return query ? `/marketing?${query}` : "/marketing";
}

function useMarketingNavigation() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }

  return { pending, navigate };
}

export function MarketingFilters({
  campaignType,
  status,
  keyword,
}: {
  campaignType: string;
  status: string;
  keyword: string;
}) {
  return (
    <form
      action="/marketing"
      method="get"
      className="grid gap-3 lg:grid-cols-[150px_150px_1fr_72px]"
    >
      <select
        name="campaign_type"
        defaultValue={campaignType}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">全部类型</option>
        {campaignTypeOptions.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <select
        name="status"
        defaultValue={status}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">全部状态</option>
        {campaignStatusOptions.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="keyword"
          defaultValue={keyword}
          placeholder="搜索活动名称"
          className="pl-9"
        />
      </div>
      <Button type="submit" variant="outline">
        搜索
      </Button>
    </form>
  );
}

export function MarketingPagination({
  pagination,
  campaignType,
  status,
  keyword,
}: {
  pagination: Pagination;
  campaignType: string;
  status: string;
  keyword: string;
}) {
  const { pending, navigate } = useMarketingNavigation();
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= pagination.totalPages || pending;

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={previousDisabled}
        onClick={() => navigate(buildMarketingHref({
          page: Math.max(1, pagination.page - 1),
          campaignType,
          status,
          keyword,
        }))}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronLeft data-icon="inline-start" />}
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={nextDisabled}
        onClick={() => navigate(buildMarketingHref({
          page: pagination.page + 1,
          campaignType,
          status,
          keyword,
        }))}
      >
        下一页
        {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
      </Button>
    </div>
  );
}
