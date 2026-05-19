# WeChat 权限边界重构闭环摘要

日期：2026-05-19

## 范围

本轮覆盖微信登录、身份绑定和换绑相关入口：

- `POST /auth`
- `POST /auth/send-code`
- `POST /auth/verify-role`
- `POST /customer/auth/select-tenant`
- `POST /customer/auth/unbind-wechat`
- `POST /employee/auth/unbind-wechat`
- `POST /auth/wechat-rebind-requests`
- `GET /employee/auth/wechat-rebind-requests`
- `POST /employee/auth/wechat-rebind-requests/:id/approve`
- `POST /employee/auth/wechat-rebind-requests/:id/reject`
- `POST /h5/marketing/session`

## 当前结论

WeChat controller 本轮权限边界整改已闭环。

当前 `WeChatController` 中已无以下直接访问：

- `SupabaseDB`
- `getAdminClient`
- `getClient`
- `.from(`
- `.rpc(`

Controller 当前保留职责：

- 读取 request。
- 执行 Zod 参数校验。
- 调用微信 jscode2session。
- 编排登录流程分支。
- 调用 service。
- 签发登录 token。
- 包装 `ResponseHandler.success()`。

## 已拆分的 Service / Repository

### sms-verification-codes

文件：

- `apps/api/src/services/sms-verification-codes.ts`
- `apps/api/src/repositories/sms-verification-codes.ts`

职责：

- 验证码发送频控。
- 验证码创建。
- 短信发送失败回滚。
- 有效验证码查询。
- 验证码核销。

### wechat-auth-identities

文件：

- `apps/api/src/services/wechat-auth-identities.ts`
- `apps/api/src/repositories/wechat-auth-identities.ts`

职责：

- `wechat_identities` 映射查询、创建、更新、删除。
- Supabase auth admin 创建微信 auth user。
- 历史 `find_auth_user_by_openid` RPC 兼容查询。
- auth user 反查 openid。

### wechat-customer-identities

文件：

- `apps/api/src/services/wechat-customer-identities.ts`
- `apps/api/src/repositories/wechat-customer-identities.ts`

职责：

- 客户租户候选项读取。
- membership 客户身份读取。
- 客户项目概览补充。
- 客户绑定写入。
- 自助注册客户创建。

### wechat-employee-identities

文件：

- `apps/api/src/services/wechat-employee-identities.ts`
- `apps/api/src/repositories/wechat-employee-identities.ts`

职责：

- 员工登录候选查询。
- 员工 auth user 绑定写入。
- 清理当前 auth user 的其他员工绑定。

### wechat-auth-roles

文件：

- `apps/api/src/services/wechat-auth-roles.ts`
- `apps/api/src/repositories/wechat-auth-roles.ts`

职责：

- membership 模式角色解析。
- legacy 模式角色解析。
- dual 模式角色合并。

## Phase 汇总

| Phase | 主要内容 |
| --- | --- |
| Phase 1 | 短信验证码链路下沉。 |
| Phase 2 | 微信身份映射和历史 auth user 兼容链路下沉。 |
| Phase 3 | 客户租户候选项读取链路下沉。 |
| Phase 4 | 客户绑定写链路下沉。 |
| Phase 5 | 员工绑定数据访问链路下沉。 |
| Phase 6 | 角色解析链路下沉，WeChat controller 无 Supabase 直连。 |

## 权限口径

- 微信登录优先使用 active OAuth identity，legacy `wechat_identities` 仅作为兼容路径。
- 已解绑 OAuth identity 会清理 legacy 映射，并创建新的访客 auth user。
- 客户候选项只返回 active 租户下的客户。
- membership 客户候选项必须匹配 membership 租户。
- 客户绑定目标已绑定其他 auth user 且无 membership 时，必须走换绑申请校验。
- 员工登录必须匹配唯一员工档案、员工状态可登录、租户 active。
- 员工目标已绑定其他 auth user 且存在 openid 时，必须走换绑申请校验。
- 角色解析要求员工 active 且租户 active，客户租户 active。

## 小程序与 Admin 对接

本轮不需要 admin 或微信小程序改代码。

原因：

- 未改变接口路径。
- 未主动改变请求参数。
- 未主动改变响应结构。
- 改动集中在后端 controller/service/repository 分层和权限边界。

建议前端只做回归验证：

- 微信静默登录。
- 发送验证码。
- 验证客户身份。
- 验证员工身份。
- 客户选择装修公司。
- 客户 / 员工解除微信绑定。
- 换绑申请提交、审批、驳回。
- H5 marketing session 创建。

## 验收

本轮闭环验收执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
git diff --check
rg -n "SupabaseDB|getAdminClient|getClient|\\.from\\(|\\.rpc\\(" apps/api/src/controllers/wechat/index.ts
```

验收结果：

- TypeScript 类型检查通过。
- 权限边界检查通过。
- diff 空白检查通过。
- WeChat controller Supabase 直连扫描无结果。
