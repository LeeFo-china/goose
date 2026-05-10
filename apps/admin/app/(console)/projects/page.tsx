import { BriefcaseBusiness, CalendarDays, House } from "lucide-react";
import {
  CreateProjectButton,
  type ProjectRecord,
} from "@/components/projects/project-mutations";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { ProjectsClientShell } from "@/components/projects/projects-client-shell";
import { Card, CardContent } from "@/components/ui/card";
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

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const activeCount = list.filter((item) => item.status !== "invalid").length;
  const constructingCount = list.filter((item) =>
    item.status === "constructing" || item.status === "acceptance"
  ).length;
  const pageBudget = list.reduce((sum, item) => sum + Number(item.budget || 0), 0);

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

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <BriefcaseBusiness className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页有效项目</div>
              <div className="text-xl font-semibold">{activeCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页施工/验收</div>
              <div className="text-xl font-semibold">{constructingCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <House className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页预算</div>
              <div className="text-xl font-semibold">¥{formatMoney(pageBudget)}</div>
            </div>
          </CardContent>
        </Card>
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
