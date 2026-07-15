# 小程序统一手机号身份登录联调交付

日期：2026-07-15

后端联调版本：

- 分支：`feature/unified-phone-identity-login`
- 提交：`f03745b85d8e4b0125b85922eeb9bafb91c2746d`
- 目标 API：开发联调环境使用 `api-dev.goodcms.cn`，生产仍走 `api.goodcms.cn`
- 已应用 migration：`20260715100000`、`20260715101000`、`20260715121000`

## 1. 结论

小程序登录页建议切到统一手机号身份登录，不再让用户先选“客户 / 员工 / 城市合伙人”再调用不同接口。

统一规则：

- 一个可用具体身份：直接登录。
- 多个可用具体身份：返回候选身份列表，由用户选择后登录。
- 零个可用具体身份：返回已验证手机号的 `platform_visitor`，进入访客态装修需求流程。
- 零身份阶段禁止自动创建 `customers`。
- 用户提交装修需求后，才创建 `platform_leads`。
- 统一登录接口都要求已有小程序微信会话 token。前端必须先完成 `/auth` 静默登录或恢复会话，再调用新接口。

## 2. 后端接口契约

所有接口成功响应均为：

```json
{
  "data": {},
  "message": "success"
}
```

失败响应继续使用现有错误包装，前端读取 `code` 和 `message`。

### 2.1 发送验证码

```http
POST /auth/phone-login/send-code
Authorization: Bearer <mini-program auth token>
Content-Type: application/json
```

请求：

```json
{
  "phone": "13800138000"
}
```

响应：

```json
{
  "data": {
    "success": true,
    "cooldown_seconds": 60
  },
  "message": "验证码已发送"
}
```

注意：

- 短信场景固定为 `login_identity`。
- 该接口只发短信，不查询身份。
- 不要沿用旧 `AuthService.sendVerifyCode` 的 `skipAuth: true`。新接口必须携带 Authorization。

### 2.2 校验验证码并解析身份

```http
POST /auth/phone-login/verify
Authorization: Bearer <mini-program auth token>
Content-Type: application/json
```

请求：

```json
{
  "phone": "13800138000",
  "code": "123456",
  "share_token": "ts_xxx"
}
```

`share_token` 可选。orange 当前已在 `src/app.ts` 捕获并写入 `pendingShareToken`，新流程继续复用该值。

零身份响应：

```json
{
  "data": {
    "status": "visitor_verified",
    "next_action": "submit_platform_lead",
    "auth": {
      "token": "<visitor_session_token>",
      "user_id": null,
      "visitor_id": "<visitor_id>",
      "roles": ["visitor"],
      "mode": "platform_visitor",
      "authMode": "platform_visitor",
      "phone": "13800138000",
      "verified_phone": "13800138000",
      "has_customer_profile": false,
      "tenant": null,
      "customer": null,
      "employee": null,
      "partner": null
    }
  },
  "message": "手机号验证成功，可提交装修需求"
}
```

单身份响应：

```json
{
  "data": {
    "status": "authenticated",
    "auth": {
      "token": "<auth_token>",
      "mode": "customer",
      "authMode": "customer",
      "roles": ["customer"]
    }
  },
  "message": "登录成功"
}
```

`auth.mode/authMode` 也可能是：

- `customer` 或 `customer_portal`
- `tenant_employee`
- `platform_partner`

多身份响应：

```json
{
  "data": {
    "status": "selection_required",
    "selection_token": "opaque-random-token",
    "expires_in": 300,
    "phone_masked": "138****8000",
    "candidates": [
      {
        "candidate_id": "00000000-0000-0000-0000-000000000001",
        "target_mode": "customer",
        "role_label": "客户",
        "title": "某某装饰",
        "subtitle": "张三",
        "binding_state": "bindable"
      },
      {
        "candidate_id": "00000000-0000-0000-0000-000000000002",
        "target_mode": "tenant_employee",
        "role_label": "员工",
        "title": "某某装饰",
        "subtitle": "李四 / 设计部 / 设计师",
        "binding_state": "current"
      },
      {
        "candidate_id": "00000000-0000-0000-0000-000000000003",
        "target_mode": "platform_partner",
        "role_label": "城市合伙人",
        "title": "杭州合伙人",
        "subtitle": "王五",
        "binding_state": "rebind_required",
        "rebind_kind": "platform_partner"
      }
    ]
  },
  "message": "请选择登录身份"
}
```

候选字段说明：

| 字段 | 说明 |
| --- | --- |
| `candidate_id` | 本次选择用的候选 ID，只对当前 `selection_token` 有效 |
| `target_mode` | `customer`、`tenant_employee`、`platform_partner` |
| `role_label` | UI 展示角色名 |
| `title` | 租户名或合伙人名称 |
| `subtitle` | 人员、部门、岗位等辅助信息 |
| `binding_state` | `current`、`bindable`、`rebind_required` |
| `rebind_kind` | 仅换绑边界返回，`tenant_wechat` 或 `platform_partner` |

### 2.3 选择身份

```http
POST /auth/phone-login/select
Authorization: Bearer <same mini-program auth token>
Content-Type: application/json
```

请求：

```json
{
  "selection_token": "opaque-random-token",
  "candidate_id": "00000000-0000-0000-0000-000000000001"
}
```

响应：

```json
{
  "data": {
    "status": "authenticated",
    "auth": {
      "token": "<auth_token>",
      "mode": "customer",
      "authMode": "customer",
      "roles": ["customer"]
    }
  },
  "message": "登录成功"
}
```

## 3. selection_token 规则

- 有效期：300 秒。
- 只在 `selection_required` 响应中返回一次。
- 后端数据库只保存 token 的 SHA-256 hash，不保存原文。
- token 绑定当前微信会话的 `auth_user_id` 和 `openid_hash`。
- 同一个 token + 同一个 candidate 重复提交，后端按幂等成功处理。
- 已消费 token 选择不同 candidate，返回 `IDENTITY_SELECTION_CONSUMED`。
- token 过期后返回 `IDENTITY_SELECTION_EXPIRED`，前端应回到手机号验证码步骤。
- 选择过程中绑定失败，后端会释放 selection 状态，前端可提示后重新提交或重新验证。

前端处理建议：

- 身份选择页提交按钮必须防重复点击。
- 本地只短暂保存在页面状态或 session storage，不持久化到长期缓存。
- 切换微信会话、重新静默登录、退出登录后丢弃旧 `selection_token`。

## 4. 错误码与前端处理

| code | 场景 | 前端建议 |
| --- | --- | --- |
| `AUTH_SESSION_REQUIRED` | 没有有效小程序微信会话 | 重新 `silentLogin` 后再试 |
| `SMS_CODE_REQUIRED` | 验证码缺失 | 提示输入验证码 |
| `SMS_CODE_INVALID` | 验证码错误 | 提示重新输入 |
| `SMS_CODE_EXPIRED` | 验证码过期 | 允许重新发送 |
| `SMS_CODE_RATE_LIMITED` | 发码过于频繁 | 展示倒计时 |
| `IDENTITY_ACCOUNT_UNAVAILABLE` | 手机号命中过身份但均不可用 | 提示联系管理员 |
| `IDENTITY_CANDIDATE_LIMIT_EXCEEDED` | 候选过多 | 提示联系平台处理 |
| `IDENTITY_SELECTION_EXPIRED` | 选择 token 过期 | 返回手机号验证 |
| `IDENTITY_SELECTION_CONSUMED` | 选择 token 已使用 | 重新验证手机号 |
| `IDENTITY_SELECTION_IN_PROGRESS` | 选择处理中或状态冲突 | 禁用重复提交，稍后重试 |
| `IDENTITY_OPTION_UNAVAILABLE` | 所选候选已失效 | 重新验证手机号 |
| `WECHAT_ALREADY_BOUND` | 客户/员工已绑定其他微信 | 走既有客户/员工换绑入口 |
| `PARTNER_MEMBER_ALREADY_BOUND` | 合伙人成员已绑定其他微信 | 走合伙人换绑申请页 |

## 5. orange 侧建议改动点

本次只读检查了 orange，未修改任何 orange 文件。

已确认的现有入口：

- `src/services/auth.ts`：已有 `silentLogin`、`ensureSessionReady`、`persistAuthResponse`、`dispatchByAuthMode`。
- `src/services/auth_types.ts`：已有 `AuthResponse`、`verified_phone`、`share_token`、多种 `authMode`。
- `src/services/auth_verification_methods.ts`：当前旧流程使用 `/auth/send-code` 和 `/auth/verify-role`。
- `src/store/auth.ts`：已有 `pendingShareToken`、`setPendingShareToken`、`clearPendingShareToken`。
- `src/app.ts`：已有 `share_token` / `scene` 捕获逻辑。
- `src/packageVisitor/pages/visitor-home/hooks/useVisitorVerify.ts`：当前客户、员工、合伙人分角色验证入口。
- `src/packageVisitor/pages/identity-switch/index.tsx`：已有身份列表 UI 模式，可复用候选卡片样式。
- `src/app.config.ts`：`packageVisitor` 已存在，适合新增统一身份选择页。

建议新增或修改：

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/services/auth_types.ts` | 修改 | 增加 `PhoneIdentityLogin*` 请求/响应类型和候选类型 |
| `src/services/auth_phone_identity.ts` | 新增 | 封装 `sendCode`、`verify`、`select` 三个接口 |
| `src/services/auth.ts` | 修改 | 将统一手机号方法挂到 `AuthService` 或由页面直接 import 新 service |
| `src/packageVisitor/pages/visitor-home/hooks/useVisitorVerify.ts` | 修改 | 将旧 `verifyRole` 流程替换为统一 `verify` 状态机 |
| `src/packageVisitor/pages/visitor-home/VerifyPopup.tsx` | 修改 | 去掉强制角色选择，改成统一手机号登录文案 |
| `src/packageVisitor/pages/phone-identity-select/index.tsx` | 新增 | 多身份候选选择页 |
| `src/packageVisitor/pages/phone-identity-select/index.scss` | 新增 | 候选卡片样式，可参考 `identity-switch` |
| `src/packageVisitor/pages/phone-identity-select/index.config.ts` | 新增 | 页面标题建议“选择登录身份” |
| `src/app.config.ts` | 修改 | 将 `phone-identity-select` 加入 `packageVisitor.pages` |
| `src/packagePartner/pages/rebind-request/index.tsx` | 复用 | `PARTNER_MEMBER_ALREADY_BOUND` 时跳转此页 |
| `packageCustomerPortal/pages/wechat-rebind-request/index.tsx` | 复用 | 客户/员工换绑边界继续走既有入口 |

## 6. 小程序状态机

推荐封装：

```ts
async function ensureMiniProgramSession() {
  await AuthService.ensureSessionReady('phone-identity-login');
}
```

发码：

```ts
await ensureMiniProgramSession();
await AuthPhoneIdentityService.sendCode({ phone });
```

验证：

```ts
await ensureMiniProgramSession();
const result = await AuthPhoneIdentityService.verify({
  phone,
  code,
  share_token: useAuthStore.getState().pendingShareToken || undefined,
});

if (result.status === 'authenticated') {
  AuthService.persistAuthResponse(result.auth);
  dispatchByAuthMode(result.auth);
  return;
}

if (result.status === 'visitor_verified') {
  AuthService.persistAuthResponse(result.auth);
  useAuthStore.getState().clearPendingShareToken();
  Taro.reLaunch({ url: '/pages/visitor/index' });
  return;
}

Taro.navigateTo({
  url: `/packageVisitor/pages/phone-identity-select/index?selection_token=${encodeURIComponent(result.selection_token)}`
    + `&phone_masked=${encodeURIComponent(result.phone_masked || '')}`
    + `&candidates=${encodeURIComponent(JSON.stringify(result.candidates))}`,
});
```

选择：

```ts
const result = await AuthPhoneIdentityService.select({
  selection_token,
  candidate_id,
});

AuthService.persistAuthResponse(result.auth);
dispatchByAuthMode(result.auth);
```

候选页不建议把候选列表长期写 storage。若担心 URL 过长，可在进入候选页前写入短期页面 store，并在页面卸载时清除。

## 7. share_token 归因

前端继续沿用现有捕获逻辑：

- 小程序启动参数 `share_token=ts_xxx`
- 小程序码 `scene=ts_xxx`
- 小程序码 `scene=share_token=ts_xxx`

统一登录只在 `verify` 时传 `share_token`。后端行为：

- 多租户客户候选中，匹配分享租户的客户排在前面。
- 零身份访客 token 会携带可信 `share_link_id`。
- 后续提交装修需求时，后端应优先使用 visitor token 中的归因，不信任前端传租户 ID。

前端不要自己用 `tenant_id` 决定客户归属。

## 8. 测试手机号矩阵

dev 环境固定使用 `19900004xxx` 段假号。每轮共享 dev 联调前，后端先重新执行
`scripts/dev/seed-dev.sql`，把可绑定身份恢复到未绑定状态。

| 编号 | 手机号 | share_token | 场景 | 预期 |
| --- | --- | --- | --- | --- |
| P1 | `19900004001` | - | 零身份 | `visitor_verified`，进入访客态，可提交装修需求 |
| P2 | `19900004002` | - | 单客户 | `authenticated`，`authMode=customer` |
| P3 | `19900004003` | - | 单员工 | `authenticated`，`authMode=tenant_employee` |
| P4 | `19900004004` | - | 单城市合伙人成员 | `authenticated`，`authMode=platform_partner` |
| P5 | `19900004005` | - | 客户 + 员工多身份 | `selection_required`，展示两个候选 |
| P6 | `19900004006` | - | 跨租户多客户 | `selection_required`，展示两个客户候选 |
| P7 | `19900004006` | `ts_dev_phone_identity_b` | 跨租户多客户 + 分享租户 | `selection_required`，测试公司 B 客户候选排第一 |
| P8 | `19900004008` | - | 客户已绑定其他有效微信 | `WECHAT_ALREADY_BOUND`，返回可换绑上下文 |
| P9 | `19900004009` | - | 合伙人成员已绑定其他有效微信 | `PARTNER_MEMBER_ALREADY_BOUND` |

`selection_token` 过期和幂等测试复用 P5 或 P6：

- 选择页停留超过 300 秒再提交：`IDENTITY_SELECTION_EXPIRED`。
- 同一 `selection_token` 重复选择同一候选：幂等返回同一身份登录成功。
- 同一 `selection_token` 已消费后选择其他候选：`IDENTITY_SELECTION_CONSUMED`。

### 8.1 dev 验证码获取

统一手机号登录不使用固定万能码。`send-code` 会生成随机 6 位码并写入
`sms_verification_codes`，场景固定为 `login_identity`。

后端联调值班可在 Orange 调用 `send-code` 后查最近一条未过期验证码：

```bash
GOOES_ALLOW_DEV_CODE_LOOKUP=true \
PHONE_IDENTITY_LOGIN_PHONE=19900004002 \
bun run api:phone-identity-latest-code
```

如果在 git worktree 中执行，且 `.env` 不在当前 worktree 根目录，额外指定：
`GOOES_ENV_FILE=/Users/leefo/Public/work/gooes/.env`。

也可以传 CLI 参数：

```bash
GOOES_ALLOW_DEV_CODE_LOOKUP=true \
bun run api:phone-identity-latest-code -- --phone=19900004002
```

该脚本只用于 dev 联调，不对小程序开放，不部署为公开接口。

## 9. dev 发布门禁

本分支已完成本地验证：

```bash
bun run api:typecheck
bun run api:check-file-size
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_PUBLISH=test-publish-key \
SUPABASE_SERVICE_ROLE_KEY=test-service-role-key \
bun test src/controllers/phone-identity-login/routes.test.ts \
  src/repositories/phone-identity-login.test.ts \
  src/repositories/phone-identity-candidates.test.ts \
  src/schema/phone-identity-login.test.ts \
  src/services/phone-identity-login/*.test.ts \
  src/services/wechat-auth-legacy/common.test.ts \
  src/services/platform-partner-portal-selected-member.test.ts \
  src/services/phone-identity-login-migration.test.ts
```

结果：67 个测试通过，typecheck 通过，文件体积检查通过。

远端 migration 已对齐。数据库 lint 中本次手机号登录相关错误已消除，剩余 `public.replace_workflow_draft_graph` 临时表解析错误是既有无关问题。

dev 环境发布建议：

1. 推送 `feature/unified-phone-identity-login`。
2. GitHub Actions 手动触发 `Release Dev`。
3. 输入：
   - `service`: `api`
   - `operation`: `release`
   - `reason`: `unified phone identity login miniprogram integration`
4. 如 dev DB 尚未包含本次 migration，先触发 `Migrate Dev Database`：
   - `mode`: `plan`
   - `confirm_dev_project_ref`: `fclnkyatvfvmzgzdqlba`
   - 确认只包含本次 migration 后再用 `mode=apply`
5. API 发布成功后，小程序开发版将 `TARO_APP_BASEURL` 指向 `https://api-dev.goodcms.cn`。

## 10. 联调 smoke 清单

- [ ] 启动小程序后能静默登录拿到 visitor token。
- [ ] 调 `POST /auth/phone-login/send-code` 时请求头带 Authorization。
- [ ] 零身份手机号验证后保存 `platform_visitor` auth，进入访客首页。
- [ ] 零身份提交装修需求后才创建 `platform_leads`。
- [ ] 零身份流程不创建 `customers`。
- [ ] 单客户身份验证后直接进入客户端。
- [ ] 单员工身份验证后直接进入员工端。
- [ ] 单城市合伙人身份验证后直接进入合伙人端。
- [ ] 多身份验证后进入候选选择页。
- [ ] 候选页展示 `role_label`、`title`、`subtitle` 和换绑状态。
- [ ] 选择客户候选后进入客户端。
- [ ] 选择员工候选后进入员工端。
- [ ] 选择合伙人候选后进入合伙人端。
- [ ] 选择页重复点击不会发起多次有效登录。
- [ ] `selection_token` 过期后提示重新验证手机号。
- [ ] 客户/员工换绑边界进入既有换绑申请流程。
- [ ] 合伙人换绑边界进入 `packagePartner/pages/rebind-request/index`。
- [ ] 带 `share_token` 的多租户客户候选排序正确。
- [ ] 登录成功后按需清理 `pendingShareToken`，不要提前丢失分享归因。

## 11. 分工边界

gooes 后端已完成：

- 统一手机号登录三接口。
- 客户、员工、城市合伙人候选查询。
- 单身份直登、多身份选择、零身份访客状态机。
- `selection_token` 安全与幂等。
- `share_token` 归因。
- DB migration 和测试覆盖。

orange 小程序待完成：

- 新增统一手机号登录 service 和类型。
- 替换访客首页旧分角色验证流程。
- 新增多身份候选选择页。
- 按错误码接入换绑和重试。
- 在开发版完成上述 smoke。

orange 仓库本次保持只读，未修改、未格式化、未提交。
