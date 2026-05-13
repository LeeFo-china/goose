# 多端登录重构第 7 阶段前置：Membership 灰度验收记录

日期：2026-05-14

## 结论

本阶段先执行 `AUTH_IDENTITY_SOURCE=membership` 灰度验收，不删除旧表和旧字段。

原因：

- 代码中仍保留 `wechat_identities`、`customers.user_id`、`employees.user_id` 的兼容读路径和排障用途。
- 阶段 7 的“清理旧模型”需要至少一个版本周期确认主链路不再读写旧字段。
- 现在直接删除旧字段会影响换绑申请、历史微信身份兼容、旧文档对接和部分排障脚本。

## 本次验收范围

本地 API 启动方式：

```bash
AUTH_IDENTITY_SOURCE=membership LOG_LEVEL=error PORT=3000 bun run api:start
```

验证样本：

- tenant_id：`51111111-1111-4111-8111-111111111111`
- customer_id：`5aaaaaaa-0005-4aaa-8aaa-aaaaaaaaaaaa`
- customer user_id：`1a3f8715-37bf-43fe-bf15-4c13571b5f99`
- project_id：`5aaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa`
- employee_id：`5aaaaaaa-0004-4aaa-8aaa-aaaaaaaaaaaa`
- employee user_id：`6348a82f-1df1-4958-a9ce-62fd08f9b4d8`

## 验收结果

### 1. 客户 Web / 手机号登录态

不携带 `openid` 的 customer token 调用：

```http
GET /customer/projects?page=1&pageSize=3
```

结果：

- `200 OK`
- `total=1`
- `first_project_id=5aaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa`

结论：Web / 手机号登录态可通过 active customer membership 访问客户项目。

### 2. 员工 Web / 手机号登录态

不携带 `openid` 的 employee token 调用：

```http
GET /auth/me/permissions
```

结果：

- `200 OK`
- `permission_count=48`

结论：员工业务上下文可通过 active employee membership 获取权限。

### 3. 已解绑微信旧 token 拦截

携带已解绑 `openid=oD-Pj5FxfjI8pupbHleYD9XGVTlM` 的 customer token 调用：

```http
GET /auth/me/customer-context
```

结果：

```http
401 Unauthorized
```

```json
{
  "code": "WECHAT_BINDING_NOT_MATCHED",
  "message": "当前微信登录凭证已失效，请重新登录"
}
```

结论：`membership` 模式下，旧微信 token 不会因为业务 membership 仍存在而绕过 OAuth 凭证失效校验。

## 本阶段文档修正

- `docs/2026-05-08-project-acceptance-api-integration-guide.md`
  - 客户侧工序验收的登录态说明从 `customers.user_id` 改为 `user_business_memberships`。
- `docs/application_integration_documentation/2026-05-09-phase-3e-wechat-miniprogram-integration.md`
  - 短视频转文本租户解析说明从 `customers.user_id` 改为客户业务身份关系。

## Admin 对接

本阶段 Admin 暂无必须改动。

建议后续增加只读排障能力：

- 根据手机号查询 `user_oauth_identities`。
- 根据手机号查询 `user_business_memberships`。
- 员工 / 客户详情展示旧字段与 membership 是否一致。

## 微信小程序对接

本阶段小程序接口参数不变。

小程序需要继续遵守：

- 登录后按后端 `mode` 分流。
- 解绑成功后清本地 token 并回 landing。
- 同微信再次登录返回 visitor 时，不要用本地缓存强行进入客户或员工首页。
- 手机号验证码恢复身份后，使用新 token 访问业务接口。

## 阶段 7 是否可以删除旧模型

当前不建议删除。

删除前必须满足：

1. 生产或灰度环境 `AUTH_IDENTITY_SOURCE=membership` 稳定运行一个版本周期。
2. 全仓主链路搜索确认无 `customers.user_id` / `employees.user_id` 登录判断。
3. `wechat_identities` 不再参与登录主链路，只保留归档或迁移。
4. 换绑、解绑、手机号登录、客户自助、员工端、Admin 登录全部通过验收。
5. 已备份旧字段数据，并准备可回滚 migration。

建议下一步：

- 保持旧字段只读观察。
- 补 Admin 身份排障视图。
- 灰度环境设置 `AUTH_IDENTITY_SOURCE=membership` 后做真机验收。
