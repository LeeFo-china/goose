"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  CUSTOMER_ORIGIN_VALUES,
  CUSTOMER_SOURCE_VALUES,
  CUSTOMER_STATUS_VALUES,
  CustomerOriginConfig,
  CustomerSourceConfig,
  CustomerStatusConfig,
} from "@gooes/domain";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type Navigate = (href: string) => void;

const statusOptions = [
  ["", "全部状态"],
  ...CUSTOMER_STATUS_VALUES.map((value) => [
    value,
    CustomerStatusConfig[value].label,
  ] as const),
] as const;

const sourceOptions = [
  ["", "全部来源"],
  ...CUSTOMER_SOURCE_VALUES.map((value) => [
    value,
    CustomerSourceConfig[value].label,
  ] as const),
] as const;

const originOptions = [
  ["", "全部渠道"],
  ...CUSTOMER_ORIGIN_VALUES.map((value) => [
    value,
    CustomerOriginConfig[value].label,
  ] as const),
] as const;

const flatControlClassName = "bg-card shadow-none";

export function buildCustomersHref(input: {
  page?: number;
  pageSize?: number;
  status?: string;
  source?: string;
  customerOrigin?: string;
  keyword?: string;
  follow?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.pageSize && input.pageSize > 0) {
    params.set("pageSize", String(input.pageSize));
  }
  if (input.status) params.set("status", input.status);
  if (input.source) params.set("source", input.source);
  if (input.customerOrigin) params.set("customer_origin", input.customerOrigin);
  if (input.keyword) params.set("keyword", input.keyword);
  if (input.follow) params.set("follow", input.follow);
  const query = params.toString();
  return query ? `/customers?${query}` : "/customers";
}

export function CustomerFilters({
  status,
  source,
  customerOrigin,
  keyword,
  follow,
  pageSize,
  pending,
  onNavigate,
}: {
  status: string;
  source: string;
  customerOrigin: string;
  keyword: string;
  follow: string;
  pageSize: number;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [selectedSource, setSelectedSource] = useState(source);
  const [selectedOrigin, setSelectedOrigin] = useState(customerOrigin);
  const [selectedFollow, setSelectedFollow] = useState(follow);
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedStatus(status);
    setSelectedSource(source);
    setSelectedOrigin(customerOrigin);
    setSelectedFollow(follow);
    setSelectedKeyword(keyword);
  }, [customerOrigin, follow, keyword, source, status]);

  function applySelectFilters(input: {
    status?: string;
    source?: string;
    customerOrigin?: string;
    follow?: string;
  }) {
    onNavigate(buildCustomersHref({
      pageSize,
      status: input.status ?? status,
      source: input.source ?? source,
      customerOrigin: input.customerOrigin ?? customerOrigin,
      follow: input.follow ?? follow,
      keyword,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNavigate(buildCustomersHref({
      pageSize,
      status: selectedStatus,
      source: selectedSource,
      customerOrigin: selectedOrigin,
      follow: selectedFollow,
      keyword: selectedKeyword.trim(),
    }));
  }

  return (
    <form className="grid gap-2 md:grid-cols-2 xl:grid-cols-[140px_140px_140px_150px_minmax(260px,1fr)_72px]" onSubmit={submit}>
      <input type="hidden" name="status" value={selectedStatus} />
      <input type="hidden" name="source" value={selectedSource} />
      <input type="hidden" name="customer_origin" value={selectedOrigin} />
      <input type="hidden" name="follow" value={selectedFollow} />
      <FormSelect
        id="customer-status-filter"
        value={selectedStatus || "__all"}
        disabled={pending}
        triggerClassName={flatControlClassName}
        options={statusOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => {
          const nextStatus = value === "__all" ? "" : value;
          setSelectedStatus(nextStatus);
          applySelectFilters({ status: nextStatus });
        }}
      />
      <FormSelect
        id="customer-source-filter"
        value={selectedSource || "__all"}
        disabled={pending}
        triggerClassName={flatControlClassName}
        options={sourceOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => {
          const nextSource = value === "__all" ? "" : value;
          setSelectedSource(nextSource);
          applySelectFilters({ source: nextSource });
        }}
      />
      <FormSelect
        id="customer-origin-filter"
        value={selectedOrigin || "__all"}
        disabled={pending}
        triggerClassName={flatControlClassName}
        options={originOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => {
          const nextOrigin = value === "__all" ? "" : value;
          setSelectedOrigin(nextOrigin);
          applySelectFilters({ customerOrigin: nextOrigin });
        }}
      />
      <FormSelect
        id="customer-follow-filter"
        value={selectedFollow || "__all"}
        disabled={pending}
        triggerClassName={flatControlClassName}
        options={[
          { value: "__all", label: "全部跟进" },
          { value: "due", label: "待跟进" },
          { value: "overdue", label: "超期未跟进" },
        ]}
        onChange={(value) => {
          const nextFollow = value === "__all" ? "" : value;
          setSelectedFollow(nextFollow);
          applySelectFilters({ follow: nextFollow });
        }}
      />
      <InputGroup className="h-9 bg-card">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索姓名、手机号或来源"
          disabled={pending}
          onChange={(event) => setSelectedKeyword(event.target.value)}
        />
        {selectedKeyword ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="清除搜索内容"
              size="icon-xs"
              disabled={pending}
              onClick={() => setSelectedKeyword("")}
            >
              <X aria-hidden="true" />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <Button type="submit" variant="outline" disabled={pending} className="w-full bg-card">
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        搜索
      </Button>
    </form>
  );
}

export function CustomersPagination({
  pagination,
  status,
  source,
  customerOrigin,
  keyword,
  follow,
  pageSize,
  pending,
  onNavigate,
}: {
  pagination: Pagination;
  status: string;
  source: string;
  customerOrigin: string;
  keyword: string;
  follow: string;
  pageSize: number;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= pagination.totalPages || pending;

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={previousDisabled}
        onClick={() => onNavigate(buildCustomersHref({
          page: Math.max(1, pagination.page - 1),
          pageSize,
          status,
          source,
          customerOrigin,
          keyword,
          follow,
        }))}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronLeft data-icon="inline-start" />}
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={nextDisabled}
        onClick={() => onNavigate(buildCustomersHref({
          page: pagination.page + 1,
          pageSize,
          status,
          source,
          customerOrigin,
          keyword,
          follow,
        }))}
      >
        下一页
        {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
      </Button>
    </div>
  );
}
