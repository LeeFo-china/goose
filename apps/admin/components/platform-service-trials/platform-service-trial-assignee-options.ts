import { z } from "zod";

import type {
  PlatformServiceTrialAssignee,
  PlatformServiceTrialAssigneeCandidate,
  PlatformServiceTrialAssigneeCandidatePage,
} from "./platform-service-trial-types";

export const ASSIGNEE_SEARCH_DEBOUNCE_MS = 250;
export const ASSIGNEE_CANDIDATE_PAGE_SIZE = 20;

const uuidSchema = z.uuid();
const roleSchema = z.object({
  code: z.string().regex(/^platform_/),
  name: z.string().nullable(),
}).strict();
const activeCandidateSchema = z.object({
  id: uuidSchema,
  name: z.string().nullable(),
  phone_masked: z.string().regex(/^1[3-9]\d\*{4}\d{4}$/).nullable(),
  status: z.literal("active"),
  roles: z.array(roleSchema).min(1),
  selectable: z.literal(true),
  historical: z.literal(false),
}).strict();
const paginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
}).strict().refine(
  ({ pageSize, total, totalPages }) =>
    totalPages === (total === 0 ? 0 : Math.ceil(total / pageSize)),
);
const candidatePageSchema = z.object({
  list: z.array(activeCandidateSchema),
  pagination: paginationSchema,
}).strict().superRefine(({ list, pagination }, context) => {
  // includeEmployeeId may append one eligible candidate outside the current page.
  if (list.length > pagination.pageSize + 1) {
    context.addIssue({
      code: "custom",
      path: ["list"],
      message: "候选分页记录数不一致",
    });
  }
  if (new Set(list.map(({ id }) => id)).size !== list.length) {
    context.addIssue({
      code: "custom",
      path: ["list"],
      message: "候选员工重复",
    });
  }
});

type CandidateQuery = {
  page: number;
  pageSize: number;
  keyword?: string;
  includeEmployeeId?: string;
};

export function buildTrialAssigneeCandidatesPath(query: CandidateQuery): string {
  if (!Number.isInteger(query.page) || query.page < 1) {
    throw new Error("page 必须是正整数");
  }
  if (!Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100) {
    throw new Error("pageSize 必须在 1 到 100 之间");
  }

  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  const keyword = normalizeKeyword(query.keyword);
  if (keyword.length > 80) throw new Error("keyword 最多 80 个字符");
  if (query.includeEmployeeId && !uuidSchema.safeParse(query.includeEmployeeId).success) {
    throw new Error("includeEmployeeId 必须是有效标识");
  }
  if (keyword) params.set("keyword", keyword);
  if (query.includeEmployeeId) params.set("includeEmployeeId", query.includeEmployeeId);
  return `/platform/billing/service-trials/assignee-candidates?${params.toString()}`;
}

export function resetTrialAssigneeSearchPage(
  current: { page: number; keyword: string },
  keyword: string,
): { page: number; keyword: string } {
  const normalizedCurrent = normalizeKeyword(current.keyword);
  const normalizedNext = normalizeKeyword(keyword);
  if (current.keyword === normalizedNext) return current;
  return {
    page: normalizedCurrent === normalizedNext ? current.page : 1,
    keyword: normalizedNext,
  };
}

export function clampTrialAssigneeSearchPage(
  currentPage: number,
  totalPages: number,
): number {
  return Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
}

export function getTrialAssigneeEmptyMessage({
  loading,
  error,
}: {
  loading: boolean;
  error: string;
}): string | null {
  if (error) return null;
  return loading ? "加载中..." : "没有匹配的平台人员";
}

export function parseTrialAssigneeCandidatePage(
  input: unknown,
): PlatformServiceTrialAssigneeCandidatePage {
  const parsed = candidatePageSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("平台跟进人候选数据格式错误");
  }
  return parsed.data;
}

export function formatTrialAssigneeCandidate(
  candidate: PlatformServiceTrialAssigneeCandidate,
): string {
  const parts = [candidate.name?.trim() || "未命名平台人员"];
  const meta = formatTrialAssigneeCandidateMeta(candidate);
  if (meta) parts.push(meta);
  return parts.join(" · ");
}

export function formatTrialAssigneeCandidateMeta(
  candidate: PlatformServiceTrialAssigneeCandidate,
): string {
  const parts: string[] = [];
  if (candidate.phone_masked) parts.push(candidate.phone_masked);
  if (candidate.historical) {
    parts.push(`历史负责人（${formatHistoricalStatus(candidate.status)}）`);
  } else {
    const roles = candidate.roles.map((role) => role.name?.trim() || role.code);
    if (roles.length > 0) parts.push(roles.join("、"));
  }
  return parts.join(" · ");
}

export function selectTrialAssigneeCandidate(
  candidate: PlatformServiceTrialAssigneeCandidate,
): string | null {
  return candidate.selectable ? candidate.id : null;
}

export function getTrialAssigneeSelectionActions({
  value,
  allowClear,
  required,
}: {
  value: string | null;
  allowClear: boolean;
  required: boolean;
}): Array<"clear"> {
  return value && allowClear && !required ? ["clear"] : [];
}

export function getVisibleTrialAssigneeCandidates({
  candidates,
  value,
  selectedCandidate,
  resultIsCurrent,
}: {
  candidates: PlatformServiceTrialAssigneeCandidate[];
  value: string | null;
  selectedCandidate: PlatformServiceTrialAssigneeCandidate | null;
  resultIsCurrent: boolean;
}): PlatformServiceTrialAssigneeCandidate[] {
  const selected = value && selectedCandidate?.id === value
    ? selectedCandidate
    : null;
  if (!resultIsCurrent) return selected ? [selected] : [];

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  if (selected && !byId.has(selected.id)) byId.set(selected.id, selected);
  return Array.from(byId.values());
}

export function createHistoricalTrialAssigneeCandidate(
  assignee: PlatformServiceTrialAssignee,
): PlatformServiceTrialAssigneeCandidate {
  return {
    id: assignee.id,
    name: assignee.name,
    phone_masked: assignee.phone,
    status: normalizeHistoricalStatus(assignee.status),
    roles: [],
    selectable: false,
    historical: true,
  };
}

function normalizeKeyword(keyword: string | undefined): string {
  return keyword?.trim().replace(/\s+/g, " ") || "";
}

function normalizeHistoricalStatus(
  status: string | null,
): PlatformServiceTrialAssigneeCandidate["status"] {
  if (status === "active" || status === "suspended" || status === "leaved" || status === "pending") {
    return status;
  }
  return "suspended";
}

function formatHistoricalStatus(
  status: PlatformServiceTrialAssigneeCandidate["status"],
): string {
  if (status === "leaved") return "已离职";
  if (status === "pending") return "待启用";
  if (status === "active") return "历史记录";
  return "已停用";
}
