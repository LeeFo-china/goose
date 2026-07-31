# 好友助力领奖凭证与海报短文案契约收口设计

日期：2026-07-31  
后端仓库：`/Users/leefo/Public/work/gooes`  
小程序只读参考：`/Users/leefo/Public/work/orange`

## 1. 背景与目标

Orange 已完成好友助力领奖状态、领取二维码、员工扫码核销页和海报两行文案适配，
并在
`orange/docs/miniprogram/2026-07-31-share-campaign-reward-voucher-and-poster-copy-handoff.md`
中列出后端契约差异。

本轮目标是让 Gooes 后端成为领奖资格、凭证状态、活动类型解析、权限、原子核销、
二维码环境和短文案长度的唯一事实来源，并在 dev 提供可重复使用的联调 fixture。

不修改 Orange，不新增数据库表或字段，不把 dev fixture 写入生产 migration。

## 2. 已确认的现状

1. `share-card.share_reward_code` 会在正式领奖码不存在时合成展示码，容易被误认为领奖码。
2. 好友助力关闭后的 `voucher_status` 与 `isCampaignRewardClaimable` 判断不一致。
3. Marketing Center 凭证别名路由只查询好友助力实例，不能解析预约有礼 token。
4. 三个小程序码生成入口固定传递 `env_version=release`。
5. dev 全局设置 `WECHAT_MINIPROGRAM_ENV_VERSION` 已是 `develop`，但上述入口未读取。
6. `length=short` 目前只存在提示词语义，没有服务端长度与完整性校验。
7. dev 已有一个未达标好友助力实例，尚无预约有礼实例。

## 3. 方案选择

采用应用层统一凭证解析与状态策略，不在 Controller 复制分支，也不新增数据库 RPC。

原因：

- 两种活动已有独立仓储和核销逻辑，应用层适配可以复用现有边界。
- GET 详情和 POST 核销可以共享同一个资格判断，消除状态漂移。
- 原子性通过仓储条件更新保证，不需要新增表、函数或 migration。
- 相比数据库 RPC，状态规则仍保留在 TypeScript 领域层，更容易测试和维护。

## 4. 统一凭证解析

新增一个内部凭证解析入口，输入规范化后的 `voucherToken`，按以下顺序查询：

1. `customer_log_share_campaigns`
2. `customer_appointment_reward_campaigns`

解析结果归一为判别联合：

```ts
type ResolvedClaimVoucher =
  | { campaignType: "share_assist"; instance: ShareAssistInstance }
  | { campaignType: "appointment_reward"; instance: AppointmentRewardInstance };
```

统一元数据至少包含：

- `campaign_type`
- `campaign_id` / `instance_id`
- `project_id`
- `customer_id`
- `status`
- `reward_claim_status`
- `reward_claim_voucher_token`
- `reward_claimed_at`

若两个数据源都没有命中，返回现有“领取凭证不存在”业务错误。token 保持不可枚举，
错误中不泄露活动类型或内部记录信息。

Controller 先通过统一元数据做 `project.update` 权限校验，再调用统一详情或核销服务。
旧 `/employee/share-campaign-claim-vouchers/...` 路由继续兼容；新旧路由共享实现。

## 5. 统一状态策略

定义纯函数计算：

```ts
type ClaimVoucherDecision = {
  voucherStatus: "active" | "claimed" | "expired" | "invalid";
  canClaim: boolean;
  blockReason:
    | "already_claimed"
    | "voucher_expired"
    | "campaign_not_achieved"
    | "campaign_closed"
    | "voucher_invalid"
    | null;
};
```

优先级必须固定为：已领取、已过期、未达标关闭、未达标、有效可领取、无效凭证。

| 状态 | voucherStatus | canClaim | blockReason |
| --- | --- | --- | --- |
| 已领取 | `claimed` | `false` | `already_claimed` |
| 已过期 | `expired` | `false` | `voucher_expired` |
| 未达标关闭 | `invalid` | `false` | `campaign_closed` |
| 未达标未关闭 | `invalid` | `false` | `campaign_not_achieved` |
| 已达标未领取，包括达标后关闭 | `active` | `true` | `null` |
| token 或凭证元数据无效 | `invalid` | `false` | `voucher_invalid` |

好友助力达标依据保持现有兼容口径：`status=achieved`、存在 `achieved_at` 或
`assist_count >= target_assist_count` 任一成立。预约有礼达标依据为 `status=achieved`
或存在 `achieved_at`。

GET 详情与 POST 核销都调用该决策函数。POST 只允许 `canClaim=true`，拒绝时使用稳定
业务错误，不允许出现详情可领取但提交失败，或详情显示无效但提交成功。

## 6. 原子核销

好友助力和预约有礼仓储分别增加条件核销方法。更新条件至少包含：

- 实例 ID 与 voucher token 匹配；
- 当前 `reward_claim_status` 不是 `claimed`；
- 当前 `status` 不是 `reward_claimed`；
- 调用服务已经通过统一状态策略。

更新成功后返回最新记录。条件未命中时重新读取一次并返回“已领取”或最新阻断原因，
从而在并发双击或多人同时扫码时最多只有一个请求成功。

本轮不新增数据库函数；Supabase 条件更新已经能够提供单语句竞争保护。

## 7. `share_reward_code` 契约

`GET /customer/projects/:projectId/logs/:logId/share-card` 调整为：

- 未达标：`share_reward_code=null`
- 已达标且未领取：返回正式 `reward_claim_code`
- 已领取：可返回原正式 `reward_claim_code`，仅用于历史核对

不再通过 `buildShareRewardCode` 提前合成伪领奖码。正式领奖资格仍只由活动状态、
`reward_claim_code` 和 `reward_claim_voucher` 表达。

## 8. 小程序码环境

好友助力分享码、好友助力领取凭证码、预约有礼领取凭证码统一读取：

```text
WECHAT_MINIPROGRAM_ENV_VERSION
```

使用现有 `wechatOpenLinkService.normalizeEnvVersion` 校验为
`release | trial | develop`。dev 当前设置为 `develop`；生产没有显式覆盖时默认
`release`。

三个入口使用同一个请求构造函数，测试必须断言不再出现硬编码 `release`。

## 9. `length=short` 文案契约

定义 `SHORT_SHARE_COPY_MAX_DISPLAY_CHARS = 48`。展示字符按 Unicode code point
计数，即 `Array.from(text).length`，包含中文标点，不按 UTF-16 code unit 计数。

短文案要求：

- trim 后非空；
- 不超过 48 个展示字符；
- 不以 `...` 或 `…` 结尾；
- 三条候选文本互不重复；
- 返回文本必须保持原文，禁止切片或截断后返回。

提示词在 `length=short` 时写入明确的 48 字上限。AI 结果经过服务端校验，合法项
保留；不足三条时由固定、语义完整、经过同一校验的 short fallback 补齐。
`length=medium` 保持现有行为。

## 10. Dev fixture

增加显式执行、幂等的 dev fixture 工具，fixture 名称统一包含“联调 Fixture”。工具：

- 不加入自动部署；
- 必须显式传入 dev 目标和确认参数；
- 校验目标租户为已知 dev 租户；
- 重复执行时按稳定 fixture key 复用或恢复状态；
- 输出测试身份、项目 ID、活动/实例 ID、凭证入口和 env version；
- 永不输出登录 token、JWT secret 或数据库密钥；
- 提供单独清理模式，联调期间默认保留。

fixture 覆盖：

1. 未达标好友助力
2. 已达标待领取好友助力
3. 已领取好友助力
4. 已过期好友助力
5. 未达标关闭好友助力
6. 达标后关闭好友助力
7. 无项目权限员工
8. 预约有礼待核销
9. 超长 AI 原始结果的自动化测试样本

fixture 是 dev 业务测试数据，不写入 migration，不自动进入生产。涉及状态构造的写入
集中在 fixture 工具中，并受 dev 目标、租户和显式确认三重保护。

## 11. 测试与发布验收

所有行为修改遵循 TDD，至少覆盖：

- 状态决策矩阵及判断优先级；
- 达标后关闭仍可核销；
- 未达标关闭、过期、已领取、无效 token 均拒绝；
- 好友助力和预约有礼 token 都能被统一 GET/POST 路由解析；
- 无权限员工 GET/POST 均为 403；
- 并发或重复核销只有一次成功；
- 未达标 `share_reward_code=null`；
- 三种二维码均读取 `develop` 设置；
- short 文案三条均不超过 48 字、不带尾部省略号且不被截断；
- medium 文案兼容性不变。

静态门禁通过后发布 API 到 dev。发布后使用 fixture 做完整接口 smoke，记录：

- 发布 commit；
- 客户与员工测试身份；
- 活动、实例、项目 ID；
- 二维码客户入口；
- 实际 `env_version`；
- 每个状态场景的 GET/POST 结果。

## 12. 所有权与回滚

- Gooes：实现统一状态、双活动解析、权限、原子核销、二维码环境、短文案校验和 dev fixture。
- Orange：保持现有展示与扫码交互，使用后端 `can_claim` 和 `claim_block_reason`。
- 本轮不修改 Orange。

代码回滚可直接回退本次提交。fixture 与代码解耦；如需清理，运行工具的显式清理模式，
不通过手工 SQL 删除。
