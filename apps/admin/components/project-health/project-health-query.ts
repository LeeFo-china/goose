import type {
  ProjectOperationalRiskSeverity,
  ProjectOperationalRiskType,
} from "@gooes/domain";

export const PROJECT_HEALTH_PAGE_SIZE = 20;

export type ProjectHealthQueryState = {
  page?: number | string | null;
  severity?: ProjectOperationalRiskSeverity | "" | null;
  riskType?: ProjectOperationalRiskType | "" | null;
  keyword?: string | null;
};

function normalizePage(page: ProjectHealthQueryState["page"]): number {
  const numericPage = typeof page === "number" ? page : Number(page);
  if (!Number.isInteger(numericPage) || numericPage < 1) return 1;
  return numericPage;
}

function appendProjectHealthFilters(
  params: URLSearchParams,
  query: ProjectHealthQueryState,
): void {
  if (query.severity) params.set("severity", query.severity);
  if (query.riskType) params.set("risk_type", query.riskType);

  const keyword = query.keyword?.trim();
  if (keyword) params.set("keyword", keyword);
}

export function buildProjectHealthHref(
  query: ProjectHealthQueryState = {},
): string {
  const params = new URLSearchParams();
  params.set("page", String(normalizePage(query.page)));
  appendProjectHealthFilters(params, query);
  return `/project-health?${params.toString()}`;
}

export function buildProjectHealthFilterHref(
  current: ProjectHealthQueryState,
  patch: ProjectHealthQueryState,
): string {
  return buildProjectHealthHref({
    ...current,
    ...patch,
    page: 1,
  });
}

export function buildProjectHealthResetHref(): string {
  return buildProjectHealthHref({ page: 1 });
}

export function buildProjectHealthBackendQuery(
  query: ProjectHealthQueryState = {},
): string {
  const params = new URLSearchParams();
  params.set("page", String(normalizePage(query.page)));
  params.set("pageSize", String(PROJECT_HEALTH_PAGE_SIZE));
  appendProjectHealthFilters(params, query);
  return params.toString();
}
