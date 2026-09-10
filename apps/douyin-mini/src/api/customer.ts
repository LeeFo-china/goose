import type {
  CustomerProject,
  CustomerProjectLog,
  CustomerProjectLogPage,
  CustomerProjectPage,
  PaginationMeta,
} from "../models";
import { ApiClient, ApiRequestError } from "./request";
import { normalizeMaterialUuid } from "./material-uuid";

export type CustomerProjectQuery = { page: number; pageSize: number };

export async function fetchCustomerProjects(
  client: ApiClient,
  query: CustomerProjectQuery,
): Promise<CustomerProjectPage> {
  validatePage(query);
  const value = await client.request<unknown>({
    path: `/customer/projects?page=${query.page}&pageSize=${query.pageSize}`,
    method: "GET",
  });
  const result = parseProjectPage(value);
  if (!result || !matchesPage(result.pagination, query)) throw invalidResponse();
  return result;
}

export async function fetchCustomerProjectDetail(
  client: ApiClient,
  projectId: string,
): Promise<CustomerProject> {
  const id = normalizeId(projectId);
  const value = await client.request<unknown>({
    path: `/customer/projects/${encodeURIComponent(id)}`,
    method: "GET",
  });
  const project = parseProject(value);
  if (!project || project.id !== id) throw invalidResponse();
  return project;
}

export async function fetchCustomerProjectLogs(
  client: ApiClient,
  projectId: string,
  query: CustomerProjectQuery,
): Promise<CustomerProjectLogPage> {
  const id = normalizeId(projectId);
  validatePage(query);
  const value = await client.request<unknown>({
    path: `/customer/projects/${encodeURIComponent(id)}/logs?page=${query.page}&pageSize=${query.pageSize}`,
    method: "GET",
  });
  const result = parseLogPage(value);
  if (!result || !matchesPage(result.pagination, query)) throw invalidResponse();
  return result;
}

function parseProjectPage(value: unknown): CustomerProjectPage | null {
  const page = parsePage(value, parseProject);
  return page ? { list: page.list, pagination: page.pagination } : null;
}

function parseLogPage(value: unknown): CustomerProjectLogPage | null {
  const page = parsePage(value, parseLog);
  return page ? { list: page.list, pagination: page.pagination } : null;
}

function parsePage<Item>(
  value: unknown,
  parseItem: (value: unknown) => Item | null,
): { list: Item[]; pagination: PaginationMeta } | null {
  if (!isRecord(value) || !Array.isArray(value.list)) return null;
  const pagination = parsePagination(value.pagination);
  const list = value.list.map(parseItem);
  return pagination && list.every((item): item is Item => item !== null)
    ? { list, pagination }
    : null;
}

function parseProject(value: unknown): CustomerProject | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  return value as CustomerProject;
}

function parseLog(value: unknown): CustomerProjectLog | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.project_id !== "string") {
    return null;
  }
  if (!Array.isArray(value.images)) return null;
  return value as CustomerProjectLog;
}

function parsePagination(value: unknown): PaginationMeta | null {
  if (!isRecord(value)) return null;
  const { page, pageSize, total, totalPages } = value;
  return [page, pageSize, total, totalPages].every((item) =>
    typeof item === "number" && Number.isInteger(item) && item >= 0)
    ? { page, pageSize, total, totalPages } as PaginationMeta
    : null;
}

function validatePage(query: CustomerProjectQuery): void {
  if (!Number.isInteger(query.page) || query.page < 1
    || !Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100) {
    throw new ApiRequestError(0, "INVALID_CUSTOMER_QUERY", "客户项目查询条件无效");
  }
}

function matchesPage(pagination: PaginationMeta, query: CustomerProjectQuery): boolean {
  return pagination.page === query.page && pagination.pageSize === query.pageSize;
}

function normalizeId(value: string): string {
  const normalized = normalizeMaterialUuid(value);
  if (!normalized) {
    throw new ApiRequestError(0, "INVALID_CUSTOMER_PROJECT_ID", "项目编号无效");
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidResponse(): ApiRequestError {
  return new ApiRequestError(502, "INVALID_API_RESPONSE", "客户项目数据无效");
}
