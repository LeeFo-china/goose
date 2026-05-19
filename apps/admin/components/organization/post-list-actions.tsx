"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  POST_STATUS_VALUES,
  SALARY_TYPE_VALUES,
  PostStatusConfig,
  SalaryTypeConfig,
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
import {
  ORGANIZATION_PAGE_SIZE_OPTIONS,
  type Pagination,
} from "@/components/organization/organization-types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Navigate = (href: string) => void;

const statusOptions = [
  ["", "全部状态"],
  ...POST_STATUS_VALUES.map((value) => [
    String(value),
    PostStatusConfig[value].label,
  ] as const),
] as const;

const salaryTypeOptions = [
  ["", "全部薪资"],
  ...SALARY_TYPE_VALUES.map((value) => [
    value,
    SalaryTypeConfig[value].label,
  ] as const),
] as const;

function buildPostsHref(input: {
  page?: number;
  pageSize?: number;
  status?: string;
  salaryType?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  params.set("tab", "posts");
  if (input.page && input.page > 1) params.set("postPage", String(input.page));
  if (input.pageSize && input.pageSize !== 20) {
    params.set("postPageSize", String(input.pageSize));
  }
  if (input.status) params.set("postStatus", input.status);
  if (input.salaryType) params.set("postSalaryType", input.salaryType);
  if (input.keyword) params.set("postKeyword", input.keyword);
  const query = params.toString();
  return query ? `/organization?${query}` : "/organization?tab=posts";
}

export function PostFilters({
  status,
  salaryType,
  keyword,
  pageSize,
  pending,
  onNavigate,
}: {
  status: string;
  salaryType: string;
  keyword: string;
  pageSize: number;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [selectedSalaryType, setSelectedSalaryType] = useState(salaryType);
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedStatus(status);
    setSelectedSalaryType(salaryType);
    setSelectedKeyword(keyword);
  }, [keyword, salaryType, status]);

  function applySelectFilters(input: {
    status?: string;
    salaryType?: string;
  }) {
    onNavigate(buildPostsHref({
      status: input.status ?? status,
      salaryType: input.salaryType ?? salaryType,
      keyword,
      pageSize,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNavigate(buildPostsHref({
      status: selectedStatus,
      salaryType: selectedSalaryType,
      keyword: selectedKeyword.trim(),
      pageSize,
    }));
  }

  return (
    <form className="grid gap-3 lg:grid-cols-[140px_150px_1fr_72px]" onSubmit={submit}>
      <input type="hidden" name="status" value={selectedStatus} />
      <input type="hidden" name="salaryType" value={selectedSalaryType} />
      <FormSelect
        id="post-status-filter"
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
        id="post-salary-type-filter"
        value={selectedSalaryType || "__all"}
        disabled={pending}
        options={salaryTypeOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => {
          const nextSalaryType = value === "__all" ? "" : value;
          setSelectedSalaryType(nextSalaryType);
          applySelectFilters({ salaryType: nextSalaryType });
        }}
      />
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索岗位名称、编码或说明"
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
    </form>
  );
}

export function PostsPagination({
  pagination,
  status,
  salaryType,
  keyword,
  pending,
  onNavigate,
}: {
  pagination: Pagination;
  status: string;
  salaryType: string;
  keyword: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pagination.page <= 1 || pending}
        onClick={() => onNavigate(buildPostsHref({
          page: Math.max(1, pagination.page - 1),
          pageSize: pagination.pageSize,
          status,
          salaryType,
          keyword,
        }))}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronLeft data-icon="inline-start" />}
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={pagination.page >= pagination.totalPages || pending}
        onClick={() => onNavigate(buildPostsHref({
          page: pagination.page + 1,
          pageSize: pagination.pageSize,
          status,
          salaryType,
          keyword,
        }))}
      >
        下一页
        {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
      </Button>
    </div>
  );
}

export function PostPageSizeSelect({
  pagination,
  status,
  salaryType,
  keyword,
  pending,
  onNavigate,
}: {
  pagination: Pagination;
  status: string;
  salaryType: string;
  keyword: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  return (
    <Select
      value={String(pagination.pageSize)}
      disabled={pending}
      onValueChange={(value) => onNavigate(buildPostsHref({
        pageSize: Number(value),
        status,
        salaryType,
        keyword,
      }))}
    >
      <SelectTrigger className="h-8 w-[104px] shadow-none" aria-label="选择每页岗位条数">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {ORGANIZATION_PAGE_SIZE_OPTIONS.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option} 条/页
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
