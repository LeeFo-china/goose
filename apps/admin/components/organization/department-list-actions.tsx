"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  DEPARTMENT_CODE_VALUES,
  DepartmentConfig,
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
import type { Pagination } from "@/components/organization/organization-types";

type Navigate = (href: string) => void;

const codeOptions = [
  ["", "全部部门"],
  ...DEPARTMENT_CODE_VALUES.map((value) => [
    value,
    DepartmentConfig[value].label,
  ] as const),
] as const;

const enabledOptions = [
  { value: "__all", label: "全部状态" },
  { value: "true", label: "已启用" },
  { value: "false", label: "已停用" },
] as const;

function buildDepartmentsHref(input: {
  page?: number;
  code?: string;
  keyword?: string;
  enabled?: string;
}) {
  const params = new URLSearchParams();
  params.set("tab", "departments");
  if (input.page && input.page > 1) params.set("departmentPage", String(input.page));
  if (input.code) params.set("departmentCode", input.code);
  if (input.keyword) params.set("departmentKeyword", input.keyword);
  if (input.enabled) params.set("departmentEnabled", input.enabled);
  const query = params.toString();
  return query ? `/organization?${query}` : "/organization";
}

export function DepartmentFilters({
  code,
  keyword,
  enabled,
  pending,
  onNavigate,
}: {
  code: string;
  keyword: string;
  enabled: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const [selectedCode, setSelectedCode] = useState(code);
  const [selectedEnabled, setSelectedEnabled] = useState(enabled);
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedCode(code);
    setSelectedEnabled(enabled);
    setSelectedKeyword(keyword);
  }, [code, enabled, keyword]);

  function applyCodeFilter(nextCode: string) {
    onNavigate(buildDepartmentsHref({
      code: nextCode,
      keyword,
      enabled,
    }));
  }

  function applyEnabledFilter(nextEnabled: string) {
    onNavigate(buildDepartmentsHref({
      code,
      keyword,
      enabled: nextEnabled,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNavigate(buildDepartmentsHref({
      code: selectedCode,
      keyword: selectedKeyword.trim(),
      enabled: selectedEnabled,
    }));
  }

  return (
    <form className="grid gap-3 lg:grid-cols-[160px_128px_1fr_72px]" onSubmit={submit}>
      <input type="hidden" name="code" value={selectedCode} />
      <FormSelect
        id="department-code-filter"
        value={selectedCode || "__all"}
        disabled={pending}
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
      <FormSelect
        id="department-enabled-filter"
        value={selectedEnabled || "__all"}
        disabled={pending}
        options={enabledOptions}
        onChange={(value) => {
          const nextEnabled = value === "__all" ? "" : value;
          setSelectedEnabled(nextEnabled);
          applyEnabledFilter(nextEnabled);
        }}
      />
      <InputGroup>
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
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        搜索
      </Button>
    </form>
  );
}

export function DepartmentsPagination({
  pagination,
  code,
  keyword,
  enabled,
  pending,
  onNavigate,
}: {
  pagination: Pagination;
  code: string;
  keyword: string;
  enabled: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pagination.page <= 1 || pending}
        onClick={() => onNavigate(buildDepartmentsHref({
          page: Math.max(1, pagination.page - 1),
          code,
          keyword,
          enabled,
        }))}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronLeft data-icon="inline-start" />}
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={pagination.page >= pagination.totalPages || pending}
        onClick={() => onNavigate(buildDepartmentsHref({
          page: pagination.page + 1,
          code,
          keyword,
          enabled,
        }))}
      >
        下一页
        {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
      </Button>
    </div>
  );
}
