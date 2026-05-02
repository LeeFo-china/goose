"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
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
  const [selectedCampaignType, setSelectedCampaignType] = useState(campaignType);
  const [selectedStatus, setSelectedStatus] = useState(status);

  useEffect(() => {
    setSelectedCampaignType(campaignType);
    setSelectedStatus(status);
  }, [campaignType, status]);

  return (
    <form
      action="/marketing"
      method="get"
      className="grid gap-3 lg:grid-cols-[150px_150px_1fr_72px]"
    >
      <input type="hidden" name="campaign_type" value={selectedCampaignType} />
      <input type="hidden" name="status" value={selectedStatus} />
      <FormSelect
        id="marketing-campaign-type-filter"
        value={selectedCampaignType || "__all"}
        options={[
          { value: "__all", label: "全部类型" },
          ...campaignTypeOptions.map(([value, label]) => ({ value, label })),
        ]}
        onChange={(value) => setSelectedCampaignType(value === "__all" ? "" : value)}
      />
      <FormSelect
        id="marketing-status-filter"
        value={selectedStatus || "__all"}
        options={[
          { value: "__all", label: "全部状态" },
          ...campaignStatusOptions.map(([value, label]) => ({ value, label })),
        ]}
        onChange={(value) => setSelectedStatus(value === "__all" ? "" : value)}
      />
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
