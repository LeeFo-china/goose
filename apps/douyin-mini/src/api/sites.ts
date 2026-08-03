import type {
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

export type SitePageQuery = { page: number; pageSize: number };

export async function fetchSites(
  client: ApiClient,
  query: SitePageQuery,
): Promise<PublicProjectPage> {
  validatePage(query);
  const value = await client.request<unknown>({
    path: `/douyin-mini/sites?page=${query.page}&pageSize=${query.pageSize}`,
    method: "GET",
  });
  const result = parseProjectPage(value);
  if (!result || !matchesPage(result.pagination, query)) throw invalidResponse();
  return result;
}

export async function fetchSiteDetail(client: ApiClient, id: string): Promise<PublicProject> {
  validateId(id);
  const value = await client.request<unknown>({
    path: `/douyin-mini/sites/${encodeURIComponent(id)}`,
    method: "GET",
  });
  const site = parseProject(value);
  if (!site || site.id !== id) throw invalidResponse();
  return site;
}

export async function fetchSiteLogs(
  client: ApiClient,
  id: string,
  query: SitePageQuery,
): Promise<PublicSiteLogPage> {
  validateId(id);
  validatePage(query);
  const value = await client.request<unknown>({
    path: `/douyin-mini/sites/${encodeURIComponent(id)}/logs?page=${query.page}&pageSize=${query.pageSize}`,
    method: "GET",
  });
  const result = parseSiteLogPage(value);
  if (!result || !matchesPage(result.pagination, query)) throw invalidResponse();
  return result;
}

function validateId(id: string) {
  if (!isPublicContentId(id)) {
    throw new ApiRequestError(0, "INVALID_CONTENT_ID", "工地编号无效");
  }
}

function validatePage(query: SitePageQuery) {
  if (!Number.isInteger(query.page) || query.page < 1 || query.page > 10_000
    || !Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100) {
    throw new ApiRequestError(0, "INVALID_CONTENT_QUERY", "分页条件无效");
  }
}

function matchesPage(
  pagination: { page: number; pageSize: number },
  query: SitePageQuery,
) {
  return pagination.page === query.page && pagination.pageSize === query.pageSize;
}

function invalidResponse() {
  return new ApiRequestError(502, "INVALID_API_RESPONSE", "工地数据无效");
}
