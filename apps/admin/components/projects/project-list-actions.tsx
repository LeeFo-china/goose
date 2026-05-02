"use client";

import { useEffect, useState, useTransition } from "react";
import {
  PROJECT_STATUS_VALUES,
  ProjectStatusConfig,
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

function useProjectsNavigation() {
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

export function ProjectFilters({
  status,
  ownership,
  keyword,
}: {
  status: string;
  ownership: string;
  keyword: string;
}) {
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [selectedOwnership, setSelectedOwnership] = useState(ownership);

  useEffect(() => {
    setSelectedStatus(status);
    setSelectedOwnership(ownership);
  }, [ownership, status]);

  return (
    <form
      action="/projects"
      method="get"
      className="grid gap-3 lg:grid-cols-[150px_150px_1fr_72px]"
    >
      <input type="hidden" name="status" value={selectedStatus} />
      <input type="hidden" name="ownership" value={selectedOwnership} />
      <FormSelect
        id="project-status-filter"
        value={selectedStatus || "__all"}
        options={statusOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => setSelectedStatus(value === "__all" ? "" : value)}
      />
      <FormSelect
        id="project-ownership-filter"
        value={selectedOwnership || "__default"}
        options={ownershipOptions.map(([value, label]) => ({
          value: value || "__default",
          label,
        }))}
        onChange={(value) =>
          setSelectedOwnership(value === "__default" ? "" : value)
        }
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="keyword"
          defaultValue={keyword}
          placeholder="搜索项目名称或地址"
          className="pl-9"
        />
      </div>
      <Button type="submit" variant="outline">
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
}: {
  pagination: Pagination;
  status: string;
  ownership: string;
  keyword: string;
}) {
  const { pending, navigate } = useProjectsNavigation();
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= pagination.totalPages || pending;

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={previousDisabled}
        onClick={() => navigate(buildProjectsHref({
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
        onClick={() => navigate(buildProjectsHref({
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
