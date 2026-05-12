# 租户积分计费 Phase 3 短信扣费实施与验收记录

日期：2026-05-12

## 实施范围

Phase 3 已接入短信真实扣费链路：

- 短信成功发送后生成 `tenant_billing_events(metric_code=sms_domestic_success)`。
- `SMS_CHARGE_ENABLED=true` 时调用 `billing_settle_event` 真扣积分。
- `SMS_CHARGE_ENABLED=false` 时只生成 `estimated` 事件，不扣余额。
- 失败、mock、disabled 短信不生成扣费事件、不扣积分。
- 发送前在真扣费开关开启时校验租户可用积分。

## 数据库变更

新增 migration：

```text
supabase/migrations/20260512201000_add_sms_billing_fields.sql
```

`sms_send_logs` 新增字段：

- `delivery_status text null`
- `billed boolean not null default false`
- `billed_at timestamptz null`
- `billing_event_id uuid null references tenant_billing_events(id)`

第一期回执口径：

- 阿里云/腾讯云当前发送接口以“提交成功”作为成功回执。
- 成功日志写入 `delivery_status = submitted_success`。
- 提交失败写入 `delivery_status = submit_failed`。
- 后续如果接入最终送达回执，再扩展 `delivered / failed / submitted_success_timeout`。

## 后端对接

改动位置：

- `apps/api/src/services/sms.ts`
- `apps/api/src/services/billing.ts`
- `apps/api/src/repositories/sms-send-logs.ts`
- `apps/api/src/repositories/billing.ts`

扣费流程：

1. 真实短信供应商发送前：
   - 读取 `SMS_CHARGE_ENABLED`。
   - 若开启且有 `tenant_id`，按当前价格规则计算所需积分。
   - 租户可用积分不足时返回 `TENANT_CREDITS_INSUFFICIENT`，不发送短信。
2. 供应商返回成功后：
   - 写入 `sms_send_logs(status=success, delivery_status=submitted_success)`。
   - 生成 `tenant_billing_events(metric_code=sms_domestic_success)`。
3. 若 `SMS_CHARGE_ENABLED=true`：
   - 调用 `billing_settle_event`。
   - 写入积分流水。
   - 回写 `sms_send_logs.billed=true/billed_at/billing_event_id`。
4. 若 `SMS_CHARGE_ENABLED=false`：
   - 只保留 `estimated` 计费事件。
   - 回写 `billing_event_id`，但 `billed=false`。

## 开关

生产默认建议：

```bash
SMS_CHARGE_ENABLED=false
```

阶段验收或灰度租户确认后再开启：

```bash
SMS_CHARGE_ENABLED=true
```

## Admin / 小程序影响

Admin：

- 平台计费中心可通过计费事件看到短信 `estimated/charged/failed`。
- 租户计费账户可通过积分流水看到短信扣费。

微信小程序：

- 不需要新增请求参数。
- 租户归属仍由登录态和后端业务上下文决定。
- 余额不足时后端返回 `TENANT_CREDITS_INSUFFICIENT`，小程序应提示“积分余额不足，请联系管理员充值”。

## 验收结果

已通过：

```bash
bunx tsc --noEmit -p apps/api/tsconfig.json
bun run api:build
bun run build   # apps/admin
supabase db push
supabase db query --linked   # 事务级 SQL 验收，最后 ROLLBACK
git diff --check
```

远端事务级 SQL 验收覆盖：

- 人工充值 100000 积分。
- 成功短信生成 billing event。
- `billing_settle_event` 扣 50 积分。
- 重复结算只生成一条扣费流水。
- `sms_send_logs` 正确回写 `billed / billed_at / billing_event_id / delivery_status`。
- failure / mock / disabled 短信不生成计费事件。
- 事务最后 `ROLLBACK`，不保留测试数据。

## 下一阶段准入

Phase 3 通过后，可以进入 Phase 4 视频转文本扣费。进入前需要确认：

- 生产环境 `SMS_CHARGE_ENABLED` 初始保持关闭。
- 平台计费中心能看到短信计费事件。
- 租户余额不足错误已由 admin/小程序统一提示。
- 短信供应商最终送达回执接入计划另行排期，不阻塞第一期。
