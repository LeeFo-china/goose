# 客户好友助力摘要双入口后端交接

日期：2026-08-07

## 背景

客户项目可能同时存在一张历史待领取奖励和一张当前有效营销活动下的进行中助力实例。旧摘要只返回 `focus_campaign`，并按“待领奖、进行中、已领奖”选择，导致待领奖实例遮挡当前助力入口。

本次采用增量兼容方案：保留 `focus_campaign` 和 `display_mode` 的旧语义，同时新增 `pending_reward_campaign` 与 `active_campaign`，由 Orange 分别展示“待领取奖励”和“当前助力活动”。

## 适用接口

```http
GET /customer/projects/:projectId/share-campaigns/summary
GET /customer/projects/:projectId/detail-bootstrap?includeCampaigns=true
```

第二个接口在 `campaign_summary` 中返回与独立摘要接口相同的字段。所有成功和模块禁用回退响应都固定包含两个新字段；没有对应实例时返回 `null`，不省略字段。

## 响应结构

```json
{
  "project_id": "project-id",
  "display_mode": "claim_reward",
  "config_enabled": true,
  "config_status": "active",
  "recommended_log": {},
  "focus_campaign": {},
  "pending_reward_campaign": {},
  "active_campaign": {}
}
```

三个活动字段复用同一摘要结构：

```json
{
  "instance_id": "share-campaign-instance-id",
  "id": "share-campaign-instance-id",
  "campaign_id": "share-campaign-instance-id",
  "marketing_campaign_id": "marketing-campaign-id",
  "project_id": "project-id",
  "log_id": "log-id",
  "share_token": "st_xxx",
  "status": "active",
  "reward_claim_status": "unclaimed",
  "assist_count": 0,
  "target_assist_count": 3,
  "remaining_count": 3,
  "reward_title": "好友助力礼"
}
```

ID 语义：

- `instance_id`：新的标准好友助力实例 ID；
- `id`、`campaign_id`：兼容别名，继续指向同一个实例 ID，可用于客户实例详情接口；
- `marketing_campaign_id`：父级营销活动主表 ID，对应员工营销活动详情及实例列表路由；
- `project_id`、`log_id`：实例真实绑定的项目和施工日志 ID。

## 选择规则

### pending_reward_campaign

- 仅选择后端领奖凭证状态为 `active` 的实例；
- 已领取、已过期或无效奖励不进入该字段；
- 多条可领取奖励同时存在时，按 `achieved_at` 倒序选择最近达标的一条，缺失时回退 `created_at`；
- 不要求其父级营销活动仍处于启用状态，避免历史已获得奖励丢失入口。
- 使用独立、最多 20 条的待领奖候选查询，不受兼容字段最近 20 条活动窗口影响。

### active_campaign

- 实例必须为 `status=active`；
- 必须属于当前项目解析出的有效营销活动，且该活动具有非空主表 ID，再按 `marketing_campaign_id` 精确关联；
- 正在等待领奖的实例不会重复出现在该字段；
- 同一有效营销活动异常存在多条 active 实例时，按 `created_at` 选择最新一条。

### focus_campaign

- 保持旧版“可领奖实例、任意 active 实例、已领取实例”的选择顺序；
- `display_mode` 继续根据 `focus_campaign` 计算；
- 该字段仅用于旧版 Orange 兼容，新版双入口不得再依赖它选择当前营销活动。

## Orange 接入规则

- `pending_reward_campaign != null`：展示独立的“待领取奖励”入口；
- `active_campaign != null`：展示独立的“当前助力活动”入口；
- 两个入口允许同时展示，不互相覆盖；
- 跳转客户活动详情时，优先使用 `instance_id`，过渡期可回退 `campaign_id` 或 `id`；
- 需要关联员工营销活动页面时使用 `marketing_campaign_id`，不得把实例 ID 当作营销活动主表 ID；
- 不在客户端重新计算领奖资格、选择优先级或提升真实助力计数。

## dev 数据验收

客户测试项目当前可验证双入口共存：

- `focus_campaign` 与 `pending_reward_campaign`：实例 `f170…0012`，父营销活动 `f170…0001`，`achieved/unclaimed`，进度 `3/3`；
- `active_campaign`：实例 `ca852c10…`, 父营销活动 `9471a1d9…`，`active/unclaimed`，进度 `0/3`；
- `display_mode` 仍为 `claim_reward`，证明旧客户端行为保持不变。

Orange 真机回归应同时验证独立摘要接口和 detail-bootstrap，确认字段、ID、跳转和空值行为一致。异常回传接口、HTTP 状态、错误码、Request-ID、项目 ID、实例 ID、营销活动 ID及脱敏响应；不要回传 token 或 OpenID。

## 代码边界

本次只修改 Gooes 摘要选择和响应契约。Orange 仓库保持只读，客户端页面和类型调整由 Orange 团队完成。
