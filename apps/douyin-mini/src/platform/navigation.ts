import type { ServiceUnavailableCode } from "../models";
import { ApiRequestError } from "../api/request";

const PAGE_PATHS = new Set([
  "pages/sites/index",
  "pages/company/index",
  "pages/privacy/index",
  "pages/case-detail/index",
  "pages/site-detail/index",
  "pages/qa/index",
  "pages/lead-success/index",
  "pages/service-unavailable/index",
  "pages/materials/index",
  "pages/material-detail/index",
  "pages/my-materials/index",
]);
const TAB_PATHS = {
  home: "pages/home/index",
  cases: "pages/cases/index",
  budget: "pages/budget/index",
  lead: "pages/lead/index",
} as const;
const UUID_PATTERN = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

export type TabName = keyof typeof TAB_PATHS;

export function buildPageRoute(path: string): string {
  if (!PAGE_PATHS.has(path)) throw invalidNavigationTarget();
  return `/${path}`;
}

export function buildTabRoute(tab: TabName): string {
  const path = TAB_PATHS[tab];
  if (!path) throw invalidNavigationTarget();
  return `/${path}`;
}

export function buildEntityDetailRoute(type: "case" | "site", id: string): string {
  if (!UUID_PATTERN.test(id)) throw invalidNavigationTarget();
  return `${buildPageRoute("pages/case-detail/index")}?id=${encodeURIComponent(id)}`;
}

export function buildMaterialDetailRoute(id: string): string {
  const normalized = normalizeUuid(id);
  return `${buildPageRoute("pages/material-detail/index")}?id=${encodeURIComponent(normalized)}`;
}

export function buildOwnedMaterialDetailRoute(claimId: string): string {
  const normalized = normalizeUuid(claimId);
  return `${buildPageRoute("pages/material-detail/index")}?claimId=${encodeURIComponent(normalized)}`;
}

export function navigateToPage(path: string): Promise<void> {
  return navigate("navigateTo", buildPageRoute(path));
}

export function switchToTab(tab: TabName): Promise<void> {
  return navigate("switchTab", buildTabRoute(tab));
}

export function navigateToEntityDetail(type: "case" | "site", id: string): Promise<void> {
  return navigate("navigateTo", buildEntityDetailRoute(type, id));
}

export function navigateToMaterialDetail(id: string): Promise<void> {
  return navigate("navigateTo", buildMaterialDetailRoute(id));
}

export function navigateToOwnedMaterialDetail(claimId: string): Promise<void> {
  return navigate("navigateTo", buildOwnedMaterialDetailRoute(claimId));
}

export function navigateToServiceUnavailable(code: ServiceUnavailableCode): Promise<void> {
  return new Promise((resolve, reject) => {
    tt.reLaunch({
      url: `/pages/service-unavailable/index?code=${encodeURIComponent(code)}`,
      success: () => resolve(),
      fail: () => reject(new ApiRequestError(
        0,
        "NETWORK_ERROR",
        "页面跳转失败",
      )),
    });
  });
}

function navigate(method: "navigateTo" | "switchTab", url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tt[method]({
      url,
      success: () => resolve(),
      fail: () => reject(invalidNavigationTarget()),
    });
  });
}

function invalidNavigationTarget() {
  return new ApiRequestError(
    0,
    "INVALID_NAVIGATION_TARGET",
    "INVALID_NAVIGATION_TARGET",
  );
}

function normalizeUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) throw invalidNavigationTarget();
  return value.toLowerCase();
}
