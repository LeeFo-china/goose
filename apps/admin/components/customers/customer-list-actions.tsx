"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CUSTOMER_SOURCE_VALUES,
  CUSTOMER_STATUS_VALUES,
  CustomerSourceConfig,
  CustomerStatusConfig,
} from "@gooes/domain";
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

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

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

function buildCustomersHref(input: {
  page?: number;
  status?: string;
  source?: string;
  keyword?: string;
  follow?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.status) params.set("status", input.status);
  if (input.source) params.set("source", input.source);
  if (input.keyword) params.set("keyword", input.keyword);
  if (input.follow) params.set("follow", input.follow);
  const query = params.toString();
  return query ? `/customers?${query}` : "/customers";
}

function useCustomersNavigation() {
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

export function CustomerFilters({
  status,
  source,
  keyword,
  follow,
}: {
  status: string;
  source: string;
  keyword: string;
  follow: string;
}) {
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [selectedSource, setSelectedSource] = useState(source);
  const [selectedFollow, setSelectedFollow] = useState(follow);
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedStatus(status);
    setSelectedSource(source);
    setSelectedFollow(follow);
    setSelectedKeyword(keyword);
  }, [follow, keyword, source, status]);

  return (
    <form action="/customers" method="get" className="grid gap-3 lg:grid-cols-[150px_150px_160px_1fr_72px]">
      <input type="hidden" name="status" value={selectedStatus} />
      <input type="hidden" name="source" value={selectedSource} />
      <input type="hidden" name="follow" value={selectedFollow} />
      <FormSelect
        id="customer-status-filter"
        value={selectedStatus || "__all"}
        options={statusOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => setSelectedStatus(value === "__all" ? "" : value)}
      />
      <FormSelect
        id="customer-source-filter"
        value={selectedSource || "__all"}
        options={sourceOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => setSelectedSource(value === "__all" ? "" : value)}
      />
      <FormSelect
        id="customer-follow-filter"
        value={selectedFollow || "__all"}
        options={[
          { value: "__all", label: "全部跟进" },
          { value: "due", label: "待跟进" },
          { value: "overdue", label: "超期未跟进" },
        ]}
        onChange={(value) => setSelectedFollow(value === "__all" ? "" : value)}
      />
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索姓名、手机号或来源"
          onChange={(event) => setSelectedKeyword(event.target.value)}
        />
        {selectedKeyword ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="清除搜索内容"
              size="icon-xs"
              onClick={() => setSelectedKeyword("")}
            >
              <X aria-hidden="true" />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <Button type="submit" variant="outline">
        搜索
      </Button>
    </form>
  );
}

export function CustomersPagination({
  pagination,
  status,
  source,
  keyword,
  follow,
}: {
  pagination: Pagination;
  status: string;
  source: string;
  keyword: string;
  follow: string;
}) {
  const { pending, navigate } = useCustomersNavigation();
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= pagination.totalPages || pending;

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={previousDisabled}
        onClick={() => navigate(buildCustomersHref({
          page: Math.max(1, pagination.page - 1),
          status,
          source,
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
        onClick={() => navigate(buildCustomersHref({
          page: pagination.page + 1,
          status,
          source,
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
