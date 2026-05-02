"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import {
  PERMISSION_STATUS_VALUES,
  PermissionStatusConfig,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

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

function usePermissionsNavigation() {
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

export function PermissionFilters({
  status,
  module,
  keyword,
}: {
  status: string;
  module: string;
  keyword: string;
}) {
  const { pending, navigate } = usePermissionsNavigation();
  const [selectedStatus, setSelectedStatus] = useState(status);

  useEffect(() => {
    setSelectedStatus(status);
  }, [status]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    navigate(buildPermissionsHref({
      status: String(formData.get("status") || ""),
      module: String(formData.get("module") || "").trim(),
      keyword: String(formData.get("keyword") || "").trim(),
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
        onChange={(value) => setSelectedStatus(value === "__all" ? "" : value)}
      />
      <Input
        name="module"
        defaultValue={module}
        placeholder="模块"
        disabled={pending}
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="keyword"
          defaultValue={keyword}
          placeholder="搜索编码或名称"
          className="pl-9"
          disabled={pending}
        />
      </div>
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
}: {
  pagination: Pagination;
  status: string;
  module: string;
  keyword: string;
}) {
  const { pending, navigate } = usePermissionsNavigation();

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pagination.page <= 1 || pending}
        onClick={() => navigate(buildPermissionsHref({
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
        disabled={pagination.page >= pagination.totalPages || pending}
        onClick={() => navigate(buildPermissionsHref({
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
