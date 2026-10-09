import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { TenantActivitySummary } from "@gooes/domain";
import { TenantActivityCell, TenantActivitySection } from "./tenant-activity";

const ready: TenantActivitySummary = {
  status: "ready", collection_started_at: "2026-09-01T00:00:00Z",
  window_start: "2026-10-02", window_end: "2026-10-08", observed_days: 7,
  last_active_at: "2026-10-08T20:00:00Z", active_employee_count: 3,
  admin_active_employee_count: 2, mini_active_employee_count: 2, active_days: 4,
  admin_login_count: 8, mini_login_count: 9,
  business_actions: { customer_created: 1, follow_up_created: 2, project_created: 3,
    construction_log_created: 4, acceptance_handled: 5 },
};
const render = (activity?: TenantActivitySummary) => renderToStaticMarkup(<TenantActivitySection activity={activity} />);

test("missing and unavailable summaries never manufacture zero activity", () => {
  expect(render()).toContain("尚未采集");
  const failed = render({ ...ready, status: "unavailable" });
  expect(failed).toContain("统计暂不可用");
  expect(failed).not.toContain(">8 次<");
  for (const markup of [render(), failed]) {
    expect(markup).not.toContain(">0 人<");
    expect(markup).toContain("小程序当前统计主动登录和业务操作，页面浏览待客户端接入");
  }
});

test("partial collection shows the start and observation days, and null is not zero", () => {
  const markup = render({ ...ready, status: "collecting", observed_days: 2,
    collection_started_at: "2026-10-07T18:00:00Z", last_active_at: null,
    active_employee_count: null, business_actions: null });
  expect(markup).toContain("采集中");
  expect(markup).toContain("已观察 2 / 7 天");
  expect(markup).toContain("2026/10/08");
  expect(markup).toContain("暂无活跃记录");
  expect(markup).toContain("暂无统计");
  expect(markup).not.toContain(">0 次<");
});

test("ready summary renders cross-channel dedup and all five business counts with Beijing dates", () => {
  const markup = render(ready);
  expect(markup).toContain("2026/10/09 04:00");
  for (const label of ["跨端去重员工", "后台登录", "小程序登录", "新增客户", "新增跟进", "新增项目", "施工日志", "处理验收"]) {
    expect(markup).toContain(label);
  }
  expect(markup).toContain(">8 次<");
  expect(markup).toContain(">9 次<");
  expect(markup).toContain(">3 人<");
  expect(markup).toContain("北京时间");
  const cell = renderToStaticMarkup(<TenantActivityCell activity={ready} />);
  expect(cell).toContain("后台 2 / 小程序 2 人");
  expect(cell).toContain("去重 3 人 · 活跃 4 天");
});

test("a measured zero remains zero, missing/invalid dates are explicit", () => {
  const markup = render({ ...ready, active_employee_count: 0, admin_login_count: 0,
    last_active_at: null, window_start: null, window_end: "invalid" });
  expect(markup).toContain(">0 人<");
  expect(markup).toContain(">0 次<");
  expect(markup).toContain("暂无活跃记录");
  expect(markup).toContain("统计日期暂不可用");
  expect(markup).not.toContain("Invalid Date");
});

test("collecting without a collection marker explicitly stays uncollected in list and detail", () => {
  const precollection: TenantActivitySummary = {
    ...ready, status: "collecting", collection_started_at: null, observed_days: 0,
    last_active_at: null, active_employee_count: 0, admin_active_employee_count: 0,
    mini_active_employee_count: 0, active_days: 0, admin_login_count: 0, mini_login_count: 0,
    business_actions: { customer_created: 0, follow_up_created: 0, project_created: 0,
      construction_log_created: 0, acceptance_handled: 0 },
  };
  const cell = renderToStaticMarkup(<TenantActivityCell activity={precollection} />);
  for (const markup of [cell, render(precollection)]) {
    expect(markup).toContain("尚未采集");
    expect(markup).not.toContain("采集中");
    expect(markup).not.toContain("暂无活跃记录");
    expect(markup).not.toContain("0/7");
    expect(markup).not.toContain("0 / 7");
    expect(markup).not.toMatch(/0 (人|次|天)/);
  }
  expect(render(precollection)).toContain("小程序当前统计主动登录和业务操作，页面浏览待客户端接入");
});

test("seven observed calendar days still warn when the first collection day is partial", () => {
  const activity: TenantActivitySummary = {
    ...ready, status: "collecting", observed_days: 7,
    collection_started_at: "2026-10-02T04:00:00Z",
  };
  const markup = render(activity);
  expect(markup).toContain("采集中");
  expect(markup).toContain("已观察 7 / 7 天");
  expect(markup).toContain("2026/10/02 12:00");
  expect(markup).toContain("近 7 日窗口尚未完整采集");
  expect(markup).toContain("以下为已观察时段的数据");
  expect(markup).toContain(">8 次<");
  expect(render(ready)).not.toContain("近 7 日窗口尚未完整采集");
});
