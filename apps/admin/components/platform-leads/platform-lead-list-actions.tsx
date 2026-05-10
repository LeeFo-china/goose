"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
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
import { platformLeadStatusOptions, type Pagination } from "@/components/platform-leads/platform-lead-types";

const statusOptions = [
  { value: "__all", label: "全部状态" },
  ...platformLeadStatusOptions,
] as const;

function buildPlatformLeadsHref(input: {
  page?: number;
  status?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.status && input.status !== "__all") params.set("status", input.status);
  if (input.keyword) params.set("keyword", input.keyword);
  const query = params.toString();
  return query ? `/platform/leads?${query}` : "/platform/leads";
}

export function PlatformLeadFilters({
  status,
  keyword,
}: {
  status: string;
  keyword: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedStatus, setSelectedStatus] = useState(status || "__all");
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedStatus(status || "__all");
    setSelectedKeyword(keyword);
  }, [keyword, status]);

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(buildPlatformLeadsHref({
      status: selectedStatus,
      keyword: selectedKeyword.trim(),
    }));
  }

  function changeStatus(value: string) {
    setSelectedStatus(value);
    navigate(buildPlatformLeadsHref({
      status: value,
      keyword: selectedKeyword.trim(),
    }));
  }

  return (
    <form className="grid gap-3 md:grid-cols-[180px_1fr_72px]" onSubmit={submit}>
      <FormSelect
        id="platform-lead-status-filter"
        value={selectedStatus}
        options={statusOptions}
        disabled={pending}
        onChange={changeStatus}
      />
      <InputGroup>
        <InputGroupAddon>
          <Search data-icon="inline-start" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索姓名、电话、城市、小区"
          disabled={pending}
          onChange={(event) => setSelectedKeyword(event.target.value)}
        />
        {selectedKeyword ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              disabled={pending}
              onClick={() => {
                setSelectedKeyword("");
                navigate(buildPlatformLeadsHref({ status: selectedStatus }));
              }}
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        搜索
      </Button>
    </form>
  );
}

export function PlatformLeadPagination({
  pagination,
  status,
  keyword,
}: {
  pagination: Pagination;
  status: string;
  keyword: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const totalPages = Math.max(1, pagination.totalPages || 1);
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= totalPages || pending;

  function navigate(page: number) {
    startTransition(() => {
      router.push(buildPlatformLeadsHref({ page, status, keyword }));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">
        第 {pagination.page} / {totalPages} 页，共 {pagination.total} 条线索
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={previousDisabled}
          onClick={() => navigate(Math.max(1, pagination.page - 1))}
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronLeft data-icon="inline-start" />}
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={nextDisabled}
          onClick={() => navigate(pagination.page + 1)}
        >
          下一页
          {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
        </Button>
      </div>
    </div>
  );
}
