# Tenant Credit Refund Execution Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加固微信退款执行前校验和结果不确定时的查询兜底，并在明确授权后完成一次本机真实退款 smoke。

**Architecture:** 扩展现有 `WechatPayGateway`，集中处理微信 APIv3 请求格式和 UTF-8
退款原因限制；`PlatformBillingRechargeRefundExecutionService` 负责编排执行前查单、
状态机更新、申请退款和异常查退款。成功回调仍负责最终积分反向流水。

**Tech Stack:** Bun、TypeScript、Fastify、Supabase、微信支付 APIv3

---

### Task 1: 微信退款网关契约

**Files:**
- Modify: `apps/api/src/services/wechat-pay-gateway.ts`
- Test: `apps/api/src/services/wechat-pay-gateway.test.ts`

- [x] 写失败测试：长中文退款原因被安全截断为不超过 80 UTF-8 字节。
- [x] 写失败测试：按商户退款单号生成正确 GET 路径并返回退款状态。
- [x] 运行 `bun test src/services/wechat-pay-gateway.test.ts`，确认新增用例按预期失败。
- [x] 实现 UTF-8 安全截断和 `queryRefundByOutRefundNo`。
- [x] 重跑网关测试，确认全部通过。

### Task 2: 退款执行编排

**Files:**
- Modify: `apps/api/src/services/platform-billing-recharge-refund-execution.ts`
- Test: `apps/api/src/services/platform-billing-recharge-refund-execution.test.ts`
- Create: `apps/api/src/services/platform-billing-recharge-refund-wechat.ts`
- Create: `apps/api/src/services/platform-billing-recharge-refund-execution.test-fixtures.ts`

- [x] 写失败测试：执行前查单成功后才允许进入 `refunding`。
- [x] 写失败测试：支付状态、交易号或金额不一致时不修改退款状态。
- [x] 写失败测试：申请退款异常后查询到同一退款单时保持 `refunding` 并保存结果。
- [x] 写失败测试：退款状态仍不确定时不标记 `failed`。
- [x] 运行目标测试，确认新增用例按预期失败。
- [x] 最小实现查单校验和异常查退款分支。
- [x] 重跑目标测试，确认全部通过。

### Task 3: 本机回归验证

**Files:**
- Verify only; no production file changes expected.

- [x] 运行退款相关 12 个测试文件：71 pass、0 fail。
- [x] 运行 `bun run typecheck`。
- [x] 运行 `bun run build`。
- [x] 运行 `bun scripts/check-api-file-size.ts`，阈值 500、无豁免通过。
- [x] 运行 `git diff --check` 并检查只包含本任务文件；已识别并保留无关的
  `apps/admin/next-env.d.ts` 已有改动。
- [x] 用户明确授权后，通过本机 API `:3000` 和 Admin `:3010` 对
  `TRR202607180035220488A7D81F3` 执行一次 ¥1.01 真实退款。
- [x] 确认 `REFUND.SUCCESS` 回调已处理，唯一反向流水扣回 1 积分，
  账户余额为 1007。
- [x] 保留本地结果，不 push、不部署。
