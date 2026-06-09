import { WorkflowListShell } from "@/components/workflows/workflow-list-shell";
import type { WorkflowDefinitionListData } from "@/components/workflows/workflow-types";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type WorkflowPageSearchParams = {
  page?: string | string[];
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

async function getWorkflows(params: WorkflowPageSearchParams) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const page = normalizePage(params.page);
  const status = normalizeTextParam(params.status);
  const category = normalizeTextParam(params.category);
  const keyword = normalizeTextParam(params.keyword);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
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
        pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">流程编排</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理业务流转、施工工序、审批和验收流程，发布后小程序按租户流程执行。
          </p>
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
