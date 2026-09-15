import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { tenantNavGroups } from "@/components/layout/menu-config";
import {
  TrafficDashboard,
  buildTrafficHref,
  normalizeTrafficStats,
  parseTrafficFilters,
} from "./traffic-dashboard";

const stats = {
  window_start: "2026-09-09T00:00:00+08:00",
  window_end: "2026-09-16T00:00:00+08:00",
  first_captured_at: "2026-09-14T12:00:00+08:00",
  overview: { entries: 20, visitors: 12, page_views: 30,
    lead_clicks: 4, appointments: 2, lead_people: 2 },
  daily: Array.from({ length: 7 }, (_, offset) => ({
    date: `2026-09-${String(9 + offset).padStart(2, "0")}`,
    entries: offset === 6 ? 20 : 0, visitors: offset === 6 ? 12 : 0,
    page_views: offset === 6 ? 30 : 0, lead_clicks: offset === 6 ? 4 : 0,
    appointments: offset === 6 ? 2 : 0,
  })),
  source_types: [
    { basis: "official_video", entries: 15, visitors: 9, page_views: 25,
      lead_clicks: 3, appointments: 2 },
    { basis: "unidentified", entries: 5, visitors: 3, page_views: 5,
      lead_clicks: 1, appointments: 0 },
  ],
  sources: { list: [
    { source_key: "video:123", basis: "official_video", source_type: "short_video",
      account_id: "creator-1", video_id: "123", live_room_id: null,
      entries: 15, visitors: 9, page_views: 25, lead_clicks: 3, appointments: 2 },
    { source_key: "unidentified", basis: "unidentified", source_type: "direct",
      account_id: null, video_id: null, live_room_id: null,
      entries: 5, visitors: 3, page_views: 5, lead_clicks: 1, appointments: 0 },
  ], pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 } },
};

describe("tenant Douyin traffic dashboard", () => {
  test("bounds filters, builds stable links and rejects unsafe responses", () => {
    expect(parseTrafficFilters(new URLSearchParams())).toEqual({ days: 7,
      groupBy: "content", page: 1 });
    expect(parseTrafficFilters(new URLSearchParams("days=90&groupBy=account&page=2")))
      .toEqual({ days: 90, groupBy: "account", page: 2 });
    expect(parseTrafficFilters(new URLSearchParams("days=365&groupBy=unknown&page=-2")))
      .toEqual({ days: 7, groupBy: "content", page: 1 });
    expect(buildTrafficHref({ days: 30, groupBy: "account", page: 2 }))
      .toBe("/douyin-miniapp/traffic?days=30&groupBy=account&page=2");
    expect(normalizeTrafficStats(stats, { days: 7, groupBy: "content", page: 1 }))
      .not.toBeNull();
    expect(normalizeTrafficStats({ ...stats, tenant_id: "private" },
      { days: 7, groupBy: "content", page: 1 })).toBeNull();
    expect(normalizeTrafficStats({ ...stats, sources: { ...stats.sources,
      pagination: { ...stats.sources.pagination, page: 2 } } },
    { days: 7, groupBy: "content", page: 1 })).toBeNull();
  });

  test("shows internally observed funnel, source provenance and coverage", () => {
    const parsed = normalizeTrafficStats(stats,
      { days: 7, groupBy: "content", page: 1 });
    expect(parsed).not.toBeNull();
    const html = renderToStaticMarkup(createElement(TrafficDashboard,
      { data: parsed, filters: { days: 7, groupBy: "content", page: 1 }, error: null }));
    expect(html).toContain("流量来源统计");
    expect(html).toContain("入口次数");
    expect(html).toContain("访问人数");
    expect(html).toContain("页面浏览");
    expect(html).toContain("预约人数");
    expect(html).toContain("抖音官方识别 · 视频");
    expect(html).toContain("未识别");
    expect(html).toContain("视频 ID：123");
    expect(html).toContain("仅统计新版入口采集");
    expect(html).not.toContain("确定的直接流量");
  });

  test("keeps empty, error and navigation states readable", () => {
    const filters = { days: 7 as const, groupBy: "content" as const, page: 1 };
    const empty = normalizeTrafficStats({ ...stats, first_captured_at: null,
      overview: { entries: 0, visitors: 0, page_views: 0,
        lead_clicks: 0, appointments: 0, lead_people: 0 },
      source_types: [], sources: { list: [], pagination: {
        page: 1, pageSize: 20, total: 0, totalPages: 0 } },
    }, filters);
    const emptyHtml = renderToStaticMarkup(createElement(TrafficDashboard,
      { data: empty, filters, error: null }));
    expect(emptyHtml).toContain("暂无新版入口数据");
    const errorHtml = renderToStaticMarkup(createElement(TrafficDashboard,
      { data: null, filters, error: "读取失败" }));
    expect(errorHtml).toContain("读取失败");
    expect(tenantNavGroups.flatMap((group) => group.items).some((item) =>
      item.href === "/douyin-miniapp/traffic" &&
      item.permission === "douyin_miniapp.read")).toBe(true);
  });
});
