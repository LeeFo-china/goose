import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

import {
  buildAssigneeOptionsPath,
  normalizeAssigneeFilterOptionPage,
  type AssigneeFilterOptionsState,
} from "./leads-assignee-options";
import type { LeadFilters } from "./leads-workbench-logic";

export async function loadInitialAssigneeFilterOptions(
  token: string,
  filters: LeadFilters,
): Promise<AssigneeFilterOptionsState> {
  try {
    const response = await fetch(buildBackendUrl(
      buildAssigneeOptionsPath("filter", "", filters.assigneeId),
    ), { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await parseBackendJson<unknown>(response);
    const parsed = normalizeAssigneeFilterOptionPage(payload.data, filters.assigneeId);
    return parsed ? { options: parsed.list,
      hasMore: parsed.pagination.totalPages > 1 } : { options: [], hasMore: false };
  } catch {
    return { options: [], hasMore: false };
  }
}
