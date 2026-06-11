"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { EmployeeStatus } from "@gooes/domain";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

type StatusOption = {
  label: string;
  value: "" | EmployeeStatus;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type Navigate = (href: string) => void;

function buildEmployeesHref(input: {
  page?: number;
  status?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.status) params.set("status", input.status);
  if (input.keyword) params.set("keyword", input.keyword);
  const query = params.toString();
  return query ? `/employees?${query}` : "/employees";
}

export function EmployeesStatusFilters({
  options,
  currentStatus,
  keyword,
  pending,
  onNavigate,
}: {
  options: StatusOption[];
  currentStatus: string;
  keyword: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md border bg-card p-1">
      {options.map((item) => {
        const active = currentStatus === item.value;
        return (
          <Button
            key={item.value || "all"}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() => onNavigate(buildEmployeesHref({
              status: item.value,
              keyword,
            }))}
            className="h-8 border-transparent px-3 shadow-none"
          >
            {pending && active ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

export function EmployeeSearchForm({
  status,
  keyword,
  pending,
  onNavigate,
}: {
  status: string;
  keyword: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedKeyword(keyword);
  }, [keyword]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNavigate(buildEmployeesHref({
      status,
      keyword: selectedKeyword.trim(),
    }));
  }

  return (
    <form className="flex w-full gap-2 xl:w-[360px]" onSubmit={submit}>
      <InputGroup className="h-9 flex-1 bg-card">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索姓名或手机号"
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
      <Button type="submit" variant="outline" disabled={pending} className="bg-card">
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        搜索
      </Button>
    </form>
  );
}

export function EmployeesPagination({
  pagination,
  status,
  keyword,
  pending,
  onNavigate,
}: {
  pagination: Pagination;
  status: string;
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
        onClick={() => onNavigate(buildEmployeesHref({
          page: Math.max(1, pagination.page - 1),
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
        onClick={() => onNavigate(buildEmployeesHref({
          page: pagination.page + 1,
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
