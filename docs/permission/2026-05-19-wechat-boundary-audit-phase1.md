# WeChat 权限边界核查 Phase 1

日期：2026-05-19

## 范围

本阶段处理微信登录入口中的短信验证码链路：

- `POST /auth/send-code`
- `POST /auth/verify-role` 中的验证码校验和核销。

## 本次调整

- 新增 `smsVerificationCodeRepository`，集中访问 `sms_verification_codes` 表。
- 新增 `smsVerificationCodeService`，封装验证码频控、生成、创建、短信发送、发送失败回滚、有效验证码查询和核销。
- `WeChatController` 不再直接查询、插入、删除或更新 `sms_verification_codes`。
- `WeChatController` 删除验证码生成、有效验证码查询、核销重试等数据访问 helper。

## 权限口径

- 发送验证码由请求体 Zod schema 校验手机号和短信场景。
- 同手机号、同场景 60 秒内限制重复发送。
- 验证角色时，非测试免验证码模式必须提供验证码。
- 有效验证码必须满足手机号、场景、验证码、`pending` 状态和未过期。
- 角色绑定成功后才核销验证码。

## 分层边界

- controller：读取 request、校验参数、调用 service、包装响应。
- service：编排验证码发送与校验业务，调用短信发送服务。
- repository：直接访问 `sms_verification_codes` 表。

## 小程序与 Admin 对接

本轮是后端分层重构，不改变接口路径、请求字段和返回结构。

- 小程序端无需改代码。
- Admin 端无需改代码。

## 剩余拆分

`WeChatController` 仍有较多 Supabase 直连，后续建议按链路继续拆分：

1. Phase 2：`wechat_identities` / legacy auth user 读写链路。
2. Phase 3：客户身份选择与客户租户选项查询链路。
3. Phase 4：员工绑定与员工租户上下文链路。

## 验收

- `apps/api/src/controllers/wechat/index.ts` 无 `sms_verification_codes` 直接访问。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
