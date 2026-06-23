# 装修公司财务系统文档

本目录收纳装修公司项目经营财务系统的 PRD、实施计划、Admin 对接、小程序对接、数据模型和支付能力设计。

范围聚焦租户装修业务内的项目收付款、报销与成本、财务流水、项目利润、workflow 联动和未来微信支付接入。平台 SaaS 计费、租户余额、短信/AI 扣费等平台收入能力不放在本目录，避免和租户项目经营财务混淆。

## 文档索引

- [2026-06-16-prd.md](./2026-06-16-prd.md)：装修公司财务系统 PRD，包含 workflow、Admin、小程序、权限和微信支付配置原则。
- [implementation-plan.md](./implementation-plan.md)：第一阶段实施计划，聚焦人工确认收款、workflow 推进、财务台账、Admin 和小程序交接。
- [2026-06-23-phase2-receivables-implementation-plan.md](./2026-06-23-phase2-receivables-implementation-plan.md)：第二阶段应收计划和逾期管理实施计划。
- [2026-06-23-phase2-receivables-miniprogram-handoff.md](./2026-06-23-phase2-receivables-miniprogram-handoff.md)：第二阶段应收计划小程序对接说明，包含 workflow v2 字段、complete payload 和 smoke 清单。
- [2026-06-23-phase2-receivables-smoke.md](./2026-06-23-phase2-receivables-smoke.md)：第二阶段应收计划 Task 6 smoke 记录，包含只读接口验收、样本缺失阻塞原因和完整 E2E 继续条件。
- `admin-integration.md`：后续 Admin 菜单、页面、权限与交互对接。
- [miniprogram-handoff.md](./miniprogram-handoff.md)：小程序任务中心和财务确认收款对接。
- [2026-06-16-miniprogram-real-integration-plan.md](./2026-06-16-miniprogram-real-integration-plan.md)：小程序真实联调执行计划，包含 gooes 和 orange 的任务拆分。
- [2026-06-16-miniprogram-integration-acceptance.md](./2026-06-16-miniprogram-integration-acceptance.md)：小程序财务收款联调验收记录。
- `payment-provider-wechat-pay.md`：后续微信支付商户配置、回调、幂等和 workflow 自动推进设计。
- [data-model-and-migrations.md](./data-model-and-migrations.md)：第一阶段数据模型、migration、台账、权限和微信支付配置空壳。
- `rollout-and-acceptance.md`：后续灰度发布、验收记录和回滚方案。

## 命名约定

- 已定稿或评审过的文件使用 `YYYY-MM-DD-主题.md`。
- 持续维护型执行文档使用语义名。
- 本目录只放租户装修业务财务；平台级计费和用量结算继续放在对应 billing 文档中。
