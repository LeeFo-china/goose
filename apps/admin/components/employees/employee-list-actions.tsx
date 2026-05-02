"use client";

import { FormEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type EmployeeStatus = "pending" | "active" | "suspended" | "leaved";

type StatusOption = {
  label: string;
  value: "" | EmployeeStatus;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function buildEmployeesHref(input: {
  page?: number;
  status?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.status) params.set("status", input.status);
  if (input.keyword) params.set("keyword", input.keyword);
  const query = params.toString();
  return query ? `/employees?${query}` : "/employees";
}

function useEmployeesNavigation() {
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

export function EmployeesStatusFilters({
  options,
  currentStatus,
  keyword,
}: {
  options: StatusOption[];
  currentStatus: string;
  keyword: string;
}) {
  const { pending, navigate } = useEmployeesNavigation();

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((item) => {
        const active = currentStatus === item.value;
        return (
          <button
            key={item.value || "all"}
            type="button"
            disabled={pending}
            onClick={() => navigate(buildEmployeesHref({
              status: item.value,
              keyword,
            }))}
            className="contents"
          >
            <span
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-accent",
              )}
            >
              {pending && active ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function EmployeeSearchForm({
  status,
  keyword,
}: {
  status: string;
  keyword: string;
}) {
  const { pending, navigate } = useEmployeesNavigation();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextKeyword = String(formData.get("keyword") || "").trim();
    navigate(buildEmployeesHref({
      status,
      keyword: nextKeyword,
    }));
  }

  return (
    <form className="flex w-full gap-2 xl:w-[360px]" onSubmit={submit}>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="keyword"
          defaultValue={keyword}
          placeholder="搜索姓名或手机号"
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

export function EmployeesPagination({
  pagination,
  status,
  keyword,
}: {
  pagination: Pagination;
  status: string;
  keyword: string;
}) {
  const { pending, navigate } = useEmployeesNavigation();
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= pagination.totalPages || pending;

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={previousDisabled}
        onClick={() => navigate(buildEmployeesHref({
          page: Math.max(1, pagination.page - 1),
          status,
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
        onClick={() => navigate(buildEmployeesHref({
          page: pagination.page + 1,
          status,
          keyword,
        }))}
      >
        下一页
        {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
      </Button>
    </div>
  );
}
