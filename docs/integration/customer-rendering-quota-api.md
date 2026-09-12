# 客户装修生图额度 API 交接

日期：2026-09-12
状态：`gooes` 后端合同已实现；migration 尚未满足开发发布前置条件；`orange` 未修改。

## 本阶段范围

本阶段只提供微信小程序与抖音小程序共享的客户身份、手机号归并和生图额度查询。规则为：未授权手机号可试用 1 次；完成可信手机号授权后总上限为 5 次，首次试用包含在 5 次内；同一客户同一时间只允许一个预占任务。

当前尚未开放公开效果图库的新合同、客户图片上传、`POST /jobs`、异步生图 Worker、结果审核和装修建议。客户端可以接入额度展示与手机号前置流程，但不能据此发起真实生图。

## HTTP 合同

所有接口都要求 `Authorization: Bearer <token>`，成功响应统一为：

```json
{
  "data": {
    "trial_used": false,
    "phone_verified": false,
    "consumed": 0,
    "reserved": 0,
    "remaining": 1,
    "active_job_id": null,
    "can_generate": true,
    "blocked_reason": null
  },
  "message": "success"
}
```

| 端 | 方法与路径 | 认证要求 | 请求 |
| --- | --- | --- | --- |
| 微信 | `GET /visitor/renderings/quota` | 微信 `visitor_session`；或 `auth + login_channel=wechat` | 无 body |
| 微信 | `POST /visitor/renderings/phone:bind` | 同上，且新 token 必须含服务端签名的 `verified_phone` | `{ "idempotency_key": "UUID" }` |
| 抖音 | `GET /douyin-mini/renderings/quota` | `douyin_miniapp`；或有效绑定的 `auth + login_channel=douyin` | 无 body |
| 抖音 | `POST /douyin-mini/renderings/phone:bind` | 同上，且新 token 必须含服务端签名的 `verified_phone` | `{ "idempotency_key": "UUID" }` |

请求体是 strict DTO。客户端不得提交 `phone`、`verified`、`tenant_id`、`openid`、`subject` 或摘要；出现额外字段返回 `400 VALIDATION_ERROR`。手机号只能先通过现有微信或抖音手机号授权流程写入新签发 token，再调用 `phone:bind`。

微信访客额度按服务端当前有效的装修公司选择上下文计算；没有选择时返回 `RENDERING_TENANT_CONTEXT_REQUIRED`。抖音额度按 token 中的 app、installation 和 subject claims 计算，后端会再次验证安装仍有效。

## 响应字段到 UI 状态

| 字段 | 含义 | 客户端建议 |
| --- | --- | --- |
| `trial_used` | 未验证阶段的首次机会是否已消耗 | 展示“免费体验已使用”提示，不自行累计 |
| `phone_verified` | 当前规范额度账户是否已绑定可信手机号 | 仅用于 UI；不能替代 `can_generate` |
| `consumed` | 已成功消耗次数 | 展示服务端值，不与本地历史相加 |
| `reserved` | 正在执行、已占用的次数 | 大于 0 时显示处理中 |
| `remaining` | 当前可用次数，已扣除预占 | 显示剩余次数；不作为最终准入判断 |
| `active_job_id` | 当前执行中的任务 ID；本阶段通常为空 | 后续任务页用于恢复轮询 |
| `can_generate` | 当前投影是否允许进入生成动作 | 控制主按钮状态；真正准入仍由后续原子 `POST /jobs` 决定 |
| `blocked_reason` | `phone_required`、`quota_exhausted`、`job_active` 或 `null` | 映射到授权手机号、次数用完、任务处理中三种状态 |

响应不会包含手机号、账号 ID、身份摘要、reservation 或 event 数据。

## 调用顺序

```text
建立会话并选择装修公司
  -> GET quota
  -> blocked_reason = phone_required
       -> 调用现有手机号授权流程
       -> 保存后端新签发 token
       -> 生成新的 UUID，POST phone:bind
       -> GET quota 刷新
  -> can_generate = true
       -> 等待下一阶段 POST /jobs 上线
```

抖音原始 `douyin_miniapp` token 可以查询 1 次试用额度；完成手机号授权后必须换成保留 app、installation、subject claims 及 `verified_phone` 的客户 token。普通员工 token、微信 token 或缺失 claims 的 token 不能进入抖音接口。抖音 token 也不能进入 `/visitor/*`。

## 幂等与失败处理

- 每次用户发起新的手机号绑定动作生成一个 UUID；同一次网络重试必须复用该 UUID。
- 同一 UUID 与同一请求重复提交返回同一规范额度；不要因超时立即生成新 UUID。
- 同一 UUID 被用于不同绑定语义时返回 `409 RENDERING_IDEMPOTENCY_CONFLICT`，客户端应结束旧动作并重新发起一次明确授权。
- `GET quota` 在 token 已含可信手机号时会执行自然幂等的跨渠道账户同步，因此授权后的首次查询即可看到合并额度。
- 客户端不得本地放宽 1/5 次规则，也不得仅根据按钮状态扣次数。下一阶段任务创建必须以服务端原子预占结果为准。

| HTTP / code | 场景 | 客户端动作 |
| --- | --- | --- |
| `400 VALIDATION_ERROR` | UUID 无效或 body 有额外字段 | 修正客户端请求，不重试原请求 |
| `401 TOKEN_INVALID` / `TOKEN_EXPIRED` | token 类型、签名或绑定失效 | 重新建立对应平台会话 |
| `409 RENDERING_TENANT_CONTEXT_REQUIRED` | 微信访客尚未选择装修公司 | 打开已有装修公司选择流程 |
| `409 RENDERING_PHONE_REQUIRED` | token 没有可信手机号 | 完成现有手机号授权并换取新 token |
| `409 RENDERING_IDEMPOTENCY_CONFLICT` | 幂等键语义冲突 | 结束旧动作，用户确认后用新 UUID 重试 |
| `403 TENANT_NOT_AVAILABLE` | 装修公司暂停 | 返回选择页或显示服务暂停 |
| `409 DOUYIN_INSTALLATION_DISABLED` | 抖音安装失效 | 停止调用并提示服务暂停 |
| `503 RENDERING_IDENTITY_KEY_UNAVAILABLE` | 后端身份摘要配置不可用 | 可稍后重试，不降级传裸身份 |

`blocked_reason=quota_exhausted` 和 `blocked_reason=job_active` 是正常业务状态，不应当按接口异常 toast。

## `orange` 微信端落点（客户端团队实施）

只读检查确认可复用以下现有模块：

- `src/services/picture_library.ts`：现有效果图库服务和分页类型；新增 quota service 时沿用 `api` 包装，但额度接口不能使用 `skipAuth` 或 `optionalAuth`。
- `src/services/visitor_location_context.ts`：进入额度页前复用装修公司选择上下文。
- `src/components/visitor-verify/useVisitorPhoneVerify.ts`：复用微信手机号验证流程；验证成功保存新 token 后调用 `phone:bind`。
- `src/store/auth.ts`、`src/services/auth_persistence.ts`：确认新 token 与 `verifiedPhone` 已持久化后再绑定。
- `src/packageVisitor/pages/picture-library/index.tsx` 与 `picture-library-detail/index.tsx`：可作为效果图入口与“生成同款”入口，但不要在现有列表请求中夹带额度逻辑。
- `src/services/index.ts`：导出新增的 `CustomerRenderingQuotaService`。
- `src/app.config.ts`：若新增独立生成页，需要登记到 `packageVisitor`；当前文件已有用户未提交改动，客户端团队合并时需人工处理。

建议新增 `src/services/customer_rendering.ts`，集中定义 `RenderingQuota`、两个微信请求和错误映射；页面每次进入、手机号绑定成功及任务终态后刷新 quota。不要从本地手机号或历史记录推导 `phone_verified`、`consumed` 或 `remaining`。

## 抖音客户端落点

当前只读检查未发现 `orange` 中的抖音小程序 session/customer-auth 运行时服务与页面。抖音客户端仓库或后续模块需新增：

1. session token 和客户授权后 token 的持久化，并确保授权后 claims 保留完整；
2. 两条 `/douyin-mini/renderings/*` service 包装；
3. 同样的 quota 状态机、UUID 幂等策略和三种 blocked UI；
4. 后续公开效果图库、上传和任务页接入。

## 兼容性与所有权

现有图片库、位置、微信手机号授权和抖音 customer-auth 路径均未废弃。本次只新增接口，不改变旧响应。

- `gooes`：负责额度 domain、migration、原子 RPC、身份解析、四条 HTTP 接口及认证隔离。
- 微信/抖音客户端团队：负责 service、页面、状态恢复、授权交互和埋点。
- `orange` 在本次执行中严格保持只读；其当前工作区本来存在其他未提交变更，本次没有写入、格式化、构建、暂存或提交。

## 客户端 smoke 清单

- [ ] 无 token 调四条接口均为 401。
- [ ] 微信 visitor 已选装修公司时看到 `remaining=1`；未选时进入选择流程。
- [ ] 抖音 mini token 能查额度，但不能访问微信额度接口。
- [ ] 首次成功任务后显示 `phone_required`，而不是继续生成。
- [ ] 手机号授权后使用新 token；请求 body 只有 `idempotency_key`。
- [ ] 同一绑定请求断网重试复用 UUID，返回结果一致。
- [ ] 微信与抖音绑定同一手机号后显示同一个总消耗，总上限为 5，不是 1+5。
- [ ] `job_active` 时恢复同一任务，不重复创建。
- [ ] `quota_exhausted` 时禁用生成入口并保留历史结果入口。
- [ ] 日志、埋点、错误上报不记录 token、手机号、openid、subject 或摘要。
