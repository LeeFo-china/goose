# 好友助力领奖凭证后端联调交接

日期：2026-07-31  
后端实现分支：`fix/share-campaign-voucher-contract`

## 已完成契约

- `share-card.share_reward_code`：未达标返回 `null`；达标或已领取仅返回真实 `reward_claim_code`。
- Marketing Center 统一凭证接口同时解析 `share_assist` 与 `appointment_reward`，并稳定返回 `campaign_type`：
  - `GET /employee/marketing-center/claim-vouchers/:voucherToken`
  - `POST /employee/marketing-center/claim-vouchers/:voucherToken/claim`
- 旧 `/employee/share-campaign-claim-vouchers/...` 路由继续兼容。
- GET 与 POST 共用领奖状态策略：已领取、已过期、未达标关闭、未达标、达标可领取；达标后关闭且未过期仍可领取。
- 两类活动核销均使用带实例、voucher token 和未领取状态条件的单条更新，重复或并发提交至多一次成功。
- 好友助力分享码、好友助力领奖码、预约有礼领奖码统一读取 `WECHAT_MINIPROGRAM_ENV_VERSION`；dev 当前为 `develop`。
- `length=short` 按 Unicode 展示字符校验，最多 48 字（含标点），拒绝尾部 `...`/`…`、重复与残缺文本，不截断；不足三条使用完整 fallback 补齐。`medium` 保持原行为。

## dev fixture

租户：`3eebca47-961f-4899-b976-a3d3208d326b`  
项目：`fa32f6dd-b2d0-4efc-a810-347dfe90ec4c`  
客户测试身份：`13200001008`  
有权限员工：`18800000001`  
无权限员工：`19903765353`  
二维码环境：`develop`

| 场景 | 实例 ID | Marketing Center 入口 |
| --- | --- | --- |
| 未达标 | `f1700000-0000-4000-8000-000000000011` | 无正式 voucher；客户分享入口 `/share-campaigns/st_fixture_under_target/qrcode` |
| 已达标待领取 | `f1700000-0000-4000-8000-000000000012` | `/employee/marketing-center/claim-vouchers/rcv_fixture_share_achieved` |
| 已领取 | `f1700000-0000-4000-8000-000000000013` | `/employee/marketing-center/claim-vouchers/rcv_fixture_share_claimed` |
| 已过期 | `f1700000-0000-4000-8000-000000000014` | `/employee/marketing-center/claim-vouchers/rcv_fixture_share_expired` |
| 未达标关闭 | `f1700000-0000-4000-8000-000000000015` | `/employee/marketing-center/claim-vouchers/rcv_fixture_share_closed_under` |
| 达标后关闭 | `f1700000-0000-4000-8000-000000000016` | `/employee/marketing-center/claim-vouchers/rcv_fixture_share_closed_achieved` |
| 预约有礼待核销 | `f1700000-0000-4000-8000-000000000021` | `/employee/marketing-center/claim-vouchers/rcv_fixture_appointment_achieved` |

fixture 名称均包含“联调 Fixture”，使用稳定 ID 幂等恢复。脚本不会自动随部署执行；清理必须显式使用 `--target=dev --confirm-dev-fixtures --mode=cleanup`。

## 验收矩阵

1. 用 `18800000001` 验证两种活动的 GET/POST；用 `19903765353` 验证 GET/POST 都为 403。
2. 已达标与达标后关闭：`voucher_status=active`、`can_claim=true`。
3. 已领取：`claimed`、`false`、`already_claimed`。
4. 已过期：`expired`、`false`、`voucher_expired`。
5. 未达标关闭：`invalid`、`false`、`campaign_closed`。
6. 核销后刷新为已领取，重复提交被稳定阻断。
7. 三种二维码扫码打开 dev 小程序；好友助力和预约有礼均进入 `pages/share-campaign-claim-voucher/index`。
8. short 文案三条均不超过 48 个展示字符，语义完整且无尾部省略号。

本轮未修改 Orange 仓库，也未在文档或日志中记录登录 token。
