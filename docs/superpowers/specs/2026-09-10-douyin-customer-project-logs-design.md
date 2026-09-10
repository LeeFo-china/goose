# 抖音小程序客户项目施工日志设计

日期：2026-09-10

## 背景

抖音小程序需要支持装修公司客户登录后查看自己家项目的施工日志。
客户可以使用抖音授权手机号快速登录，也可以手动填写手机号并通过短信验证码登录。

当前仓库已有抖音小程序公开展示能力和客户自助项目能力：

- 抖音公开能力位于 `/douyin-mini/*`，面向公开项目、工地、案例、预算、问答和获客。
- 客户自助能力位于 `/customer/*`，已有客户上下文、客户项目列表、项目详情、施工日志列表和评论查询。

本设计不把公开项目接口改造成客户私域接口。公开接口继续用于营销展示，客户项目日志使用客户身份和项目归属校验。

## 目标

1. 抖音小程序客户可以进入“我的项目”。
2. 未登录客户进入客户登录页。
3. 登录页提供两个入口：
   - 抖音授权手机号登录。
   - 手动填写手机号并输入短信验证码登录。
4. 已验证手机号用于解析客户身份。
5. 客户身份绑定成功后进入“我的项目”。
6. 客户可以查看自己名下项目。
7. 客户可以查看自己家项目下全部施工日志。

## 非目标

1. 不新增客户自助日志的“客户可见”过滤字段。
2. 不让未命中客户档案的手机号自动创建客户。
3. 不把抖音公开项目、公开工地接口当作客户私域接口使用。
4. 不在本功能里实现员工端内部备注、成本备注或工单能力。

## 产品规则

客户能看到自己家项目下所有施工日志。权限边界是项目归属，而不是日志可见性。

具体规则：

- 项目必须满足 `projects.tenant_id = token.tenant_id`。
- 项目必须满足 `projects.customer_id = token.customer_id`。
- 通过归属校验后，返回该项目下全部 `project_logs`。
- 员工端写入 `project_logs` 时，应默认理解为客户可见内容。
- 内部沟通、供应商成本、争议处理、投诉处理等敏感内容，不应写入 `project_logs`。

## 推荐方案

采用“平台化手机号身份登录 + 复用客户自助接口”的方案。

### 登录双通道

两个登录入口只负责提供已验证手机号：

- 抖音授权手机号：小程序通过 `open-type="getPhoneNumber"` 得到 `code`，后端调用抖音开放平台换取手机号。
- 手填验证码：客户输入手机号，后端发送短信验证码，客户输入验证码后完成验证。

两条路径都进入同一个身份解析流程：

```text
已验证手机号
  -> 查询 customers.phone
  -> 过滤 active tenant
  -> 构建客户身份候选
  -> 绑定抖音登录凭证和客户业务身份
  -> 签发客户 auth token
```

### 身份结果

手机号验证后按候选数量返回：

- 0 个客户身份：提示“未找到客户档案，请联系装修公司确认预留手机号”，不创建客户。
- 1 个客户身份：直接绑定并登录。
- 多个客户身份：返回候选列表，客户选择装修公司或项目地址后登录。

多身份候选至少展示：

- 装修公司名称。
- 客户姓名或手机号尾号。
- 最近项目名称或项目地址。

### Token 策略

抖音小程序现有会话 token 只用于 `/douyin-mini/*` 公开内容和获客接口。
客户登录成功后签发普通客户 `auth` token，用于 `/customer/*` 私域接口。

客户 token 包含：

- `token_type: "auth"`。
- `login_channel: "douyin"`。
- `sub`：系统 auth user id。
- `tenant_id`。
- `customer_id`。
- `roles: ["customer"]`。
- `verified_phone`。
- 抖音平台凭证标识，供 auth 插件校验登录凭证仍然有效。

后端不能把抖音 openid 或 subject hash 当成微信 openid 处理。现有微信绑定校验需要泛化为按登录平台校验，或新增抖音客户 token 的专用校验。

## 后端设计

### 数据模型

需要 migration 扩展登录凭证平台枚举：

- `user_oauth_identities.platform` 增加 `douyin_mini`。
- `sync_user_oauth_identity` 等相关 RPC 继续接受平台参数。
- 若现有 TypeScript 类型把平台限制为联合类型，也要同步增加 `douyin_mini`。

不需要修改 `project_logs` 表结构。

### API 设计

建议在 `/douyin-mini/customer-auth/*` 下新增抖音客户登录接口，避免误用现有微信手机号登录接口。

建议接口：

```http
POST /douyin-mini/customer-auth/phone/send-code
Authorization: Bearer <douyin miniapp session token>
```

请求：

```json
{ "phone": "13800138000" }
```

响应：

```json
{ "success": true, "cooldown_seconds": 60 }
```

```http
POST /douyin-mini/customer-auth/phone/verify
Authorization: Bearer <douyin miniapp session token>
```

请求：

```json
{ "phone": "13800138000", "code": "123456" }
```

```http
POST /douyin-mini/customer-auth/phone/authorize
Authorization: Bearer <douyin miniapp session token>
```

请求：

```json
{ "douyin_phone_code": "official-phone-code" }
```

`verify` 和 `authorize` 成功后返回同一种结果：

```json
{
  "status": "authenticated",
  "auth": {
    "token": "<customer-auth-token>",
    "mode": "customer",
    "roles": ["customer"],
    "tenant": { "id": "<tenant-id>", "name": "某某装饰" },
    "customer": { "id": "<customer-id>", "name": "张三", "phone": "13800138000" }
  }
}
```

多身份时返回：

```json
{
  "status": "selection_required",
  "selection_token": "<opaque-token>",
  "expires_in": 300,
  "phone_masked": "138****8000",
  "candidates": [
    {
      "candidate_id": "<candidate-id>",
      "title": "某某装饰",
      "subtitle": "张三 / 示例花园",
      "binding_state": "bindable"
    }
  ]
}
```

选择身份：

```http
POST /douyin-mini/customer-auth/select
Authorization: Bearer <same douyin miniapp session token>
```

请求：

```json
{
  "selection_token": "<opaque-token>",
  "candidate_id": "<candidate-id>"
}
```

### 客户项目与日志接口

客户登录成功后复用现有客户自助接口：

- `GET /customer/bootstrap?page=1&pageSize=20&include=home_summary`
- `GET /customer/projects?page=1&pageSize=20&include=home_summary`
- `GET /customer/projects/:id/detail-bootstrap`
- `GET /customer/projects/:id/logs?page=1&pageSize=10`
- `GET /customer/projects/:id/logs/:logId/comments?page=1&pageSize=20`

`/customer/projects/:id/logs` 的访问控制必须保持：

```text
token.tenant_id + token.customer_id + path.project_id
  -> projects 表归属校验
  -> 读取该项目全部 project_logs
```

## 小程序设计

### 页面

新增页面：

- `pages/customer-login/index`
- `pages/customer-projects/index`
- `pages/customer-project-detail/index`

可选新增入口：

- 首页增加“我的项目”入口。
- Tab 是否增加“我的”不在首期强制；首期可以从首页入口进入，减少对现有获客 tab 的冲击。

### 登录页

登录页展示：

- 主按钮：授权手机号登录。
- 次入口：使用手机号验证码登录。
- 多身份选择列表。
- 未命中客户档案提示。

交互规则：

- 抖音手机号授权失败时允许切换到验证码登录。
- 验证码登录不暴露手机号是否存在客户，只有验证码通过后再返回客户身份结果。
- 多身份选择提交防重复点击。
- `selection_token` 只保存在短期页面状态或 session storage。

### Token 存储

小程序需要区分两个 token：

- 抖音公开会话 token：继续由现有 `SessionManager` 管理。
- 客户 auth token：单独存储，用于客户私域 API。

客户 auth token 过期或 401 时：

- 清除客户 auth token。
- 回到客户登录页。
- 不清除抖音公开会话 token，避免影响公开内容访问。

## 错误处理

后端错误继续使用现有错误工厂包装。

关键错误码建议：

- `DOUYIN_CUSTOMER_AUTH_SESSION_REQUIRED`：缺少抖音小程序会话。
- `DOUYIN_PHONE_AUTH_FAILED`：抖音手机号授权失败。
- `SMS_CODE_REQUIRED`：验证码缺失。
- `SMS_CODE_INVALID`：验证码错误。
- `SMS_CODE_EXPIRED`：验证码过期。
- `SMS_CODE_RATE_LIMITED`：短信发送频率限制。
- `CUSTOMER_IDENTITY_NOT_FOUND`：手机号未匹配客户档案。
- `CUSTOMER_IDENTITY_SELECTION_REQUIRED`：需要选择客户身份。
- `IDENTITY_SELECTION_EXPIRED`：选择凭证过期。
- `CUSTOMER_CONTEXT_MISSING`：客户身份已失效。

## 性能与分页

- 客户项目列表必须分页，默认 `page=1&pageSize=20`，最大不超过 100。
- 客户日志列表必须分页，建议默认 `pageSize=10`，最大 20，沿用现有客户自助日志约束。
- 日志读取必须限定字段，不做无上限全量返回。
- 首屏可以用 `detail-bootstrap` 返回少量最新日志；更多日志通过分页加载。
- 现有 `project_logs(tenant_id, project_id, created_at desc)` 索引可支撑该查询路径。

## 安全边界

1. 不能只靠手机号查询项目日志。
2. 不能让抖音公开 token 直接访问客户项目。
3. 不能把抖音登录凭证写入 `wechat_mini` 平台。
4. 不能在发短信阶段泄露手机号是否存在客户。
5. 多租户同手机号必须让客户选择身份。
6. 客户 token 每次访问 `/customer/*` 都要校验当前登录凭证和业务身份仍有效。

## 验收标准

后端：

- 抖音授权手机号能换取手机号并完成客户登录。
- 手填手机号验证码能完成客户登录。
- 未匹配客户时不创建客户。
- 多客户身份时返回候选并可选择登录。
- 客户只能访问自己名下项目。
- 客户访问他人项目返回 404 或 403。
- 客户项目日志返回该项目全部 `project_logs`，且分页生效。

小程序：

- “我的项目”未登录时进入登录页。
- 授权手机号登录成功后进入项目列表。
- 验证码登录成功后进入项目列表。
- 多身份选择后进入对应客户项目列表。
- 项目详情显示项目基本信息和施工日志。
- 日志支持分页加载和图片预览。
- 客户 token 过期后回到登录页。

## 实施拆分

建议分四步实施：

1. 后端身份模型与 migration：增加 `douyin_mini` 登录平台，抽象抖音客户登录所需绑定能力。
2. 后端抖音客户登录 API：实现授权手机号、短信验证码、身份候选、选择身份和客户 token 签发。
3. 小程序客户登录与 token 管理：新增客户登录页和客户 API client。
4. 小程序我的项目与详情：复用客户项目、详情、日志和评论接口展示数据。

每一步单独验证，避免把身份、安全和 UI 改动混在同一个不可回滚变更里。
