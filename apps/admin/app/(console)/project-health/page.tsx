import type {
  ProjectOperationalRiskDisplayPage,
  ProjectOperationalRiskSeverity,
  ProjectOperationalRiskType,
} from "@gooes/domain";
import { ProjectOperationalRiskDisplayPageSchema } from "@gooes/domain";
import { ProjectHealthClientShell } from "@/components/project-health/project-health-client-shell";
import {
  buildProjectHealthBackendQuery,
  type ProjectHealthQueryState,
} from "@/components/project-health/project-health-query";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type ProjectHealthSearchParams = {
  page?: string | string[];
  severity?: string | string[];
  risk_type?: string | string[];
  keyword?: string | string[];
};

const SEVERITIES = new Set(["warning", "danger"]);
const RISK_TYPES = new Set([
  "workflow_task_overdue",
  "procedure_overdue",
  "missing_project_log",
  "acceptance_rework",
  "service_ticket",
]);

function firstString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseFilters(params: ProjectHealthSearchParams): ProjectHealthQueryState {
  const page = firstString(params.page);
  const severity = firstString(params.severity);
  const riskType = firstString(params.risk_type);
  const keyword = firstString(params.keyword);

  return {
    page,
    severity: SEVERITIES.has(severity)
      ? severity as ProjectOperationalRiskSeverity
      : "",
    riskType: RISK_TYPES.has(riskType)
      ? riskType as ProjectOperationalRiskType
      : "",
    keyword: keyword.trim(),
  };
}

async function getProjectHealthData(filters: ProjectHealthQueryState): Promise<{
  data: ProjectOperationalRiskDisplayPage | null;
  error: string | null;
}> {
  const token = await getAdminToken();
  if (!token) return { data: null, error: "缺少登录凭证" };

  try {
    const response = await fetch(
      buildBackendUrl(`/project-health/risks?${buildProjectHealthBackendQuery(filters)}`),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<ProjectOperationalRiskDisplayPage>(response);
    if (!payload.data) return { data: null, error: "项目风险响应缺少 data" };

    const parsed = ProjectOperationalRiskDisplayPageSchema.safeParse(payload.data);
    if (!parsed.success) return { data: null, error: "项目风险响应格式异常" };

    return { data: parsed.data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "项目风险加载失败",
    };
  }
}

export default async function ProjectHealthPage({
  searchParams,
}: {
  searchParams: Promise<ProjectHealthSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const initialFilters = parseFilters(params);
  const { data, error } = await getProjectHealthData(initialFilters);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <ProjectHealthClientShell
        initialData={data}
        initialFilters={initialFilters}
        initialError={error}
      />
    </div>
  );
}
