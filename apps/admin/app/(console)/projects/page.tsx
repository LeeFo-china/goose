import { BriefcaseBusiness, CalendarDays, House } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  ProjectFilters,
  ProjectsPagination,
} from "@/components/projects/project-list-actions";
import {
  CreateProjectButton,
  ProjectRowActions,
  type ProjectRecord,
} from "@/components/projects/project-mutations";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = {
  lead: { label: "线索客户", variant: "outline" },
  measure: { label: "量房中", variant: "warning" },
  negotiating: { label: "谈单中", variant: "warning" },
  signed: { label: "已签约", variant: "success" },
  designing: { label: "设计中", variant: "default" },
  constructing: { label: "施工中", variant: "warning" },
  on_hold: { label: "已暂停", variant: "danger" },
  acceptance: { label: "验收中", variant: "warning" },
  completed: { label: "已完工", variant: "success" },
  after_sale: { label: "售后中", variant: "danger" },
  invalid: { label: "无效客户", variant: "secondary" },
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function customerName(value: ProjectRecord["customer"]) {
  const item = relationOne(value);
  return item?.name || item?.phone_masked || item?.phone || "-";
}

function personName(value: ProjectRecord["designer"] | ProjectRecord["supervisor"]) {
  const item = relationOne(value);
  return item?.name || item?.phone || "-";
}

function propertyLabel(value: ProjectRecord["property"]) {
  const item = relationOne(value);
  if (!item) return "-";
  return [item.community, item.building_info].filter(Boolean).join(" ") || "-";
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

      <Card>
        <CardContent className="p-4">
          <ProjectFilters status={status} ownership={ownership} keyword={keyword} />
        </CardContent>
      </Card>

      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle>项目列表</CardTitle>
          <Badge variant="outline">
            第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1680px] table-fixed border-t text-sm">
              <colgroup>
                <col className="w-[320px]" />
                <col className="w-[140px]" />
                <col className="w-[260px]" />
                <col className="w-[110px]" />
                <col className="w-[140px]" />
                <col className="w-[130px]" />
                <col className="w-[150px]" />
                <col className="w-[120px]" />
                <col className="w-[260px]" />
              </colgroup>
              <thead className="bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">项目</th>
                  <th className="whitespace-nowrap px-4 py-3">客户</th>
                  <th className="whitespace-nowrap px-4 py-3">房产</th>
                  <th className="whitespace-nowrap px-4 py-3">状态</th>
                  <th className="whitespace-nowrap px-4 py-3">预算</th>
                  <th className="whitespace-nowrap px-4 py-3">设计师</th>
                  <th className="whitespace-nowrap px-4 py-3">工程负责人</th>
                  <th className="whitespace-nowrap px-4 py-3">开工日期</th>
                  <th className="sticky right-0 whitespace-nowrap bg-muted px-4 py-3 text-right shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.length > 0 ? (
                  list.map((project) => {
                    const meta = statusMeta[project.status || ""] || {
                      label: project.status || "未知",
                      variant: "outline" as const,
                    };

                    return (
                      <tr key={project.id} className="group border-t transition-colors hover:bg-muted/40">
                        <td className="px-4 py-4">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{project.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {project.address || project.id}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">{customerName(project.customer)}</td>
                        <td className="px-4 py-4 text-muted-foreground">
                          <div className="truncate">{propertyLabel(project.property)}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <Badge className="whitespace-nowrap" variant={meta.variant}>{meta.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 font-medium">¥{formatMoney(project.budget)}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{personName(project.designer)}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{personName(project.supervisor)}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDate(project.start_date)}</td>
                        <td className="sticky right-0 whitespace-nowrap bg-card px-4 py-4 text-right shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)] transition-colors group-hover:bg-muted">
                          <ProjectRowActions project={project} />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-5 py-12 text-center text-muted-foreground" colSpan={9}>
                      没有符合条件的项目
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          每页 {pagination.pageSize} 条，共 {pagination.total} 条
        </div>
        <ProjectsPagination
          pagination={pagination}
          status={status}
          ownership={ownership}
          keyword={keyword}
        />
      </div>
    </div>
  );
}
