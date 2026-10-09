# Tenant Activity Implementation Plan

> **For agentic workers:** Use executing-plans task-by-task. Parallel workers own disjoint data/read, admin UI, and collection paths.

**Goal:** 在租户列表与详情展示可靠的近7日员工活跃摘要及分端登录/业务使用统计。
**Architecture:** Supabase migration提供幂等记录RPC和批量读取RPC；API认证后采集并返回summary；后台显式上报主动浏览，成功登录/业务动作由API采集。
**Tech Stack:** Bun / Fastify / Supabase PostgreSQL / Next.js / shadcn，复用现有依赖。

## Contract

`TenantActivitySummary`字段：status='collecting'|'ready'|'unavailable'; collection_started_at:string|null; window_start/window_end:string|null; observed_days:number; last_active_at:string|null; active_employee_count:number|null; admin_active_employee_count:number|null; mini_active_employee_count:number|null; active_days:number|null; admin_login_count:number|null; mini_login_count:number|null; business_actions:{customer_created,follow_up_created,project_created,construction_log_created,acceptance_handled:number}|null。
`activity?:TenantActivitySummary` 追加到list[].tenant record与detail。缺失表示尚未采集。mini浏览未接入的说明固定展示。全量趋势不在首期。

`record_tenant_activity(p_tenant_id uuid,p_employee_id uuid,p_channel text,p_kind text,p_event_key text)` kinds: view,login,customer_created,follow_up_created,project_created,construction_log_created,acceptance_handled。返回boolean。数据库服务器now()与Asia/Shanghai日界；验证同租户员工且非平台员工。对event_key幂等；view无需login计数。仓储.record(input:{tenantId,employeeId,channel:'admin_web'|'wechat_mini',kind,eventKey})。
`get_tenant_activity_summaries(p_tenant_ids uuid[])` 最多100，返回jsonb数组[{tenant_id,...summary}]，start=max(global采集起点,tenant.created_at)，observed_days最多7，last_active_at全期，人数跨渠道去重。仓储.listSummaries(tenantIds) -> Map<string,TenantActivitySummary>。

## Tasks

- [x] 数据与读取：新增domain types、migration、RPC repository、platformTenantService批量拼装；SQL测试并发/去重/租户/RLS/日期/空历史，仓储和service测试错误降级。独立worker负责。
- [x] 后台UI：新增摘要cell与详情section，复用现有页面；后台显式view采集组件使用 `/api/backend/tenant-activity/view` POST {screen:'customers'|'projects'|'dashboard'|'finance'}。只在前台/导航/恢复可见时，按screen+5分钟sessionStorage去重；无轮询，无平台页面上报。截图与组件测试。独立worker负责。
- [x] API采集：新专用controller endpoint、schema、service、Fastify response hook与明确route classifier；不接受身份ID参数。读取scope允许grace只读页面上报，不放宽业务权限。成功登录token在内存解析不落库；自动wechat auth不算登录。最小静态检查与鉴权/错误/重试回归。
- [x] 集成：隔离SQL验证（不写生产）；bun API check、admin check、聚焦测试与浏览器UI验收；评审；交接小程序字段与采集规则；更新计划与提交。

## Verification

`bun run --cwd apps/api check`；`bun run --cwd apps/admin check`；新增tenant-activity tests独立运行以避免mock.module污染；SQL事务隔离验证，同租户 employee与同key重复请求计数一次，两个渠道同员工总人数1。
部署顺序先migration、再API、再admin；migration应用前确认清单、后用migration list对齐。未部署时UI明确未采集，不提供虚假零值。回滚应用先停采集不删除历史，数据库表非破坏性新增。

## Review follow-ups

独立评审发现并修正：手机号真实员工模式 `tenant_employee`；身份选择消费后的重试使用验证会话ID去重；整改使用本次持久化动作ID而非未变化的验收单时间；北京时间跨午夜主动浏览解除上一日去重。主审同时纠正后台采集对 `{data:{recorded:boolean},message}` 的响应判断，补齐未激活和不足完整窗口提示。新增回归覆盖上述边界。

验证结果与已知环境限制见 [实现验证记录](../../operations/evidence/2026-10-09-tenant-activity-implementation.md)。本轮仅本地代码交付，生产 migration 与部署尚未执行。
