import { OrganizationTabs } from "@/components/organization/organization-tabs";
import type {
  DepartmentRecord,
  Pagination,
  ProjectMemberRolePostRuleConfig,
  PostRecord,
} from "@/components/organization/organization-types";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type OrganizationTab = "departments" | "posts" | "role-rules";

type OrganizationSearchParams = {
  tab?: string;
  departmentPage?: string;
  departmentCode?: string;
  departmentKeyword?: string;
  postPage?: string;
  postStatus?: string;
  postSalaryType?: string;
  postKeyword?: string;
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

function normalizeTab(value: string | undefined): OrganizationTab {
  if (value === "role-rules") return "role-rules";
  return value === "posts" ? "posts" : "departments";
}

async function getList<T>(input: {
  token: string | null;
  resource: "departments" | "posts";
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

async function getRoleRuleConfig(input: {
  token: string | null;
}): Promise<ProjectMemberRolePostRuleConfig & { error: string | null }> {
  if (!input.token) {
    return {
      roles: [],
      post_options: [],
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl("/project-member-role-post-rules"), {
      headers: {
        authorization: `Bearer ${input.token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<ProjectMemberRolePostRuleConfig>(response);
    return {
      ...(payload.data || {
        roles: [],
        post_options: [],
      }),
      error: null,
    };
  } catch (error) {
    return {
      roles: [],
      post_options: [],
      error: error instanceof Error ? error.message : "候选规则加载失败",
    };
  }
}

function buildDepartmentQuery(params: OrganizationSearchParams) {
  const query = new URLSearchParams({
    page: String(normalizePage(params.departmentPage)),
    pageSize: "20",
  });
  const keyword = params.departmentKeyword?.trim() || "";
  const code = params.departmentCode?.trim() || "";
  if (keyword) query.set("keyword", keyword);
  if (code) query.set("code", code);
  return query;
}

function buildPostQuery(params: OrganizationSearchParams) {
  const query = new URLSearchParams({
    page: String(normalizePage(params.postPage)),
    pageSize: "20",
  });
  const keyword = params.postKeyword?.trim() || "";
  const status = params.postStatus?.trim() || "";
  const salaryType = params.postSalaryType?.trim() || "";
  if (keyword) query.set("keyword", keyword);
  if (status) query.set("status", status);
  if (salaryType) query.set("salary_type", salaryType);
  return query;
}

export default async function OrganizationPage({
  searchParams,
}: {
  searchParams: Promise<OrganizationSearchParams>;
}) {
  const params = await searchParams;
  const activeTab = normalizeTab(params.tab);
  const token = await getAdminToken();
  const [departments, posts, roleRuleConfig] = await Promise.all([
    getList<DepartmentRecord>({
      token,
      resource: "departments",
      query: buildDepartmentQuery(params),
      fallbackMessage: "部门列表加载失败",
    }),
    getList<PostRecord>({
      token,
      resource: "posts",
      query: buildPostQuery(params),
      fallbackMessage: "岗位列表加载失败",
    }),
    getRoleRuleConfig({ token }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">组织架构</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          统一维护部门与岗位。当前共 {departments.pagination.total} 个部门，{posts.pagination.total} 个岗位。
        </p>
      </div>

      <OrganizationTabs
        activeTab={activeTab}
        departments={departments}
        posts={posts}
        roleRuleConfig={roleRuleConfig}
        departmentCode={params.departmentCode?.trim() || ""}
        departmentKeyword={params.departmentKeyword?.trim() || ""}
        postStatus={params.postStatus?.trim() || ""}
        postSalaryType={params.postSalaryType?.trim() || ""}
        postKeyword={params.postKeyword?.trim() || ""}
      />
    </div>
  );
}
