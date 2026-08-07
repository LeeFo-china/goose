# 好友助力微信好友转发来源设计

## 背景

Orange 的“我的海报”页已经支持微信好友直接转发。好友通过分享卡进入助力页时，
会在现有打开和助力接口中提交 `source=wechat_friend`：

- `POST /share-campaigns/open`
- `POST /share-campaigns/assist`

Gooes 当前只接受 `qrcode` 和 `poster`。虽然 Orange 会在后端明确返回来源校验错误时
临时回退到 `qrcode`，但这会让微信好友分享的渠道统计失真。

## 目标

- 打开和助力接口接受 `wechat_friend` 来源。
- 打开记录与助力记录原样保存 `wechat_friend`。
- 继续接受 `qrcode`、`poster`，未传来源时继续默认 `qrcode`。
- 保持现有计数、去重、风控、鉴权和活动状态逻辑不变。

## 非目标

- 不统计用户在页面内点击转发按钮的次数，也不将点击视为转发成功。
- 不调整助力活动状态机、人数计算、领奖流程或分享 token 规则。
- 不修改 Orange 仓库。
- 不新增渠道统计接口、管理页面、缓存或第三方依赖。

## 接口契约

扩展 `CustomerProjectLogShareSourceSchema`：

```typescript
export const CustomerProjectLogShareSourceSchema = z.enum(
  ["qrcode", "poster", "wechat_friend"],
  {
    message: "无效的分享来源",
  },
);
```

`OpenCustomerProjectLogShareCampaignSchema` 和
`AssistCustomerProjectLogShareCampaignSchema` 继续复用该枚举，并保持
`.default("qrcode")`。无效来源仍由现有 Zod 请求校验返回参数错误。

## 数据库存储与 migration

`customer_log_share_opens.source` 和 `customer_log_share_assists.source` 都是
`text NOT NULL`，但当前分别带有只允许 `qrcode`、`poster` 的 check constraint。
因此本次必须通过新 migration 同步扩展两处约束，不能只修改 API Schema。

migration 使用显式约束名替换现有自动命名约束：

- `customer_log_share_opens_source_check`
- `customer_log_share_assists_source_check`

新约束允许：

```text
qrcode | poster | wechat_friend
```

迁移只替换约束，不修改已有记录，不锁定或重写来源值。回滚时可用后续 forward
migration 在确认不存在 `wechat_friend` 记录后恢复旧约束；若已有新来源数据，必须先
完成数据保留或映射方案，禁止直接回滚导致约束创建失败。

## 数据流与分层

Controller 继续只负责读取请求、Schema 校验、调用 service 和包装响应。

现有 service 已把 `input.source` 原样传给 repository：

- 打开记录传给 `createOpen()`；
- 助力记录传给 `createAssist()`。

repository 已把输入原样写入两张事件表。因此实现不需要改动 controller、service 或
repository，只需解除 Schema 与数据库约束的双重阻塞，并用测试锁定透传行为。

## 兼容性与错误处理

- 老客户端不传 `source` 时仍记录为 `qrcode`。
- `qrcode`、`poster` 行为保持不变。
- `wechat_friend` 不触发特殊业务分支，只作为来源维度保存。
- 任意其他来源继续在请求校验阶段失败，不进入 service 或数据库。
- 重复助力仍稳定返回 `ALREADY_ASSISTED`；本人助力、终态活动和风控拦截均不调整。

## 测试与验收

按 TDD 增加聚焦测试，至少覆盖：

1. 打开请求 Schema 接受 `wechat_friend`。
2. 助力请求 Schema 接受 `wechat_friend`。
3. 两个请求未传来源时仍默认 `qrcode`。
4. 无效来源仍返回“无效的分享来源”。
5. migration 同时扩展打开表和助力表的来源约束。
6. service 和 repository 现有数据流继续原样写入 `input.source`。

实施后运行聚焦测试、相关回归测试、API TypeScript 检查、API 构建和文件大小检查。
应用数据库变更时，先确认待执行 migration，应用后通过 `supabase migration list`
验证 Local/Remote 对齐；dev 发布后再使用真实 visitor session 验证打开和助力记录均为
`wechat_friend`。

## 前后端责任

Gooes 负责扩展 Schema、数据库约束并发布 dev。发布后同步 dev commit、migration、
接口结果和脱敏记录证据。Orange 继续携带 `wechat_friend`，后端生效后自动停止兼容
回退，无需再次发布小程序。
