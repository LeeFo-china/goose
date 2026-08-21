import { z } from "zod";

import type { Pagination } from "./leads-workbench-logic";

export type AssigneeCandidatePage = {
  list: Array<{ value: string; label: string }>;
  pagination: Pagination;
};
export type AssigneeFilterOptionsState = {
  options: AssigneeCandidatePage["list"];
  hasMore: boolean;
};

const paginationSchema = z.strictObject({
  page: z.number().int().min(1), pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0), totalPages: z.number().int().min(0),
});
const optionPageSchema = z.strictObject({
  list: z.array(z.strictObject({
    id: z.uuid(), name: z.string().trim().min(1).max(100),
  })),
  pagination: paginationSchema,
});
const API_PATH = "/tenant/douyin-miniapp/leads";

export function buildAssigneeOptionsPath(kind: "assign" | "filter", keyword: string,
  includeEmployeeId = ""): string {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  const normalizedKeyword = keyword.trim();
  if (normalizedKeyword) params.set("keyword", normalizedKeyword);
  if (kind === "filter" && includeEmployeeId) {
    params.set("includeEmployeeId", includeEmployeeId);
  }
  const resource = kind === "assign" ? "assignee-candidates" : "assignee-filter-options";
  return `${API_PATH}/${resource}?${params}`;
}

export function normalizeAssigneeCandidatePage(raw: unknown): AssigneeCandidatePage | null {
  const parsed = parseOptionPage(raw);
  if (!parsed || parsed.list.length > parsed.pagination.total) return null;
  return projectOptionPage(parsed);
}

export function normalizeAssigneeFilterOptionPage(raw: unknown,
  includeEmployeeId: string): AssigneeCandidatePage | null {
  const parsed = parseOptionPage(raw);
  if (!parsed || new Set(parsed.list.map((item) => item.id)).size !== parsed.list.length) {
    return null;
  }
  const selectedExtra = parsed.list.some((item) => item.id === includeEmployeeId) ? 1 : 0;
  if (parsed.list.length > parsed.pagination.total + selectedExtra) return null;
  return projectOptionPage(parsed);
}

function parseOptionPage(raw: unknown): z.infer<typeof optionPageSchema> | null {
  const parsed = optionPageSchema.safeParse(raw);
  if (!parsed.success || parsed.data.pagination.page !== 1
    || parsed.data.pagination.pageSize !== 100 || parsed.data.list.length > 100) return null;
  const expectedPages = parsed.data.pagination.total === 0 ? 0
    : Math.ceil(parsed.data.pagination.total / 100);
  return parsed.data.pagination.totalPages === expectedPages ? parsed.data : null;
}

function projectOptionPage(parsed: z.infer<typeof optionPageSchema>): AssigneeCandidatePage {
  return { list: parsed.list.map((item) => ({ value: item.id, label: item.name })),
    pagination: parsed.pagination };
}
