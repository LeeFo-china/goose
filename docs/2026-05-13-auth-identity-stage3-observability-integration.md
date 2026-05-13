# 多端登录身份模型阶段 3 观测对接文档

日期：2026-05-13

## 背景

当前登录身份重构已经完成阶段 1 到阶段 3：

- 阶段 1：新增 `user_oauth_identities`、`user_business_memberships`、`user_auth_events`。
- 阶段 2：历史微信凭证、客户身份、员工身份已回填。
- 阶段 3：后端已进入旧模型主链路 + 新模型旁路观测/双写。

阶段 3 不能直接推进阶段 4。必须先观察新旧模型是否持续一致，再切换到“新表优先、旧字段兜底”。

## 后端已提供接口

### 1. 用户身份事件明细

```http
GET /platform/user-auth-events
```

权限：

- 仅平台超管可访问。
- 后端使用 `authorizationService.getRequiredAuthContext` 校验登录态。
- 非平台超管返回 403。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 20，最大 100 |
| event_type | string | 否 | 事件类型 |
| user_id | uuid | 否 | auth.users.id |
| operator_user_id | uuid | 否 | 操作人 auth.users.id |
| platform | enum | 否 | `wechat_mini`、`wechat_web`、`ios`、`android`、`web`、`apple` |
| date_from | ISO datetime | 否 | 开始时间 |
| date_to | ISO datetime | 否 | 结束时间 |

返回结构：

```json
{
  "list": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "event_type": "identity_membership_mismatch",
      "platform": "wechat_mini",
      "openid_hash": "sha256",
      "operator_user_id": null,
      "ip": null,
      "user_agent": null,
      "metadata": {},
      "created_at": "2026-05-13T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 2. 阶段 3 观测汇总

```http
GET /platform/user-auth-events/summary
```

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| date_from | ISO datetime | 否 | 开始时间 |
| date_to | ISO datetime | 否 | 结束时间 |

返回结构：

```json
{
  "total": 0,
  "by_event_type": [],
  "stage3_ready_for_phase4": true,
  "stage3_blocking_event_count": 0,
  "stage3_blocking_event_types": [
    "identity_oauth_mismatch",
    "identity_membership_mismatch",
    "identity_observe_failed",
    "identity_oauth_dual_write_failed",
    "identity_membership_dual_write_failed",
    "identity_membership_unbind_failed"
  ]
}
```

## 事件类型说明

### 阻塞阶段 4 的事件

以下事件在观察窗口内必须为 0，或者每条都有明确原因和修复记录：

| event_type | 含义 | 处理建议 |
| --- | --- | --- |
| identity_oauth_mismatch | `wechat_identities` 与 `user_oauth_identities` 不一致 | 检查 openid 对应 user 是否被历史修复逻辑重绑 |
| identity_membership_mismatch | `customers/employees.user_id` 与 `user_business_memberships` 不一致 | 检查双写是否漏掉、历史数据是否重复 |
| identity_observe_failed | 双读观测本身失败 | 查看 metadata.error，先修查询或权限问题 |
| identity_oauth_dual_write_failed | 登录凭证双写失败 | 检查唯一索引、openid 是否已被其他 active 记录占用 |
| identity_membership_dual_write_failed | 业务身份双写失败 | 检查 tenant_id、identity_id、默认身份唯一索引 |
| identity_membership_unbind_failed | 解绑时新 membership 标记失败 | 检查解绑目标是否缺少 active membership |

### 非阻塞事件

| event_type | 含义 |
| --- | --- |
| identity_membership_dual_write_skipped | 缺少 `tenant_id`，本次跳过新 membership 写入 |

`identity_membership_dual_write_skipped` 不一定阻塞阶段 4，但需要确认是否来自平台管理员等全局身份，还是业务档案数据缺失。

## Admin 对接要求

admin 需要新增一个超管排查入口，建议放在：

- 超管平台设置 / 运维工具 / 身份观测
- 或超管审计日志附近，作为“身份模型观测”页面

第一版页面不需要复杂交互，建议包括：

1. 顶部汇总
   - 总事件数
   - 阻塞阶段 4 的事件数
   - `stage3_ready_for_phase4`
   - 当前筛选时间范围

2. 筛选区
   - 事件类型 select，可搜索
   - 平台 select
   - user_id 输入框
   - 时间范围

3. 明细表
   - 创建时间
   - event_type
   - user_id
   - platform
   - metadata 摘要
   - 操作：查看 JSON

4. 验收状态提示
   - 如果 `stage3_blocking_event_count > 0`，提示“暂不能推进阶段 4”。
   - 如果连续 3 到 7 天为 0，再进入阶段 4 评审。

注意：

- 不要展示原始 openid，只展示 `openid_hash`。
- `metadata` 中如包含业务 ID，可以展示，但不要展示手机号明文。
- 页面只读，不提供人工修改身份关系。

## 微信小程序对接要求

阶段 3 小程序端不需要新增接口。

小程序端继续保持：

- landing 调 `POST /auth`。
- 只按后端返回的 `mode` 分流。
- 不根据本地缓存 roles 自行判断身份。
- visitor 绑定手机号继续调 `POST /auth/verify-role`。
- 客户解绑微信继续调 `POST /customer/auth/unbind-wechat`。
- 员工解绑微信继续调 `POST /employee/auth/unbind-wechat`。

阶段 3 的新增逻辑全部在后端：

- 小程序登录时后端会旁路比对新旧身份。
- 小程序绑定客户/员工时后端会双写 membership。
- 小程序解绑时后端会同步把 membership 标记为 `unbound`。

小程序只需要确保：

- 解绑成功后清本地 token。
- 重新回 landing。
- 不复用旧 token 继续访问业务接口。

## 阶段 3 验收标准

观察窗口建议 3 到 7 天。

每日检查：

```http
GET /platform/user-auth-events/summary?date_from=2026-05-13T00:00:00.000Z&date_to=2026-05-14T00:00:00.000Z
```

推进阶段 4 前必须满足：

- `stage3_blocking_event_count = 0`。
- `identity_oauth_mismatch = 0`。
- `identity_membership_mismatch = 0`。
- `identity_oauth_dual_write_failed = 0`。
- `identity_membership_dual_write_failed = 0`。
- `identity_membership_unbind_failed = 0`。
- `/auth` 登录响应没有变化。
- 客户和员工解绑后旧 token 仍会被后端实时拦截。
- 微信换绑审批后新旧 membership 状态正确。

## 下一阶段入口

阶段 3 稳定后才能进入阶段 4：

```text
AUTH_IDENTITY_SOURCE=dual|membership
```

阶段 4 的目标是：

- `/auth` 优先使用 `user_oauth_identities`。
- 业务身份优先使用 `user_business_memberships`。
- 旧字段仅作为兼容兜底。

阶段 4 前不要删除：

- `wechat_identities`
- `customers.user_id`
- `employees.user_id`
