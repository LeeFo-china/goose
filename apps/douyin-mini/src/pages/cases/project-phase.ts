import type { PublicProject, PublicProjectPhase } from "../../models";

export type ProjectFilter = "all" | PublicProjectPhase;

export type ProjectPhaseSelection = {
  selectedPhase: ProjectFilter;
  loadMode: "refresh";
  filterSnapshot: { selectedPhase: ProjectFilter };
};

export const PROJECT_PHASE_FILTERS: ReadonlyArray<{
  value: ProjectFilter;
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "in_progress", label: "施工中" },
  { value: "completed", label: "已完工" },
];

export function projectFilterToPhase(filter: ProjectFilter): PublicProjectPhase | undefined {
  return filter === "all" ? undefined : filter;
}

export function projectPhaseLabel(phase: PublicProjectPhase): string {
  return phase === "in_progress" ? "施工中" : "已完工";
}

export function projectDisplayPhaseLabel(
  project: Pick<PublicProject, "phase" | "stage_label">,
): string {
  if (project.phase === "completed") return "已完工";
  const stageLabel = project.stage_label?.trim();
  return stageLabel || "施工中";
}

export function createProjectPhaseSelection(
  current: ProjectFilter,
  next: unknown,
): ProjectPhaseSelection | null {
  if (!isProjectFilter(next) || next === current) return null;
  return {
    selectedPhase: next,
    loadMode: "refresh",
    filterSnapshot: { selectedPhase: next },
  };
}

export function shouldLoadProjectLogs(phase: PublicProjectPhase): boolean {
  return phase === "in_progress";
}

export function uniqueProjectsById<Project extends { id: string }>(
  projects: readonly Project[],
): Project[] {
  const unique = new Map<string, Project>();
  for (const project of projects) {
    if (!unique.has(project.id)) unique.set(project.id, project);
  }
  return [...unique.values()];
}

function isProjectFilter(value: unknown): value is ProjectFilter {
  return value === "all" || value === "in_progress" || value === "completed";
}
