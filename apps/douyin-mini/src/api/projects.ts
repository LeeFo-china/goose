import type {
  PublicProjectPhase,
  PublicProject,
  PublicProjectPage,
  PublicSiteLogPage,
} from "../models";
import {
  isPublicContentId,
  parseProject,
  parseProjectPage,
  parseSiteLogPage,
} from "./content-validation";
import { ApiClient, ApiRequestError } from "./request";

export type ProjectListQuery = {
  page: number;
  pageSize: number;
  phase?: PublicProjectPhase;
  style?: string;
  layout?: string;
};

export type ProjectLogQuery = { page: number; pageSize: number };

export async function fetchProjects(
  client: ApiClient,
  query: ProjectListQuery,
): Promise<PublicProjectPage> {
  validatePage(query);
  if (query.phase !== undefined
    && query.phase !== "in_progress"
    && query.phase !== "completed") throw invalidQuery();
  const parameters = [`page=${query.page}`, `pageSize=${query.pageSize}`];
  if (query.phase) parameters.push(`phase=${query.phase}`);
  appendFilter(parameters, "style", query.style);
  appendFilter(parameters, "layout", query.layout);
  const value = await client.request<unknown>({
    path: `/douyin-mini/projects?${parameters.join("&")}`,
    method: "GET",
  });
  const result = parseProjectPage(value);
  if (!result || !matchesPage(result.pagination, query)) throw invalidResponse();
  return result;
}

export async function fetchProjectDetail(
  client: ApiClient,
  id: string,
): Promise<PublicProject> {
  validateId(id);
  const value = await client.request<unknown>({
    path: `/douyin-mini/projects/${encodeURIComponent(id)}`,
    method: "GET",
  });
  const project = parseProject(value);
  if (!project || project.id !== id) throw invalidResponse();
  return project;
}

export async function fetchProjectLogs(
  client: ApiClient,
  id: string,
  query: ProjectLogQuery,
): Promise<PublicSiteLogPage> {
  validateId(id);
  validatePage(query);
  const value = await client.request<unknown>({
    path: `/douyin-mini/projects/${encodeURIComponent(id)}/logs?page=${query.page}&pageSize=${query.pageSize}`,
    method: "GET",
  });
  const result = parseSiteLogPage(value);
  if (!result || !matchesPage(result.pagination, query)) throw invalidResponse();
  return result;
}

function validateId(id: string): void {
  if (!isPublicContentId(id)) {
    throw new ApiRequestError(0, "INVALID_CONTENT_ID", "项目编号无效");
  }
}

function validatePage(query: ProjectLogQuery): void {
  if (!Number.isInteger(query.page) || query.page < 1 || query.page > 10_000
    || !Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100) {
    throw invalidQuery();
  }
}

function appendFilter(parameters: string[], key: string, value?: string): void {
  if (value === undefined) return;
  const normalized = value.trim();
  if (!normalized || normalized.length > 40) throw invalidQuery();
  parameters.push(`${key}=${encodeURIComponent(normalized)}`);
}

function matchesPage(
  pagination: { page: number; pageSize: number },
  query: ProjectLogQuery,
): boolean {
  return pagination.page === query.page && pagination.pageSize === query.pageSize;
}

function invalidQuery(): ApiRequestError {
  return new ApiRequestError(0, "INVALID_CONTENT_QUERY", "项目筛选条件无效");
}

function invalidResponse(): ApiRequestError {
  return new ApiRequestError(502, "INVALID_API_RESPONSE", "项目数据无效");
}
