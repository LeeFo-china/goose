# 品牌数字权益微信虚拟支付切换 Runbook

本文用于将年度品牌数字权益从微信普通支付迁移到微信虚拟支付。切换只允许按
`direct_legacy -> maintenance -> wechat_virtual` 前进；发生故障时只能从
`wechat_virtual` 回到 `maintenance`，禁止回退 `direct_legacy`。

本文不授权自动扣款、自动退款、生产数据库变更或自动修改购买模式。执行人必须使用
Admin 已有交互完成模式切换，收敛命令只查询、确认或关闭旧订单并报告是否允许切换。

## 1. 不变边界

- 各平台用户售价一致，客户端不得按 iOS、Android、鸿蒙或 Windows 加价。
- 年度权益是单次直购，不依赖当前不具备申请条件的自动续费能力。
- 品牌数字权益启用微信虚拟支付后，不再调用 `wx.requestPayment` 或普通支付预下单。
- 现有平台独立普通支付商户号、APIv3 配置、回调、查单、关单、退款和账单能力完整保留。
- 独立普通支付商户号继续承接租户充值、后续平台自营实物商城及其他符合普通支付规则的交易。
- 后续实物商城可以复用普通支付基础设施，但不得复用品牌权益订单表或虚拟支付履约状态机。
- 不在日志、截图、工单或 Git 中记录 token、OpenID、AppKey、session key、APIv3 key、私钥或完整微信订单标识。

## 2. 角色和证据目录

至少安排发布执行人、支付业务验收人和故障决策人。生产切换窗口内，任一人提出暂停即暂停。

每个环境使用独立证据目录：

```text
docs/verification/branding-virtual-payment/<environment>/<YYYYMMDD-HHmm>/
├── 01-migration-list-before.txt
├── 02-migration-dry-run.txt
├── 03-migration-list-after.txt
├── 04-maintenance-admin.png
├── 05-cutover-batches.ndjson
├── 06-production-mapping.png
├── 07-ios-real-payment.md
├── 08-wechat-virtual-admin.png
├── 09-monitoring.md
└── 10-ordinary-payment-regression.md
```

截图只展示脱敏后的状态、版本和时间。证据若由受控发布平台保存，可在上述同名文件中写入
不可变链接和 SHA-256，不复制敏感原文。

## 3. 上线顺序

严格按以下顺序执行：

1. 确认虚拟账户、offerId、sandbox/production AppKey 和微信后台虚拟商品已启用。
2. 部署包含共享契约 `@gooes/domain@1.14.0` 的 API、Admin 和 worker 候选版本，但保持
   `purchase_mode=direct_legacy`。
3. 保存 migration 前状态和 dry-run 结果，确认只包含本方案 migration，且没有历史文件重写。
4. 按仓库发布流程应用 migration，再保存 Local/Remote 对齐证据。
5. 在 Admin 将品牌权益购买模式切换为 `maintenance`，确认旧下单和旧支付请求稳定返回
   `409 / BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED`。
6. 分批运行旧 pending 收敛命令，直至输出 `allow_switch=true` 和 `message=允许切换`。
7. 核对 production 映射和密钥版本，完成 iOS 受控真实支付验收。
8. 在 Admin 将模式从 `maintenance` 切换为 `wechat_virtual`。
9. 完成虚拟支付和普通独立商户号双轨回归，进入观察期。

任何步骤失败都不得跳到后续步骤。

## 4. Migration 门禁

在仓库根目录执行并保存输出：

```bash
supabase migration list
supabase db push --dry-run
```

dry-run 应只新增以下十一项，按版本号顺序显示：

```text
20260731130000
20260731131000
20260731132000
20260731134000
20260731135000
20260731135500
20260801100000
20260801101000
20260801102000
20260801103000
20260801104000
```

应用前把输出保存为 `01-migration-list-before.txt` 和 `02-migration-dry-run.txt`。按正式发布流程
应用后再次执行 `supabase migration list`，把 Local/Remote 对齐结果保存为
`03-migration-list-after.txt`。发现额外 migration、历史 migration 校验值变化或 Local/Remote
不一致时立即暂停，禁止手工在远端执行 DDL/DML 修库。

`20260731135500_guard_legacy_branding_payment_cutover.sql` 的前向恢复策略是新增修复 migration；
不得删除已应用 migration，也不得恢复允许旧渠道写入的函数体。

## 5. 进入 maintenance

在 Admin「品牌权益商品」页面读取当前商品和映射版本，确认当前模式为“普通支付（历史）”，
然后选择“维护中”并保存。保存成功后刷新页面，截图应同时包含模式、商品版本和更新时间。

接口核验可使用：

```http
GET /platform/branding/entitlement-product
PATCH /platform/branding/entitlement-product
Content-Type: application/json

{
  "purchase_mode": "maintenance",
  "version": <GET 返回的当前商品版本>
}
```

不要复用旧版本号，不要直接更新数据库。进入 maintenance 后：

- 新普通支付品牌权益订单被 service 和数据库 RPC 双层阻断。
- 已有普通支付 pending 订单不再向用户重新签发支付请求。
- 普通独立商户号的其他业务保持运行。
- 小程序只能展示维护状态，不得回退旧普通支付。

## 6. 收敛旧 pending 订单

命令必须显式加载仓库根目录环境文件；命令内部单批最多领取 100 笔，使用数据库租约和
`FOR UPDATE SKIP LOCKED` 防止并发重复处理：

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env \
  src/scripts/branding-virtual-payment-cutover.ts --limit 100
```

也可在已安全注入环境变量的运行容器中执行：

```bash
bun run branding:virtual-payment:cutover -- --limit 100
```

每批把单行脱敏 JSON 追加到 `05-cutover-batches.ndjson`。字段含义：

| 字段 | 含义 | 切换要求 |
|---|---|---|
| `claimed` | 本批领取旧 pending 数 | `0..100` |
| `paid` | 微信查单为 SUCCESS 并完成既有权益履约数 | 可大于 0 |
| `closed` | 微信已关闭或确认关单后本地关闭数 | 可大于 0 |
| `unresolved` | 网络、未知状态、租约丢失或处理不确定数 | 必须为 0 |
| `release_failed` | 未决订单租约释放失败数 | 必须为 0 |
| `allow_switch` | 数据库最终闸门结果 | 必须为 true |
| `message` | 人工切换提示 | 必须为“允许切换” |

处理规则固定：

- `SUCCESS`：校验订单号、商户号、AppID 和金额后，调用既有
  `BrandingAddonPaymentConfirmation`，确保权益只履约一次。
- `CLOSED`：幂等关闭本地订单并记录 `PAYMENT_CHANNEL_MIGRATED`。
- `NOTPAY`：调用该订单快照所绑定的普通支付配置关单，再次查单确认；确认关闭后才写本地关闭。
- `ORDER_NOT_EXIST`：只有从未取得 `prepay_id` 的订单可以按既有可靠性规则关闭；已有
  `prepay_id` 的订单保持未决。
- 网络失败、支付上下文不匹配、未知交易状态或关单结果不确定：释放租约，保留 pending，
  不吞错、不猜测、不切换。

当一批 `allow_switch=false` 时，先查看 `unresolved` 和脱敏错误码；已消除临时故障后重复执行。
命令退出码非零表示本次不允许切换，不代表可以跳过闸门。

## 7. Production 映射和 iOS 验收

最终数据库就绪函数只有同时满足以下条件才返回 true：

- 当前模式为 `maintenance`，商品已启用。
- 所有旧普通支付品牌权益 pending 订单为 0。
- production 映射为 `active + valid`。
- production 映射金额与平台商品金额一致，且不低于 100 分。
- 密钥引用为 `WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE`。
- 密钥配置为平台级、启用、加密且非空。
- 映射最近验证时间不早于密钥配置更新时间，防止密钥变化后沿用旧校验结果。

Admin 截图只显示 AppKey“已配置”和 revision，不显示明文。若映射参数、金额或密钥发生变化，
必须重新验证并重新运行收敛命令。

在切换生产模式前，使用专用测试账号完成一次生产 iOS 不低于 1 元的受控真实支付。记录：

- 验收时间、App 版本和 iOS 版本。
- requestId、Gooes 订单 ID、微信订单标识哈希。
- `payment_status`、`fulfillment_status`、`refund_status` 最终状态。
- Apple 外部退款入口和状态同步结论。

不得在自动 smoke 中发起真实支付或退款。验收失败时保持 maintenance。

## 8. 切换 wechat_virtual

只有最新一批输出同时满足 `unresolved=0`、`release_failed=0`、`allow_switch=true` 和
`message=允许切换`，且 iOS 验收通过时，才可在 Admin 将模式切换为“微信虚拟支付”。

接口核验的请求体为：

```json
{
  "purchase_mode": "wechat_virtual",
  "version": 12
}
```

示例中的 `12` 必须替换为重新 GET 后取得的当前整数版本。

切换后刷新 Admin 并保存 `08-wechat-virtual-admin.png`。随后确认：

- 新订单只进入 `tenant_virtual_addon_orders`。
- 小程序只调用 `wx.requestVirtualPayment`。
- success 回调只进入“支付结果确认中”，最终状态以后端查询和通知为准。
- 旧普通支付创建接口继续稳定返回 `BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED`。
- iOS、Android、鸿蒙和 Windows 的用户售价一致。

## 9. 观察和告警

切换后至少覆盖以下监控，并在 `09-monitoring.md` 记录时间窗、查询条件、计数和结论：

- 支付成功但 `fulfillment_status` 长时间不是 `granted`。
- 通知验签失败、上下文不匹配或重复通知异常增长。
- 主动查单补偿持续失败或租约释放失败。
- 退款成功但权益补偿未完成。
- 切换后仍新增旧渠道成功交易或旧 pending 订单。
- production mapping 变为 disabled/pending/invalid。
- API、worker 错误率、延迟和重启次数异常。

同时回归普通独立商户号的下单、通知、查单、关单、退款和账单，确认
`platform_direct_recharge`、`direct_merchant` 和 `/pay/wechat/callback` 未被虚拟支付路径改写。

## 10. 暂停与恢复

出现任一情况立即暂停：

- migration 不一致或出现计划外 migration。
- 旧订单 `unresolved > 0` 或 `release_failed > 0`。
- 微信查单、关单、通知或虚拟支付网关出现未知状态。
- production 映射、金额、AppKey revision 或验证状态不一致。
- iOS 真实支付未通过。
- 支付成功未履约、重复履约、退款未补偿或旧渠道新增成功交易。
- 普通独立商户号其他业务回归失败。

恢复条件：根因已定位并修复；所有未知状态已通过微信可信查单消除；migration 对齐；收敛命令重新
输出“允许切换”；虚拟支付和普通支付回归重新通过；证据已补齐。

若已经处于 `wechat_virtual` 且虚拟支付故障，只允许切回 `maintenance` 暂停新购买，继续处理
通知、查单、履约和退款。禁止切回 `direct_legacy`，禁止临时让数字权益重新走普通支付。

## 11. 完成标准

- [ ] migration 前后及 dry-run 证据齐全，Local/Remote 对齐。
- [ ] maintenance 截图、模式版本和切换时间已记录。
- [ ] 最终批次为 `允许切换`，旧 pending 和未知状态均为 0。
- [ ] production mapping active、valid、金额一致、密钥 revision 一致。
- [ ] iOS 受控真实支付和 Apple 外部退款状态已验收。
- [ ] Admin 已切换 `wechat_virtual`，小程序不再调用普通支付。
- [ ] 通知、主动查单、一次性履约和退款补偿均通过。
- [ ] 普通独立商户号完整回归，未来实物商城能力未删除或改道。
- [ ] 观察期无旧渠道新增交易，无支付成功未履约告警。
- [ ] 故障恢复只使用 maintenance，团队确认禁止回退 direct_legacy。
