import { type ProjectRecord } from "@/components/projects/project-mutations";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { ProjectsClientShell } from "@/components/projects/projects-client-shell";
import {
  emptyWorkflowFilters,
  type ProjectWorkflowFiltersData,
} from "@/components/projects/project-list-filter-utils";
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
  ownership?: string;
  keyword?: string;
  workflow_group_key?: string;
  workflow_node_key?: string;
  workflow_instance_status?: string;
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
  const ownership = params.ownership?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const workflowGroupKey = params.workflow_group_key?.trim() || "";
  const workflowNodeKey = params.workflow_node_key?.trim() || "";
  const workflowInstanceStatus = params.workflow_instance_status?.trim() || "";
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  if (ownership) query.set("ownership", ownership);
  if (keyword) query.set("keyword", keyword);
  if (workflowGroupKey) query.set("workflow_group_key", workflowGroupKey);
  if (workflowNodeKey) query.set("workflow_node_key", workflowNodeKey);
  if (workflowInstanceStatus) {
    query.set("workflow_instance_status", workflowInstanceStatus);
  }

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

async function getProjectWorkflowFilters(
  params: Pick<ProjectPageSearchParams, "ownership">,
) {
  const token = await getAdminToken();
  if (!token) {
    return {
      filters: emptyWorkflowFilters(),
      error: "缺少登录凭证",
    };
  }

  const query = new URLSearchParams();
  const ownership = params.ownership?.trim() || "";
  if (ownership) query.set("ownership", ownership);
  const queryString = query.toString();

  try {
    const response = await fetch(
      buildBackendUrl(
        queryString
          ? `/projects/workflow-filters?${queryString}`
          : "/projects/workflow-filters",
      ),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<ProjectWorkflowFiltersData>(response);
    return {
      filters: payload.data || emptyWorkflowFilters(),
      error: null,
    };
  } catch (error) {
    return {
      filters: emptyWorkflowFilters(),
      error: error instanceof Error ? error.message : "项目流程筛选项加载失败",
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
  const ownership = params.ownership?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const workflowGroupKey = params.workflow_group_key?.trim() || "";
  const workflowNodeKey = params.workflow_node_key?.trim() || "";
  const workflowInstanceStatus = params.workflow_instance_status?.trim() || "";
  const [
    { list, pagination, error: listError },
    { filters: workflowFilters, error: filtersError },
  ] = await Promise.all([
    getProjects(params),
    getProjectWorkflowFilters(params),
  ]);

  return (
    <div className="flex min-h-[calc(100vh-6.5rem)] flex-col gap-5">
      <ProjectsClientShell
        projects={list}
        pagination={pagination}
        ownership={ownership}
        keyword={keyword}
        workflowGroupKey={workflowGroupKey}
        workflowNodeKey={workflowNodeKey}
        workflowInstanceStatus={workflowInstanceStatus}
        workflowFilters={workflowFilters}
        error={listError ?? filtersError}
      />
    </div>
  );
}
