"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  PERMISSION_STATUS_VALUES,
  PermissionStatusConfig,
} from "@gooes/domain";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  ...PERMISSION_STATUS_VALUES.map((value) => [
    value,
    PermissionStatusConfig[value].label,
  ] as const),
] as const;

function buildPermissionsHref(input: {
  page?: number;
  status?: string;
  module?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.status) params.set("status", input.status);
  if (input.module) params.set("module", input.module);
  if (input.keyword) params.set("keyword", input.keyword);
  const query = params.toString();
  return query ? `/permissions?${query}` : "/permissions";
}

export function PermissionFilters({
  status,
  module,
  keyword,
  pending,
  onNavigate,
}: {
  status: string;
  module: string;
  keyword: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [selectedModule, setSelectedModule] = useState(module);
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedStatus(status);
    setSelectedModule(module);
    setSelectedKeyword(keyword);
  }, [keyword, module, status]);

  function applyStatusFilter(nextStatus: string) {
    onNavigate(buildPermissionsHref({
      status: nextStatus,
      module,
      keyword,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNavigate(buildPermissionsHref({
      status: selectedStatus,
      module: selectedModule.trim(),
      keyword: selectedKeyword.trim(),
    }));
  }

  return (
    <form className="grid gap-3 lg:grid-cols-[140px_180px_1fr_72px]" onSubmit={submit}>
      <input type="hidden" name="status" value={selectedStatus} />
      <FormSelect
        id="permission-status-filter"
        value={selectedStatus || "__all"}
        disabled={pending}
        options={statusOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => {
          const nextStatus = value === "__all" ? "" : value;
          setSelectedStatus(nextStatus);
          applyStatusFilter(nextStatus);
        }}
      />
      <Input
        name="module"
        value={selectedModule}
        placeholder="模块"
        disabled={pending}
        onChange={(event) => setSelectedModule(event.target.value)}
      />
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索编码或名称"
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

export function PermissionsPagination({
  pagination,
  status,
  module,
  keyword,
  pending,
  onNavigate,
}: {
  pagination: Pagination;
  status: string;
  module: string;
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
        onClick={() => onNavigate(buildPermissionsHref({
          page: Math.max(1, pagination.page - 1),
          status,
          module,
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
        onClick={() => onNavigate(buildPermissionsHref({
          page: pagination.page + 1,
          status,
          module,
          keyword,
        }))}
      >
        下一页
        {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
      </Button>
    </div>
  );
}
