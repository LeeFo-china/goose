import type { PublicProjectPhase } from "../../models";

export type ProjectFilter = "all" | PublicProjectPhase;

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
