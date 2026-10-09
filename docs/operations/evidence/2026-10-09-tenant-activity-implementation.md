# 租户活跃概览实现与验证

本轮为代码交付，未部署生产、未应用生产 migration；orange 未修改。

后续用户要求继续推进后，已完成 [生产发布与实际环境验收](2026-10-09-tenant-activity-production-release.md)。下文保留实现阶段的验证记录与当时边界。

## 交付范围

- 平台租户分页列表：最后有效使用、近7日后台/小程序活跃员工、跨端去重人数、活跃天数。
- 租户详情：平铺展示以上指标、分端成功登录次数，以及新增客户、跟进、项目、施工日志、处理验收次数。
- API采集成功登录和明确业务动作；后台显式采集有权限的可见业务页面导航/恢复，无轮询。
- 数据库为服务角色RPC、RLS保护的幂等凭据和每日汇总；列表单次批量读取最多100租户。
- 采集前为null；不足完整窗口注明采集中；读取故障为unavailable，不能用0替代。

## 验证

工作目录为本仓库的 `feat/tenant-activity` 工作树。测试使用合成数据，SQL仅运行于自建隔离容器。

| 检查 | 结果 |
| --- | --- |
| API `bun run check` | 类型、构建、500行限制通过 |
| Admin `bun run check` | 类型及500行限制通过 |
| capture / collection / response plugin | 15 passed |
| view controller route | 1 passed |
| activity repository | 17 passed |
| platform tenant activity integration | 6 passed |
| existing platform tenant service | 14 passed |
| phone login service / selection | 18 passed |
| rectification operation evidence / WeakMap helper | 4 passed |
| tenant service capability mapping | 38 passed |
| Admin component / tracker | 17 passed |
| Playwright `playwright.tenant-activity.config.ts` | 4 passed，桌面及390px宽度 |
| opt-in PostgreSQL integration | 2 passed，SQL语义/RLS/日期/100租户边界/EXPLAIN和真实并发 |

SQL并发：24个相同事件仅1次接受、23次去重；再写24个不同事件，最终25次。10,000条历史汇总数据的窗口查询使用 `tenant_activity_daily_pkey`。详细环境与复现见数据库验证记录。

独立评审发现并修正了真实手机号员工模式、消费后选择重试、整改未更新验收单版本、跨北京时间午夜去重四处问题。主审修正了后台成功响应格式判断，并补充无采集起点与不完整首日的展示。修正后重新运行相关回归和浏览器测试。

## 已知边界

- 现有 `tenant-service-route-inventory.test.ts` 因6条抖音手机号路由不在旧白名单中失败；在未修改的基线 `7ea221c9a` 上复现相同失败。本次不修改该无关白名单；新增路由权限和模块映射检查通过。
- 原共享PostgreSQL容器在权限测试的DO块发生进程异常；最终SQL验证使用同版本17.6、完整复制结构、关闭预加载扩展的隔离容器。不能把这次隔离验证宣称为生产扩展环境验收，详见数据库验证记录。
- 活跃采集为尽力记录的运营指标；采集故障有日志，但不承诺审计级零丢失。历史不回填。
- 小程序纯浏览尚需客户端接入。后端主动登录和业务动作可采集，页面明确披露范围。

## 发布顺序

1. 核对并应用 `20261009190000_tenant_activity_metrics.sql`，使用 migration list 检查 Local/Remote 对齐。
2. 部署API，在实际目标环境验证服务角色写入/读取、租户隔离及日志。
3. 部署Admin，确认首个事件激活采集，未采集/采集中/零值/不可用显示正确。
4. 小程序团队按 [接口交接](../../application_integration_documentation/2026-10-09-tenant-activity-collection.md) 接入主动浏览。

应用回滚先停止采集和统计读取；新增统计表可保留历史，不以删除表作为常规回滚。
