"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import {
  CUSTOMER_SERVICE_TICKET_CATEGORY_VALUES,
  CUSTOMER_SERVICE_TICKET_STATUS_VALUES,
  CustomerServiceTicketCategoryConfig,
  CustomerServiceTicketStatusConfig,
} from "@gooes/domain";
import { ChevronLeft, ChevronRight, Loader2, Search, Settings2, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { CustomerServicePagination as PaginationMeta } from "@/components/customer-service/customer-service-types";

type Navigate = (href: string) => void;

const statusOptions = [
  ["", "全部状态"],
  ...CUSTOMER_SERVICE_TICKET_STATUS_VALUES.map((value) => [
    value,
    CustomerServiceTicketStatusConfig[value].label,
  ] as const),
] as const;

const categoryOptions = [
  ["", "全部分类"],
  ...CUSTOMER_SERVICE_TICKET_CATEGORY_VALUES.map((value) => [
    value,
    CustomerServiceTicketCategoryConfig[value].label,
  ] as const),
] as const;

function buildCustomerServiceHref(input: {
  page?: number;
  status?: string;
  category?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.status) params.set("status", input.status);
  if (input.category) params.set("category", input.category);
  if (input.keyword) params.set("keyword", input.keyword);
  const query = params.toString();
  return query ? `/customer-service?${query}` : "/customer-service";
}

export function CustomerServiceFilters({
  status,
  category,
  keyword,
  pending,
  onNavigate,
}: {
  status: string;
  category: string;
  keyword: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [selectedCategory, setSelectedCategory] = useState(category);
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedStatus(status);
    setSelectedCategory(category);
    setSelectedKeyword(keyword);
  }, [category, keyword, status]);

  function applySelectFilters(input: { status?: string; category?: string }) {
    onNavigate(buildCustomerServiceHref({
      status: input.status ?? status,
      category: input.category ?? category,
      keyword,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNavigate(buildCustomerServiceHref({
      status: selectedStatus,
      category: selectedCategory,
      keyword: selectedKeyword.trim(),
    }));
  }

  return (
    <form className="grid gap-3 md:grid-cols-[160px_160px_1fr_72px_auto]" onSubmit={submit}>
      <input type="hidden" name="status" value={selectedStatus} />
      <input type="hidden" name="category" value={selectedCategory} />
      <FormSelect
        id="customer-service-status-filter"
        value={selectedStatus || "__all"}
        disabled={pending}
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
        id="customer-service-category-filter"
        value={selectedCategory || "__all"}
        disabled={pending}
        options={categoryOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => {
          const nextCategory = value === "__all" ? "" : value;
          setSelectedCategory(nextCategory);
          applySelectFilters({ category: nextCategory });
        }}
      />
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索工单编号、标题或描述"
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
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        搜索
      </Button>
      <Button asChild variant="outline">
        <Link href="/settings?group=customer_service">
          <Settings2 data-icon="inline-start" />
          客服配置
        </Link>
      </Button>
    </form>
  );
}

export function CustomerServicePagination({
  pagination,
  status,
  category,
  keyword,
  pending,
  onNavigate,
}: {
  pagination: PaginationMeta;
  status: string;
  category: string;
  keyword: string;
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
        onClick={() => onNavigate(buildCustomerServiceHref({
          page: Math.max(1, pagination.page - 1),
          status,
          category,
          keyword,
        }))}
      >
        <ChevronLeft data-icon="inline-start" />
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={nextDisabled}
        onClick={() => onNavigate(buildCustomerServiceHref({
          page: pagination.page + 1,
          status,
          category,
          keyword,
        }))}
      >
        下一页
        <ChevronRight data-icon="inline-end" />
      </Button>
    </div>
  );
}
