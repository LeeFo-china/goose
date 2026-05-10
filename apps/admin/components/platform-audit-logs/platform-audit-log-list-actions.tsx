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
import {
  platformAuditLogActionOptions,
  type Pagination,
} from "@/components/platform-audit-logs/platform-audit-log-types";

const actionOptions = [
  { value: "__all", label: "全部操作" },
  ...platformAuditLogActionOptions,
] as const;

function buildPlatformAuditLogsHref(input: {
  page?: number;
  action?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.action && input.action !== "__all") params.set("action", input.action);
  if (input.keyword) params.set("keyword", input.keyword);
  const query = params.toString();
  return query ? `/platform/audit-logs?${query}` : "/platform/audit-logs";
}

export function PlatformAuditLogFilters({
  action,
  keyword,
}: {
  action: string;
  keyword: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedAction, setSelectedAction] = useState(action || "__all");
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedAction(action || "__all");
    setSelectedKeyword(keyword);
  }, [action, keyword]);

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(buildPlatformAuditLogsHref({
      action: selectedAction,
      keyword: selectedKeyword.trim(),
    }));
  }

  function changeAction(value: string) {
    setSelectedAction(value);
    navigate(buildPlatformAuditLogsHref({
      action: value,
      keyword: selectedKeyword.trim(),
    }));
  }

  return (
    <form className="grid gap-3 md:grid-cols-[190px_1fr_72px]" onSubmit={submit}>
      <FormSelect
        id="platform-audit-action-filter"
        value={selectedAction}
        options={actionOptions}
        disabled={pending}
        onChange={changeAction}
      />
      <InputGroup>
        <InputGroupAddon>
          <Search data-icon="inline-start" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索操作摘要、资源名称或资源类型"
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
                navigate(buildPlatformAuditLogsHref({ action: selectedAction }));
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

export function PlatformAuditLogPagination({
  pagination,
  action,
  keyword,
}: {
  pagination: Pagination;
  action: string;
  keyword: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const totalPages = Math.max(1, pagination.totalPages || 1);
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= totalPages || pending;

  function navigate(page: number) {
    startTransition(() => {
      router.push(buildPlatformAuditLogsHref({ page, action, keyword }));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">
        第 {pagination.page} / {totalPages} 页，共 {pagination.total} 条审计记录
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
