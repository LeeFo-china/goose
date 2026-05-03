"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  PROJECT_STATUS_VALUES,
  ProjectStatusConfig,
} from "@gooes/domain";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
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
  ...PROJECT_STATUS_VALUES.map((value) => [
    value,
    ProjectStatusConfig[value].label,
  ] as const),
] as const;

const ownershipOptions = [
  ["", "默认可见"],
  ["self", "只看自己"],
  ["all", "全部可见"],
] as const;

function buildProjectsHref(input: {
  page?: number;
  status?: string;
  ownership?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.status) params.set("status", input.status);
  if (input.ownership) params.set("ownership", input.ownership);
  if (input.keyword) params.set("keyword", input.keyword);
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}

export function ProjectFilters({
  status,
  ownership,
  keyword,
  pending,
  onNavigate,
}: {
  status: string;
  ownership: string;
  keyword: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [selectedOwnership, setSelectedOwnership] = useState(ownership);
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedStatus(status);
    setSelectedOwnership(ownership);
    setSelectedKeyword(keyword);
  }, [keyword, ownership, status]);

  function applySelectFilters(input: {
    status?: string;
    ownership?: string;
  }) {
    onNavigate(buildProjectsHref({
      status: input.status ?? status,
      ownership: input.ownership ?? ownership,
      keyword,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNavigate(buildProjectsHref({
      status: selectedStatus,
      ownership: selectedOwnership,
      keyword: selectedKeyword.trim(),
    }));
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 lg:grid-cols-[150px_150px_1fr_72px]"
    >
      <input type="hidden" name="status" value={selectedStatus} />
      <input type="hidden" name="ownership" value={selectedOwnership} />
      <FormSelect
        id="project-status-filter"
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
        id="project-ownership-filter"
        value={selectedOwnership || "__default"}
        disabled={pending}
        options={ownershipOptions.map(([value, label]) => ({
          value: value || "__default",
          label,
        }))}
        onChange={(value) => {
          const nextOwnership = value === "__default" ? "" : value;
          setSelectedOwnership(nextOwnership);
          applySelectFilters({ ownership: nextOwnership });
        }}
      />
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索项目名称或地址"
          disabled={pending}
          onChange={(event) => setSelectedKeyword(event.target.value)}
        />
      </InputGroup>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        搜索
      </Button>
    </form>
  );
}

export function ProjectsPagination({
  pagination,
  status,
  ownership,
  keyword,
  pending,
  onNavigate,
}: {
  pagination: Pagination;
  status: string;
  ownership: string;
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
        onClick={() => onNavigate(buildProjectsHref({
          page: Math.max(1, pagination.page - 1),
          status,
          ownership,
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
        onClick={() => onNavigate(buildProjectsHref({
          page: pagination.page + 1,
          status,
          ownership,
          keyword,
        }))}
      >
        下一页
        {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
      </Button>
    </div>
  );
}
