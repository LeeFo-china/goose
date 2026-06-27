import { GitBranch } from "lucide-react";
import { WorkflowListShell } from "@/components/workflows/workflow-list-shell";
import type { WorkflowDefinitionListData } from "@/components/workflows/workflow-types";
import {
  WORKFLOW_TABLE_MAX_PAGE_SIZE,
  WORKFLOW_TABLE_MIN_PAGE_SIZE,
} from "@/components/workflows/workflow-list-page-size";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type WorkflowPageSearchParams = {
  page?: string | string[];
  pageSize?: string | string[];
  status?: string | string[];
  category?: string | string[];
  keyword?: string | string[];
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTextParam(value: string | string[] | undefined) {
  return firstSearchParam(value)?.trim() || "";
}

function normalizePage(value: string | string[] | undefined) {
  const page = Number(firstSearchParam(value) || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizePageSize(value: string | string[] | undefined) {
  const pageSize = Number(firstSearchParam(value) || 20);
  if (!Number.isFinite(pageSize)) return 20;

  return Math.min(
    WORKFLOW_TABLE_MAX_PAGE_SIZE,
    Math.max(WORKFLOW_TABLE_MIN_PAGE_SIZE, Math.floor(pageSize)),
  );
}

async function getWorkflows(params: WorkflowPageSearchParams) {
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const status = normalizeTextParam(params.status);
  const category = normalizeTextParam(params.category);
  const keyword = normalizeTextParam(params.keyword);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (status) query.set("status", status);
  if (category) query.set("category", category);
  if (keyword) query.set("keyword", keyword);

  try {
    const response = await fetch(buildBackendUrl(`/workflows?${query}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<WorkflowDefinitionListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "流程列表加载失败",
    };
  }
}

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<WorkflowPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const status = normalizeTextParam(params.status);
  const category = normalizeTextParam(params.category);
  const keyword = normalizeTextParam(params.keyword);
  const { list, pagination, error } = await getWorkflows(params);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <GitBranch aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">流程编排</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              业务流转、施工工序、审批和验收流程。当前筛选共 {pagination.total} 条记录。
            </p>
          </div>
        </div>
      </div>

      <WorkflowListShell
        workflows={list}
        pagination={pagination}
        status={status}
        category={category}
        keyword={keyword}
        error={error}
      />
    </div>
  );
}
