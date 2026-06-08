export const projectDetailTabs = ["acceptances", "logs", "members", "overview"] as const;

export type ProjectDetailPageTab = (typeof projectDetailTabs)[number];

export function parseProjectDetailTab(value: string | string[] | undefined): ProjectDetailPageTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return projectDetailTabs.includes(candidate as ProjectDetailPageTab)
    ? candidate as ProjectDetailPageTab
    : "acceptances";
}

export function projectDetailHref(projectId: string, tab: ProjectDetailPageTab, acceptanceId?: string | null) {
  const params = new URLSearchParams({ tab });
  if (acceptanceId) params.set("acceptanceId", acceptanceId);
  return `/projects/${projectId}?${params.toString()}`;
}
