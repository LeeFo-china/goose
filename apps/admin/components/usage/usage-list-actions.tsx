"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Pagination } from "@/components/usage/usage-types";

export type UsageTab = "summary" | "ai" | "sms" | "social_video";

const statusOptions = [
  { value: "__all", label: "全部状态" },
  { value: "success", label: "成功" },
  { value: "failure", label: "失败" },
] as const;

const smsStatusOptions = [
  ...statusOptions,
  { value: "mock", label: "模拟发送" },
  { value: "disabled", label: "服务禁用" },
] as const;

const socialVideoStatusOptions = [
  { value: "__all", label: "全部状态" },
  { value: "completed", label: "完成" },
  { value: "failed", label: "失败" },
  { value: "pending", label: "排队" },
  { value: "resolving", label: "解析中" },
  { value: "downloading", label: "下载中" },
  { value: "extracting_audio", label: "提取音频" },
  { value: "creating_asr_task", label: "创建识别" },
  { value: "transcribing", label: "识别中" },
] as const;

const socialVideoBillableOptions = [
  { value: "__all", label: "全部计费" },
  { value: "true", label: "计费" },
  { value: "false", label: "不计费" },
] as const;

function buildUsageHref(input: {
  basePath: string;
  tab?: UsageTab;
  page?: number;
  aiPage?: number;
  smsPage?: number;
  socialVideoPage?: number;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  tenantId?: string;
  aiStatus?: string;
  smsStatus?: string;
  socialVideoStatus?: string;
  socialVideoBillable?: string;
}) {
  const params = new URLSearchParams();
  if (input.tab && input.tab !== "summary") params.set("tab", input.tab);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.aiPage && input.aiPage > 1) params.set("aiPage", String(input.aiPage));
  if (input.smsPage && input.smsPage > 1) params.set("smsPage", String(input.smsPage));
  if (input.socialVideoPage && input.socialVideoPage > 1) params.set("socialVideoPage", String(input.socialVideoPage));
  if (input.dateFrom) params.set("date_from", input.dateFrom);
  if (input.dateTo) params.set("date_to", input.dateTo);
  if (input.keyword) params.set("keyword", input.keyword);
  if (input.tenantId) params.set("tenant_id", input.tenantId);
  if (input.aiStatus && input.aiStatus !== "__all") params.set("ai_status", input.aiStatus);
  if (input.smsStatus && input.smsStatus !== "__all") params.set("sms_status", input.smsStatus);
  if (input.socialVideoStatus && input.socialVideoStatus !== "__all") {
    params.set("social_video_status", input.socialVideoStatus);
  }
  if (input.socialVideoBillable && input.socialVideoBillable !== "__all") {
    params.set("social_video_billable", input.socialVideoBillable);
  }
  const query = params.toString();
  return query ? `${input.basePath}?${query}` : input.basePath;
}

export function UsageTabsNav({
  basePath,
  tab,
  dateFrom,
  dateTo,
  keyword,
  tenantId,
  aiStatus,
  smsStatus,
  socialVideoStatus,
  socialVideoBillable,
  summaryLabel = "租户汇总",
}: {
  basePath: string;
  tab: UsageTab;
  dateFrom: string;
  dateTo: string;
  keyword?: string;
  tenantId?: string;
  aiStatus?: string;
  smsStatus?: string;
  socialVideoStatus?: string;
  socialVideoBillable?: string;
  summaryLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTab(value: string) {
    const nextTab = value as UsageTab;
    startTransition(() => {
      router.push(buildUsageHref({
        basePath,
        tab: nextTab,
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
    <Tabs value={tab} onValueChange={switchTab}>
      <TabsList>
        <TabsTrigger value="summary" disabled={pending}>{summaryLabel}</TabsTrigger>
        <TabsTrigger value="ai" disabled={pending}>AI 明细</TabsTrigger>
        <TabsTrigger value="sms" disabled={pending}>短信明细</TabsTrigger>
        <TabsTrigger value="social_video" disabled={pending}>短视频明细</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function UsageFilters({
  basePath,
  tab,
  dateFrom,
  dateTo,
  keyword = "",
  tenantId = "",
  aiStatus = "__all",
  smsStatus = "__all",
  socialVideoStatus = "__all",
  socialVideoBillable = "__all",
  showKeyword = false,
  showTenantId = false,
}: {
  basePath: string;
  tab: UsageTab;
  dateFrom: string;
  dateTo: string;
  keyword?: string;
  tenantId?: string;
  aiStatus?: string;
  smsStatus?: string;
  socialVideoStatus?: string;
  socialVideoBillable?: string;
  showKeyword?: boolean;
  showTenantId?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nextDateFrom, setNextDateFrom] = useState(dateFrom);
  const [nextDateTo, setNextDateTo] = useState(dateTo);
  const [nextKeyword, setNextKeyword] = useState(keyword);
  const [nextTenantId, setNextTenantId] = useState(tenantId);
  const [nextAiStatus, setNextAiStatus] = useState(aiStatus || "__all");
  const [nextSmsStatus, setNextSmsStatus] = useState(smsStatus || "__all");
  const [nextSocialVideoStatus, setNextSocialVideoStatus] = useState(socialVideoStatus || "__all");
  const [nextSocialVideoBillable, setNextSocialVideoBillable] = useState(socialVideoBillable || "__all");

  useEffect(() => {
    setNextDateFrom(dateFrom);
    setNextDateTo(dateTo);
    setNextKeyword(keyword);
    setNextTenantId(tenantId);
    setNextAiStatus(aiStatus || "__all");
    setNextSmsStatus(smsStatus || "__all");
    setNextSocialVideoStatus(socialVideoStatus || "__all");
    setNextSocialVideoBillable(socialVideoBillable || "__all");
  }, [aiStatus, dateFrom, dateTo, keyword, smsStatus, socialVideoBillable, socialVideoStatus, tenantId]);

  function navigate(input?: Partial<{
    dateFrom: string;
    dateTo: string;
    keyword: string;
    tenantId: string;
    aiStatus: string;
    smsStatus: string;
    socialVideoStatus: string;
    socialVideoBillable: string;
  }>) {
    startTransition(() => {
      router.push(buildUsageHref({
        basePath,
        tab,
        dateFrom: input?.dateFrom ?? nextDateFrom,
        dateTo: input?.dateTo ?? nextDateTo,
        keyword: showKeyword ? (input?.keyword ?? nextKeyword).trim() : "",
        tenantId: showTenantId ? (input?.tenantId ?? nextTenantId).trim() : "",
        aiStatus: input?.aiStatus ?? nextAiStatus,
        smsStatus: input?.smsStatus ?? nextSmsStatus,
        socialVideoStatus: input?.socialVideoStatus ?? nextSocialVideoStatus,
        socialVideoBillable: input?.socialVideoBillable ?? nextSocialVideoBillable,
      }));
      router.refresh();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate();
  }

  return (
    <form className="grid gap-3 lg:grid-cols-[160px_160px_1fr_180px_160px_80px]" onSubmit={submit}>
      <InputGroup>
        <InputGroupInput
          type="date"
          value={nextDateFrom}
          disabled={pending}
          aria-label="开始日期"
          onChange={(event) => {
            const value = event.target.value;
            setNextDateFrom(value);
            navigate({ dateFrom: value });
          }}
        />
      </InputGroup>
      <InputGroup>
        <InputGroupInput
          type="date"
          value={nextDateTo}
          disabled={pending}
          aria-label="结束日期"
          onChange={(event) => {
            const value = event.target.value;
            setNextDateTo(value);
            navigate({ dateTo: value });
          }}
        />
      </InputGroup>
      {showKeyword ? (
        <InputGroup>
          <InputGroupAddon>
            <Search data-icon="inline-start" />
          </InputGroupAddon>
          <InputGroupInput
            value={nextKeyword}
            placeholder="搜索租户名称或 slug"
            disabled={pending}
            onChange={(event) => setNextKeyword(event.target.value)}
          />
          {nextKeyword ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="button"
                size="icon-xs"
                disabled={pending}
                onClick={() => {
                  setNextKeyword("");
                  navigate({ keyword: "" });
                }}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      ) : showTenantId ? (
        <InputGroup>
          <InputGroupInput
            value={nextTenantId}
            placeholder="按租户 ID 过滤"
            disabled={pending}
            onChange={(event) => setNextTenantId(event.target.value)}
          />
          {nextTenantId ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="button"
                size="icon-xs"
                disabled={pending}
                onClick={() => {
                  setNextTenantId("");
                  navigate({ tenantId: "" });
                }}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      ) : (
        <div />
      )}
      {tab === "ai" ? (
        <FormSelect
          id="usage-ai-status-filter"
          value={nextAiStatus}
          options={statusOptions}
          disabled={pending}
          onChange={(value) => {
            setNextAiStatus(value);
            navigate({ aiStatus: value });
          }}
        />
      ) : tab === "sms" ? (
        <FormSelect
          id="usage-sms-status-filter"
          value={nextSmsStatus}
          options={smsStatusOptions}
          disabled={pending}
          onChange={(value) => {
            setNextSmsStatus(value);
            navigate({ smsStatus: value });
          }}
        />
      ) : tab === "social_video" ? (
        <FormSelect
          id="usage-social-video-status-filter"
          value={nextSocialVideoStatus}
          options={socialVideoStatusOptions}
          disabled={pending}
          onChange={(value) => {
            setNextSocialVideoStatus(value);
            navigate({ socialVideoStatus: value });
          }}
        />
      ) : (
        <div />
      )}
      {tab === "social_video" ? (
        <FormSelect
          id="usage-social-video-billable-filter"
          value={nextSocialVideoBillable}
          options={socialVideoBillableOptions}
          disabled={pending}
          onChange={(value) => {
            setNextSocialVideoBillable(value);
            navigate({ socialVideoBillable: value });
          }}
        />
      ) : (
        <div />
      )}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        筛选
      </Button>
    </form>
  );
}

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
