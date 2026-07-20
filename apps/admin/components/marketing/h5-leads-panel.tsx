"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, Search } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { H5MarketingLeadsTable } from "@/components/marketing/h5-leads-table";
import { h5MarketingLeadStatusOptions } from "@/components/marketing/marketing-constants";
import type {
  H5MarketingLeadRecord,
  H5MarketingPageRecord,
  Pagination,
} from "@/components/marketing/marketing-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requestBackendJson } from "@/lib/backend-client";

type LeadListData = {
  list: H5MarketingLeadRecord[];
  pagination: Pagination;
};

type InitialLeadData = LeadListData & {
  error: string | null;
};

type LeadFilters = {
  status: string;
  pageId: string;
  keyword: string;
  createdFrom: string;
  createdTo: string;
};

const LEAD_PAGE_SIZE = 20;

function dateStartToIso(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : "";
}

function dateEndToIso(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : "";
}

function toDateInputValue(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

async function fetchLeadList(filters: LeadFilters, page: number) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(LEAD_PAGE_SIZE),
  });

  if (filters.status) query.set("status", filters.status);
  if (filters.pageId) query.set("page_id", filters.pageId);
  if (filters.keyword.trim()) query.set("keyword", filters.keyword.trim());
  if (filters.createdFrom) query.set("created_from", dateStartToIso(filters.createdFrom));
  if (filters.createdTo) query.set("created_to", dateEndToIso(filters.createdTo));

  return requestBackendJson<LeadListData>(`/marketing-leads?${query.toString()}`, {
    cache: "no-store",
    fallbackMessage: "H5 营销线索加载失败",
  });
}

export function H5LeadsPanel({
  initialData,
  initialFilters,
  pages,
  embedded = false,
}: {
  initialData: InitialLeadData;
  initialFilters: LeadFilters;
  pages: H5MarketingPageRecord[];
  embedded?: boolean;
}) {
  const normalizedInitialFilters = {
    ...initialFilters,
    createdFrom: toDateInputValue(initialFilters.createdFrom),
    createdTo: toDateInputValue(initialFilters.createdTo),
  };
  const [filters, setFilters] = useState(normalizedInitialFilters);
  const [keywordDraft, setKeywordDraft] = useState(initialFilters.keyword);
  const [page, setPage] = useState(initialData.pagination.page || 1);
  const [leads, setLeads] = useState(initialData.list);
  const [pagination, setPagination] = useState(initialData.pagination);
  const [error, setError] = useState(initialData.error || "");
  const [loading, setLoading] = useState(false);
  const firstLoadRef = useRef(true);
  const requestSeqRef = useRef(0);

  const loadLeads = useCallback(async (options: { silent?: boolean } = {}) => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    if (!options.silent) {
      setLoading(true);
    }
    setError("");

    try {
      const data = await fetchLeadList(filters, page);
      if (requestSeqRef.current !== requestSeq) return;
      setLeads(data?.list || []);
      setPagination(data?.pagination || {
        page,
        pageSize: LEAD_PAGE_SIZE,
        total: 0,
        totalPages: 0,
      });
    } catch (err) {
      if (requestSeqRef.current !== requestSeq) return;
      setPagination({
        page,
        pageSize: LEAD_PAGE_SIZE,
        total: pagination.total,
        totalPages: pagination.totalPages,
      });
      setError(err instanceof Error ? err.message : "H5 营销线索加载失败");
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [filters, page, pagination.total, pagination.totalPages]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const keyword = keywordDraft.trim();
      setFilters((current) => {
        if (current.keyword === keyword) return current;
        setPage(1);
        return { ...current, keyword };
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [keywordDraft]);

  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      return;
    }

    void loadLeads();
  }, [loadLeads]);

  const updateFilter = (patch: Partial<LeadFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };
  const canGoPrev = pagination.page > 1 && !loading;
  const canGoNext = pagination.totalPages > 0 && pagination.page < pagination.totalPages && !loading;

  const content = (
    <>
      <div className={embedded
        ? "flex shrink-0 flex-col gap-3 border-b bg-card px-4 py-3"
        : "flex flex-col gap-3 border-t px-4 py-4"}
      >
        {embedded ? null : (
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>H5 营销线索</CardTitle>
              <CardDescription>
                筛选条件作用于下方线索表格，当前共 {pagination.total} 条记录。
              </CardDescription>
            </div>
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-[150px_210px_1fr_150px_150px_auto]">
          <FormSelect
            id="h5-lead-status-filter"
            value={filters.status || "__all"}
            options={[
              { value: "__all", label: "全部有效" },
              ...h5MarketingLeadStatusOptions.map(([value, label]) => ({ value, label })),
            ]}
            onChange={(value) => updateFilter({ status: value === "__all" ? "" : value })}
          />
          <FormSelect
            id="h5-lead-page-filter"
            value={filters.pageId || "__all"}
            options={[
              { value: "__all", label: "全部活动页" },
              ...pages.map((item) => ({
                value: item.id,
                label: item.title || item.slug,
              })),
            ]}
            onChange={(value) => updateFilter({ pageId: value === "__all" ? "" : value })}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keywordDraft}
              placeholder="搜索姓名、手机号、小区或城市"
              className="pl-9"
              onChange={(event) => setKeywordDraft(event.target.value)}
            />
          </div>
          <Input
            type="date"
            value={filters.createdFrom}
            aria-label="提交开始日期"
            onChange={(event) => updateFilter({ createdFrom: event.target.value })}
          />
          <Input
            type="date"
            value={filters.createdTo}
            aria-label="提交结束日期"
            onChange={(event) => updateFilter({ createdTo: event.target.value })}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const emptyFilters = {
                status: "",
                pageId: "",
                keyword: "",
                createdFrom: "",
                createdTo: "",
              };
              setKeywordDraft("");
              setFilters(emptyFilters);
              setPage(1);
            }}
          >
            <RotateCcw data-icon="inline-start" />
            重置
          </Button>
        </div>
      </div>
      <div className={embedded ? "relative flex min-h-0 flex-1 flex-col" : "relative flex flex-col gap-4"}>
        {loading ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/70 backdrop-blur-[1px]">
            <div className="flex items-center rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              正在更新线索列表
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="px-4">
            <StatusAlert>{error}</StatusAlert>
          </div>
        ) : (
          <div className={embedded ? "min-h-0 flex-1 overflow-auto" : ""}>
            <H5MarketingLeadsTable
              leads={leads}
              onLeadUpdated={() => {
                void loadLeads({ silent: true });
              }}
            />
          </div>
        )}
        <div className={embedded
          ? "shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between"
          : "flex flex-col gap-3 px-4 pb-4 md:flex-row md:items-center md:justify-between"}
        >
          <div className="text-sm text-muted-foreground">
            当前显示 {leads.length} 条，共 {pagination.total} 条
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!canGoPrev}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft data-icon="inline-start" />
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canGoNext}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  if (embedded) {
    return <div className="flex min-h-0 flex-1 flex-col">{content}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="p-0">
          {content}
        </CardContent>
      </Card>
    </div>
  );
}
