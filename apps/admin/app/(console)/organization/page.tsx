import { Building2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { OrganizationTabs } from "@/components/organization/organization-tabs";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import type {
  DepartmentRecord,
  DepartmentPostRuleConfig,
  Pagination,
} from "@/components/organization/organization-types";
import { ORGANIZATION_PAGE_SIZE_OPTIONS } from "@/components/organization/organization-types";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type OrganizationTab = "departments";

type OrganizationSearchParams = {
  tab?: string;
  departmentPage?: string;
  departmentPageSize?: string;
  departmentCode?: string;
  departmentKeyword?: string;
};

type ListData<T> = {
  list: T[];
  pagination: Pagination;
};

type ListResult<T> = ListData<T> & {
  error: string | null;
};

const emptyPagination = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizePageSize(value: string | undefined) {
  const pageSize = Number(value || emptyPagination.pageSize);
  return (ORGANIZATION_PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize)
    ? pageSize
    : emptyPagination.pageSize;
}

function normalizeTab(_value: string | undefined): OrganizationTab {
  return "departments";
}

async function getList<T>(input: {
  token: string | null;
  resource: "departments";
  query: URLSearchParams;
  fallbackMessage: string;
}): Promise<ListResult<T>> {
  if (!input.token) {
    return {
      list: [],
      pagination: emptyPagination,
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl(`/${input.resource}?${input.query}`), {
      headers: {
        authorization: `Bearer ${input.token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<ListData<T>>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: emptyPagination,
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: emptyPagination,
      error: error instanceof Error ? error.message : input.fallbackMessage,
    };
  }
}

async function getDepartmentPostRuleConfig(input: {
  token: string | null;
}): Promise<DepartmentPostRuleConfig & { error: string | null }> {
  if (!input.token) {
    return {
      departments: [],
      post_options: [],
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl("/department-post-rules"), {
      headers: {
        authorization: `Bearer ${input.token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<DepartmentPostRuleConfig>(response);
    return {
      ...(payload.data || {
        departments: [],
        post_options: [],
      }),
      error: null,
    };
  } catch (error) {
    return {
      departments: [],
      post_options: [],
      error: error instanceof Error ? error.message : "部门岗位规则加载失败",
    };
  }
}

function buildDepartmentQuery(params: OrganizationSearchParams) {
  const query = new URLSearchParams({
    page: String(normalizePage(params.departmentPage)),
    pageSize: String(normalizePageSize(params.departmentPageSize)),
  });
  const keyword = params.departmentKeyword?.trim() || "";
  const code = params.departmentCode?.trim() || "";
  if (keyword) query.set("keyword", keyword);
  if (code) query.set("code", code);
  return query;
}

export default async function OrganizationPage({
  searchParams,
}: {
  searchParams: Promise<OrganizationSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const activeTab = normalizeTab(params.tab);
  const token = await getAdminToken();
  const [departments, departmentPostRuleConfig] = await Promise.all([
    getList<DepartmentRecord>({
      token,
      resource: "departments",
      query: buildDepartmentQuery(params),
      fallbackMessage: "部门列表加载失败",
    }),
    getDepartmentPostRuleConfig({ token }),
  ]);
  const routeErrors = [
    departments.error,
    departmentPostRuleConfig.error,
  ].filter((message): message is string => Boolean(message));

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <Building2 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">组织架构</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              管理部门启停、岗位配置和组织规则。当前筛选共 {departments.pagination.total} 个部门。
            </p>
          </div>
        </div>
      </div>

      {routeErrors.length > 0 ? (
        <div className="shrink-0 space-y-2">
          {routeErrors.map((message, index) => (
            <StatusAlert key={`${index}-${message}`}>{message}</StatusAlert>
          ))}
        </div>
      ) : null}

      <OrganizationTabs
        activeTab={activeTab}
        departments={departments}
        departmentPostRuleConfig={departmentPostRuleConfig}
        departmentCode={params.departmentCode?.trim() || ""}
        departmentKeyword={params.departmentKeyword?.trim() || ""}
      />
    </div>
  );
}
