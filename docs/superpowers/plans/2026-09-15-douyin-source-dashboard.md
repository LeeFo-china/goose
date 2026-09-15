# 抖音小程序站内来源看板实施计划

> **For agentic workers:** Implement inline in this worktree. Each task follows red → green → verification and uses `- [ ]` for tracking.

**Goal:** 为租户后台提供不混入旧错误归因的抖音小程序站内入口、浏览、量房留资来源看板，并在线索详情展示留资创建时间。

**Architecture:** 复用 `marketing_events` 与预约快照。新小程序在有界官方读取后记录每次外部入口，并为客户端事件加 `capture_version=2`；服务端按同租户、同主体和同来源匹配成功预约，聚合成时间趋势与分页来源排行。Admin 沿用现有权限和组件。

**Tech Stack:** Bun/TypeScript、Fastify、Supabase PostgreSQL migration、Next.js/shadcn/ui。

---

### Task 1: 入口事件与口径标记

**Files:** `apps/douyin-mini/src/app.ts`, `apps/douyin-mini/src/platform/analysis-info.ts`, `apps/douyin-mini/src/platform/analytics.ts`, adjacent tests; `apps/api/src/schema/douyin-miniapp.ts`, `apps/api/src/services/douyin-miniapp/marketing.ts`, `apps/api/src/repositories/douyin-miniapp-marketing.ts`, adjacent tests.

- [ ] 测试：官方读取延迟时入口事件携带最终来源；再次外部进入各记一次；过期回调不得记上一次来源；旧队列事件仍可读取。
- [ ] 运行定向测试，确认新增用例按缺失行为失败。
- [ ] 在 `App.onLaunch/onShow` 调用有界 `entryAttribution.ready()` 后记录入口；`AnalyticsQueue` 支持可选固定 `capture_version: 2`，请求 schema 与 repository 仅把已验证标记写入载荷；保留旧事件兼容。
- [ ] 运行小程序/API 定向测试和 typecheck，提交单目标 commit。

### Task 2: 租户来源聚合

**Files:** 新增 `supabase/migrations/20260915180000_douyin_source_dashboard_stats.sql`, `apps/api/src/repositories/douyin-source-stats.ts`, `apps/api/src/services/tenant-douyin-source-stats.ts`, `apps/api/src/schema/tenant-douyin-source-stats.ts`, `apps/api/src/controllers/tenant-douyin-source-stats/index.ts`, route registry and adjacent tests.

- [ ] 测试：近 7/30/90 天边界、分页 `page=1&pageSize=20` 与最多 100、无权限和外租户拒绝、旧无标记入口不计数、官方优先于手工标记、重复预约 ID 去重。
- [ ] 运行定向测试，确认缺失聚合/接口造成预期失败。
- [ ] Migration 增加只读来源键与有界聚合函数，按 `tenant_id`、日期、事件、`capture_version=2` 筛选；成功预约仅计入匹配新口径入口的同主体同来源记录。返回总览、北京时间逐日、来源类型汇总、分页来源排行及数据起算时间。必要索引必须写在 migration。
- [ ] Repository 只调用 RPC 且严格校验响应；service 绑定租户并检查 `douyin_miniapp.read`；controller 只校验 HTTP 与封装成功响应；列表严格分页。
- [ ] 运行 API 定向测试/typecheck、迁移 contract 与开发库 SQL smoke；查看 `EXPLAIN ANALYZE`，提交单目标 commit。

### Task 3: 后台看板及留资时间

**Files:** 新增 `apps/admin/app/(console)/douyin-miniapp/traffic/page.tsx`, `apps/admin/components/douyin-miniapp/traffic-*`; 修改 `apps/admin/components/layout/menu-config.ts`, `apps/admin/components/customer-leads/leads-workbench-panels.tsx`, adjacent tests.

- [ ] 测试：按租户权限读取、筛选 7/30/90 天、分页、空/加载/失败、来源标识与采集依据；线索详情显示预约创建时间到秒，无预约时显示线索创建时间。
- [ ] 运行定向测试，确认原页面没有来源看板和留资时间。
- [ ] 复用现有 Admin UI 实现指标卡、每日趋势、来源类型与分页排行，说明历史数据隔离及效率指标含义；线索详情只使用已有 `created_at`，以北京时间显示。
- [ ] 运行 Admin 定向测试、typecheck、构建与窄屏 browser smoke，提交单目标 commit。

### Task 4: 发布与真机验收

- [ ] 核对 migration 待执行版本与 SQL，生产应用后运行 `supabase migration list` 对齐检查。
- [ ] 发布 API/Admin 并做租户权限和返回结构 smoke；新看板对旧模板显示无新口径样本。
- [ ] 上传包含入口修正的新抖音体验版，核对实际 AppID、版本与 API 环境。
- [ ] 用绑定品牌/员工号真实视频、直播、主页及直接入口提交内部样本，核对后台来源、创建时间和看板趋势；未取得真机证据前只报告“代码已发布，真实归因待验收”。
