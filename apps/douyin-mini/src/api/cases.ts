import type { PublicProject, PublicProjectPage } from "../models";
import {
  isPublicContentId,
  parseProject,
  parseProjectPage,
} from "./content-validation";
import { ApiClient, ApiRequestError } from "./request";

export type CaseListQuery = {
  page: number;
  pageSize: number;
  style?: string;
  layout?: string;
};

export async function fetchCases(
  client: ApiClient,
  query: CaseListQuery,
): Promise<PublicProjectPage> {
  if (!validPage(query.page, query.pageSize)) throw invalidQuery();
  const parameters = [`page=${query.page}`, `pageSize=${query.pageSize}`];
  appendFilter(parameters, "style", query.style);
  appendFilter(parameters, "layout", query.layout);
  const value = await client.request<unknown>({
    path: `/douyin-mini/cases?${parameters.join("&")}`,
    method: "GET",
  });
  const result = parseProjectPage(value);
  if (!result || result.pagination.page !== query.page
    || result.pagination.pageSize !== query.pageSize) throw invalidResponse();
  return result;
}

export async function fetchCaseDetail(client: ApiClient, id: string): Promise<PublicProject> {
  if (!isPublicContentId(id)) {
    throw new ApiRequestError(0, "INVALID_CONTENT_ID", "案例编号无效");
  }
  const value = await client.request<unknown>({
    path: `/douyin-mini/cases/${encodeURIComponent(id)}`,
    method: "GET",
  });
  const project = parseProject(value);
  if (!project || project.id !== id) throw invalidResponse();
  return project;
}

function appendFilter(parameters: string[], key: string, value?: string) {
  if (value === undefined) return;
  const normalized = value.trim();
  if (!normalized || normalized.length > 40) throw invalidQuery();
  parameters.push(`${key}=${encodeURIComponent(normalized)}`);
}

function validPage(page: number, pageSize: number) {
  return Number.isInteger(page) && page >= 1 && page <= 10_000
    && Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100;
}

function invalidQuery() {
  return new ApiRequestError(0, "INVALID_CONTENT_QUERY", "案例筛选条件无效");
}

function invalidResponse() {
  return new ApiRequestError(502, "INVALID_API_RESPONSE", "案例数据无效");
}
