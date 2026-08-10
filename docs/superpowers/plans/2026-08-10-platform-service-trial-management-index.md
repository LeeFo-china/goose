# 平台技术服务试用运营实施索引

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement these plans in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按可独立验证的三个子项目交付正式服务访问基础、试用核心闭环和试用运营能力。

**Architecture:** 第一份计划先补正式服务合同期、付款后 onboarding 访问和统一路由访问判定，消除试用转正式后的锁定风险；第二份计划建立试用申请、审批、授权、宽限期、统计和 Admin 管理；第三份计划增加到期提醒、陪跑跟进和 Orange 联调。前两份通过后只允许指定租户的后台灰度；三份全部完成并通过生产门禁后才能开放租户自主申请。

**Tech Stack:** Bun、TypeScript、Fastify 5、Zod 4、Supabase/PostgreSQL migration、Next.js 15、React 19、shadcn/Radix、Tailwind、Playwright。

**Approved design:** `docs/superpowers/specs/2026-08-10-platform-service-trial-management-design.md`

---

## 执行顺序

1. [正式服务访问基础计划](./2026-08-10-platform-service-access-foundation.md)
2. [试用申请与授权核心计划](./2026-08-10-platform-service-trial-core.md)
3. [试用提醒与运营计划](./2026-08-10-platform-service-trial-operations.md)

禁止并行执行第一、第二份计划：二者都会修改技术服务订单、支付确认、验收 RPC 和授权入口。第三份计划只能在第二份计划接口稳定后执行。

## 规格覆盖

| 规格范围 | 实施计划 |
| --- | --- |
| 正式合同期、paid_onboarding、hard/service blocked、路由访问矩阵 | 计划 1 Tasks 1～7 |
| 试用规则、企业身份、状态机、宽限期、幂等、权限、API | 计划 2 Tasks 1～6 |
| Admin 第四个 Tab、详情 Sheet、规则与动作 | 计划 2 Task 7 |
| 到期提醒、审批通知、陪跑跟进 | 计划 3 Tasks 1～6 |
| 空库、开发库、dev fixture、Orange 真机与发布门禁 | 三份计划的最终 Task |

## 生产放行门禁

必须同时满足：

- 正式服务合同期和 `paid_onboarding` 已通过真实支付、验收、续费和退款 smoke；
- 所有租户路由均有 `session / recovery / read / write / public_or_callback` 分类；
- `hard_blocked`、`service_blocked`、试用、宽限期和正式服务访问矩阵通过自动化测试；
- 试用 30 天和 7 天只读宽限期使用数据库时间生效；
- 企业身份防重复、幂等、乐观锁和并发审批通过数据库 smoke；
- Admin 权限、列表分页、详情操作和骨架屏通过；
- Orange dev 真机完成申请、撤回、购买和到期状态回归；
- 开发库 migration Local/Remote 对齐，Colima 隔离空库可完整应用。

## Git 策略

每份计划从最新本地 `main` 创建独立 worktree/feature branch。每个 Task 一个聚焦提交；一份计划完成后创建 PR、完成审查并 Squash merge，再安全同步本地 `main` 后开始下一份。禁止将 Orange 修改、开发数据库手工修复或无关重构混入 PR。
