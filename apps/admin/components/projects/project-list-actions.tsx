"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
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
  ["lead", "线索客户"],
  ["measure", "量房中"],
  ["negotiating", "谈单中"],
  ["signed", "已签约"],
  ["designing", "设计中"],
  ["constructing", "施工中"],
  ["on_hold", "已暂停"],
  ["acceptance", "验收中"],
  ["completed", "已完工"],
  ["after_sale", "售后中"],
  ["invalid", "无效客户"],
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
  return (
    <form
      action="/projects"
      method="get"
      className="grid gap-3 lg:grid-cols-[150px_150px_1fr_72px]"
    >
      <select
        name="status"
        defaultValue={status}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {statusOptions.map(([value, label]) => (
          <option key={value || "all"} value={value}>{label}</option>
        ))}
      </select>
      <select
        name="ownership"
        defaultValue={ownership}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ownershipOptions.map(([value, label]) => (
          <option key={value || "default"} value={value}>{label}</option>
        ))}
      </select>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
        {pending ? <Loader2 className="animate-spin" /> : <ChevronLeft />}
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
        {pending ? <Loader2 className="animate-spin" /> : <ChevronRight />}
      </Button>
    </div>
  );
}
