import { redirect } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  buildAssigneeOptionsPath, normalizeAssigneeFilterOptionPage,
  type AssigneeFilterOptionsState,
} from "@/components/douyin-miniapp/leads-assignee-options";
import { LeadsWorkbench } from "@/components/douyin-miniapp/leads-workbench";
import {
  buildLeadApiQuery,
  normalizeLeadPage,
  parseLeadFilters,
  type LeadFilters,
  type LeadPage,
} from "@/components/douyin-miniapp/leads-workbench-logic";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type PageSearchParams = Partial<Record<
  "page" | "pageSize" | "status" | "assigneeId" | "dateFrom" | "dateTo" | "keyword",
  string
>>;

export default async function TenantDouyinLeadsPage({ searchParams }: {
  searchParams: Promise<PageSearchParams>;
}) {
  const [session, token, rawParams] = await Promise.all([
    getAdminSession(), getAdminToken(), searchParams,
  ]);
  if (!session) redirect("/login");

  const permissions = session.permissions.map((permission) => permission.code);
  const canRead = session.tenant !== null && permissions.includes("douyin_lead.read");
  if (!canRead) {
    return <StatusAlert>当前账号缺少抖音线索查看权限</StatusAlert>;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (value) params.set(key, value);
  }
  const filters = parseLeadFilters(params);
  let data = emptyPage(filters);
  let error: string | null = null;
  let initialFilterAssigneeOptions: AssigneeFilterOptionsState = {
    options: [], hasMore: false,
  };

  if (!token) {
    error = "缺少登录凭证，请重新登录后重试";
  } else {
    const [leadResult, filterOptions] = await Promise.all([
      loadLeads(token, filters),
      loadInitialAssigneeFilterOptions(token, filters),
    ]);
    data = leadResult.data;
    error = leadResult.error;
    initialFilterAssigneeOptions = filterOptions;
  }

  return <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col overflow-hidden">
    <LeadsWorkbench
      initialData={data}
      initialError={error}
      initialFilters={filters}
      initialFilterAssigneeOptions={initialFilterAssigneeOptions}
      permissions={permissions}
    />
  </div>;
}

export async function loadInitialAssigneeFilterOptions(token: string,
  filters: LeadFilters): Promise<AssigneeFilterOptionsState> {
  try {
    const response = await fetch(buildBackendUrl(
      buildAssigneeOptionsPath("filter", "", filters.assigneeId),
    ), { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await parseBackendJson<unknown>(response);
    const parsed = normalizeAssigneeFilterOptionPage(payload.data, filters.assigneeId);
    return parsed ? { options: parsed.list,
      hasMore: parsed.pagination.totalPages > 1 } : { options: [], hasMore: false };
  } catch {
    return { options: [], hasMore: false };
  }
}

async function loadLeads(token: string, filters: LeadFilters): Promise<{
  data: LeadPage; error: string | null;
}> {
  try {
    const response = await fetch(
      buildBackendUrl(`/tenant/douyin-miniapp/leads?${buildLeadApiQuery(filters)}`),
      { headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    const payload = await parseBackendJson<unknown>(response);
    const parsed = normalizeLeadPage(payload.data, filters);
    return parsed
      ? { data: parsed, error: null }
      : { data: emptyPage(filters), error: "线索列表响应无效，请重试" };
  } catch {
    return { data: emptyPage(filters), error: "抖音线索列表加载失败，请重试" };
  }
}

function emptyPage(filters: LeadFilters): LeadPage {
  return { list: [], pagination: {
    page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0,
  } };
}
