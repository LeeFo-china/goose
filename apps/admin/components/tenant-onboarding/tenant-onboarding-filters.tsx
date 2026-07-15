"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import type {
  ServiceProviderPublicationStatus,
  TenantOnboardingApplicationStatus,
  TenantOnboardingPartnerAssistStatus,
} from "@/components/tenant-onboarding/tenant-onboarding-types";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

export type TenantOnboardingTab = "applications" | "publications";

const applicationStatusOptions = [
  { value: "__all", label: "全部申请状态" },
  { value: "submitted", label: "待审核" },
  { value: "reviewing", label: "审核中" },
  { value: "supplement_required", label: "待补充" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
  { value: "withdrawn", label: "已撤回" },
] satisfies ReadonlyArray<{ value: TenantOnboardingApplicationStatus | "__all"; label: string }>;

const assistStatusOptions = [
  { value: "__all", label: "全部协查状态" },
  { value: "not_applicable", label: "无需协查" },
  { value: "pending", label: "协查中" },
  { value: "verified", label: "已核验" },
  { value: "supplement_suggested", label: "建议补充" },
  { value: "not_recommended", label: "不建议入驻" },
  { value: "expired", label: "协查已过期" },
] satisfies ReadonlyArray<{ value: TenantOnboardingPartnerAssistStatus | "__all"; label: string }>;

const publicationStatusOptions = [
  { value: "__all", label: "全部发布状态" },
  { value: "draft", label: "草稿" },
  { value: "pending_review", label: "待发布审核" },
  { value: "published", label: "展示中" },
  { value: "suspended", label: "已暂停" },
] satisfies ReadonlyArray<{ value: ServiceProviderPublicationStatus | "__all"; label: string }>;

type FilterProps = {
  tab: TenantOnboardingTab;
  status: string;
  assistStatus: string;
  candidatePartnerId: string;
  keyword: string;
  regionCode: string;
};

export function TenantOnboardingFilters(props: FilterProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(props.status || "__all");
  const [assistStatus, setAssistStatus] = useState(props.assistStatus || "__all");
  const [candidatePartnerId, setCandidatePartnerId] = useState(props.candidatePartnerId);
  const [keyword, setKeyword] = useState(props.keyword);
  const [regionCode, setRegionCode] = useState(props.regionCode);

  useEffect(() => {
    setStatus(props.status || "__all");
    setAssistStatus(props.assistStatus || "__all");
    setCandidatePartnerId(props.candidatePartnerId);
    setKeyword(props.keyword);
    setRegionCode(props.regionCode);
  }, [
    props.assistStatus,
    props.candidatePartnerId,
    props.keyword,
    props.regionCode,
    props.status,
    props.tab,
  ]);

  function navigate(overrides: Partial<Omit<FilterProps, "tab">> = {}) {
    startTransition(() => {
      const pageSize = new URLSearchParams(window.location.search).get("pageSize") || "";
      router.push(buildTenantOnboardingHref({
        tab: props.tab,
        status: overrides.status ?? status,
        assistStatus: overrides.assistStatus ?? assistStatus,
        candidatePartnerId: overrides.candidatePartnerId ?? candidatePartnerId,
        keyword: overrides.keyword ?? keyword,
        regionCode: overrides.regionCode ?? regionCode,
        pageSize,
      }));
      router.refresh();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate();
  }

  const statusOptions = props.tab === "applications"
    ? applicationStatusOptions
    : publicationStatusOptions;

  return (
    <form className="flex flex-wrap items-center gap-3" onSubmit={submit}>
      <label className="sr-only" htmlFor="tenant-onboarding-status-filter">
        {props.tab === "applications" ? "申请状态" : "发布状态"}
      </label>
      <FormSelect
        id="tenant-onboarding-status-filter"
        value={status}
        options={statusOptions}
        disabled={pending}
        triggerClassName="w-full sm:w-44"
        onChange={(value) => {
          setStatus(value);
          navigate({ status: value });
        }}
      />
      {props.tab === "applications" ? (
        <>
          <label className="sr-only" htmlFor="tenant-onboarding-assist-filter">
            城市合伙人协查状态
          </label>
          <FormSelect
            id="tenant-onboarding-assist-filter"
            value={assistStatus}
            options={assistStatusOptions}
            disabled={pending}
            triggerClassName="w-full sm:w-44"
            onChange={(value) => {
              setAssistStatus(value);
              navigate({ assistStatus: value });
            }}
          />
          <InputGroup className="w-full sm:w-36">
            <InputGroupInput
              value={regionCode}
              inputMode="numeric"
              maxLength={6}
              aria-label="服务区域行政区划代码"
              placeholder="区域代码"
              disabled={pending}
              onChange={(event) => setRegionCode(event.target.value)}
            />
          </InputGroup>
          <InputGroup className="w-full sm:w-56">
            <InputGroupInput
              value={candidatePartnerId}
              aria-label="候选城市合伙人 ID"
              placeholder="候选合伙人 ID"
              disabled={pending}
              onChange={(event) => setCandidatePartnerId(event.target.value)}
            />
          </InputGroup>
        </>
      ) : null}
      <InputGroup className="min-w-[240px] flex-1">
        <InputGroupAddon>
          <Search data-icon="inline-start" />
        </InputGroupAddon>
        <InputGroupInput
          value={keyword}
          maxLength={120}
          aria-label={props.tab === "applications" ? "搜索入驻申请" : "搜索公开发布资料"}
          placeholder={props.tab === "applications"
            ? "搜索申请编号、公司、手机号或信用代码"
            : "搜索公司或公开名称"}
          disabled={pending}
          onChange={(event) => setKeyword(event.target.value)}
        />
        {keyword ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              aria-label="清空关键词"
              disabled={pending}
              onClick={() => {
                setKeyword("");
                navigate({ keyword: "" });
              }}
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        筛选
      </Button>
    </form>
  );
}

export function buildTenantOnboardingHref(input: {
  tab: TenantOnboardingTab;
  status?: string;
  assistStatus?: string;
  candidatePartnerId?: string;
  keyword?: string;
  regionCode?: string;
  pageSize?: string;
}) {
  const query = new URLSearchParams();
  if (input.tab !== "applications") query.set("tab", input.tab);
  if (input.pageSize) query.set("pageSize", input.pageSize);
  appendFilter(query, "status", input.status);
  if (input.tab === "applications") {
    appendFilter(query, "assist_status", input.assistStatus);
    appendFilter(query, "candidate_partner_id", input.candidatePartnerId);
    appendFilter(query, "region_code", input.regionCode);
  }
  appendFilter(query, "keyword", input.keyword);
  const value = query.toString();
  return value
    ? `/platform/tenant-onboarding?${value}`
    : "/platform/tenant-onboarding";
}

function appendFilter(query: URLSearchParams, key: string, value?: string) {
  const normalized = value?.trim();
  if (normalized && normalized !== "__all") query.set(key, normalized);
}
