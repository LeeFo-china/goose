"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildUsageHref,
  smsStatusOptions,
  socialVideoBillableOptions,
  socialVideoStatusOptions,
  statusOptions,
  type UsageTab,
} from "@/components/usage/usage-list-navigation";

export type { UsageTab } from "@/components/usage/usage-list-navigation";
export { UsagePagination } from "@/components/usage/usage-pagination";

const filterControlClassName = "h-9 bg-card";
const filterSelectClassName = "h-9 min-w-0 bg-card shadow-none";

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
  summaryLabel = "用量概览",
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

  const queryClassName = tab === "summary"
    ? "col-span-2 h-9 bg-card xl:col-span-3"
    : "col-span-2 h-9 bg-card xl:col-span-1";
  const actionClassName = tab === "summary"
    ? "col-span-2 h-9 w-full bg-card sm:col-span-1"
    : "h-9 w-full bg-card";

  return (
    <form
      className="grid grid-cols-2 gap-2 xl:grid-cols-[160px_160px_minmax(220px,1fr)_180px_160px_72px]"
      onSubmit={submit}
    >
      <InputGroup className={filterControlClassName}>
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
      <InputGroup className={filterControlClassName}>
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
        <InputGroup className={queryClassName}>
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
      ) : null}
      {showTenantId ? (
        <InputGroup className={queryClassName}>
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
      ) : null}
      {tab === "ai" ? (
        <UsageFilterSelect
          id="usage-ai-status-filter"
          ariaLabel="AI 明细状态"
          value={nextAiStatus}
          options={statusOptions}
          disabled={pending}
          onChange={(value) => {
            setNextAiStatus(value);
            navigate({ aiStatus: value });
          }}
        />
      ) : null}
      {tab === "sms" ? (
        <UsageFilterSelect
          id="usage-sms-status-filter"
          ariaLabel="短信明细状态"
          value={nextSmsStatus}
          options={smsStatusOptions}
          disabled={pending}
          onChange={(value) => {
            setNextSmsStatus(value);
            navigate({ smsStatus: value });
          }}
        />
      ) : null}
      {tab === "social_video" ? (
        <>
          <UsageFilterSelect
            id="usage-social-video-status-filter"
            ariaLabel="短视频明细状态"
            value={nextSocialVideoStatus}
            options={socialVideoStatusOptions}
            disabled={pending}
            onChange={(value) => {
              setNextSocialVideoStatus(value);
              navigate({ socialVideoStatus: value });
            }}
          />
          <UsageFilterSelect
            id="usage-social-video-billable-filter"
            ariaLabel="短视频计费状态"
            value={nextSocialVideoBillable}
            options={socialVideoBillableOptions}
            disabled={pending}
            onChange={(value) => {
              setNextSocialVideoBillable(value);
              navigate({ socialVideoBillable: value });
            }}
          />
        </>
      ) : null}
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className={actionClassName}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        筛选
      </Button>
    </form>
  );
}

function UsageFilterSelect({
  id,
  ariaLabel,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  ariaLabel: string;
  value: string;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={filterSelectClassName}>
        <SelectValue placeholder="请选择" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
