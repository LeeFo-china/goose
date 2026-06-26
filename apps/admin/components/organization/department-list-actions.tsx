"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  DEPARTMENT_CODE_VALUES,
  DepartmentConfig,
} from "@gooes/domain";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { Pagination } from "@/components/organization/organization-types";

type Navigate = (href: string) => void;

const codeOptions = [
  ["", "全部部门"],
  ...DEPARTMENT_CODE_VALUES.map((value) => [
    value,
    DepartmentConfig[value].label,
  ] as const),
] as const;

const flatControlClassName = "bg-card shadow-none";

export function buildDepartmentsHref(input: {
  page?: number;
  pageSize?: number;
  code?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  params.set("tab", "departments");
  if (input.page && input.page > 1) params.set("departmentPage", String(input.page));
  if (input.pageSize && input.pageSize > 0) {
    params.set("departmentPageSize", String(input.pageSize));
  }
  if (input.code) params.set("departmentCode", input.code);
  if (input.keyword) params.set("departmentKeyword", input.keyword);
  const query = params.toString();
  return query ? `/organization?${query}` : "/organization";
}

export function DepartmentFilters({
  code,
  keyword,
  pageSize,
  pending,
  onNavigate,
}: {
  code: string;
  keyword: string;
  pageSize: number;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const [selectedCode, setSelectedCode] = useState(code);
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedCode(code);
    setSelectedKeyword(keyword);
  }, [code, keyword]);

  function applyCodeFilter(nextCode: string) {
    onNavigate(buildDepartmentsHref({
      code: nextCode,
      keyword,
      pageSize,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNavigate(buildDepartmentsHref({
      code: selectedCode,
      keyword: selectedKeyword.trim(),
      pageSize,
    }));
  }

  return (
    <form className="grid flex-1 gap-2 md:grid-cols-[180px_minmax(220px,1fr)_72px]" onSubmit={submit}>
      <input type="hidden" name="code" value={selectedCode} />
      <FormSelect
        id="department-code-filter"
        value={selectedCode || "__all"}
        disabled={pending}
        triggerClassName={flatControlClassName}
        options={codeOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => {
          const nextCode = value === "__all" ? "" : value;
          setSelectedCode(nextCode);
          applyCodeFilter(nextCode);
        }}
      />
      <InputGroup className="h-9 bg-card">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索部门名称或编码"
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
        搜索
      </Button>
    </form>
  );
}

export function DepartmentsPagination({
  pagination,
  code,
  keyword,
  pageSize,
  pending,
  onNavigate,
}: {
  pagination: Pagination;
  code: string;
  keyword: string;
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
        onClick={() => onNavigate(buildDepartmentsHref({
          page: Math.max(1, pagination.page - 1),
          pageSize,
          code,
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
        onClick={() => onNavigate(buildDepartmentsHref({
          page: pagination.page + 1,
          pageSize,
          code,
          keyword,
        }))}
      >
        下一页
        <ChevronRight data-icon="inline-end" />
      </Button>
    </div>
  );
}
