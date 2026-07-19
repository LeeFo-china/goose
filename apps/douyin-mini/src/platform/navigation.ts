import type { ServiceUnavailableCode } from "../models";
import { ApiRequestError } from "../api/request";

const PAGE_PATHS = new Set([
  "pages/home/index",
  "pages/company/index",
  "pages/privacy/index",
  "pages/cases/index",
  "pages/case-detail/index",
  "pages/sites/index",
  "pages/site-detail/index",
  "pages/lead/index",
  "pages/lead-success/index",
  "pages/service-unavailable/index",
]);
const TAB_PATHS = {
  home: "pages/home/index",
  cases: "pages/cases/index",
  sites: "pages/sites/index",
  lead: "pages/lead/index",
} as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TabName = keyof typeof TAB_PATHS;

export function buildPageRoute(path: string): string {
  if (!PAGE_PATHS.has(path)) throw invalidNavigationTarget();
  return `/${path}`;
}

export function buildTabRoute(tab: TabName): string {
  const path = TAB_PATHS[tab];
  if (!path) throw invalidNavigationTarget();
  return buildPageRoute(path);
}

export function buildEntityDetailRoute(type: "case" | "site", id: string): string {
  if (!UUID_PATTERN.test(id)) throw invalidNavigationTarget();
  const path = type === "case" ? "pages/case-detail/index" : "pages/site-detail/index";
  return `${buildPageRoute(path)}?id=${encodeURIComponent(id)}`;
}

export function navigateToPage(path: string): Promise<void> {
  return navigate("navigateTo", buildPageRoute(path));
}

export function switchToTab(tab: TabName): Promise<void> {
  return navigate("switchTab", buildTabRoute(tab));
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
