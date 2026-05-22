import {
  CreateProjectButton,
  type ProjectRecord,
} from "@/components/projects/project-mutations";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { ProjectsClientShell } from "@/components/projects/projects-client-shell";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ProjectListData = {
  list: ProjectRecord[];
  pagination: Pagination;
};

type ProjectPageSearchParams = {
  page?: string;
  status?: string;
  ownership?: string;
  keyword?: string;
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

async function getProjects(params: ProjectPageSearchParams) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const page = normalizePage(params.page);
  const status = params.status?.trim() || "";
  const ownership = params.ownership?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  if (status) query.set("status", status);
  if (ownership) query.set("ownership", ownership);
  if (keyword) query.set("keyword", keyword);

  try {
    const response = await fetch(buildBackendUrl(`/projects?${query}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<ProjectListData>(response);
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
      error: error instanceof Error ? error.message : "项目列表加载失败",
    };
  }
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<ProjectPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const status = params.status?.trim() || "";
  const ownership = params.ownership?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const { list, pagination, error } = await getProjects(params);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">项目管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            项目档案、客户、设计师、工程负责人和客户侧展示维护。当前筛选共 {pagination.total} 条记录。
          </p>
        </div>
        <CreateProjectButton />
      </div>

      <ProjectsClientShell
        projects={list}
        pagination={pagination}
        status={status}
        ownership={ownership}
        keyword={keyword}
        error={error}
      />
    </div>
  );
}
