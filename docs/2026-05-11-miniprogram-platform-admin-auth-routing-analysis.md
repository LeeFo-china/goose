# 小程序平台超管登录分流问题排查与对接建议

## 1. 问题现象

小程序端 `hydrateAuth` 恢复登录态后，当前账号返回：

```json
{
  "roles": ["employee"],
  "tenant": null,
  "authMode": ""
}
```

前端按 `roles` 命中 `employee` 后进入员工首页。但该账号实际是平台超管，且没有租户归属，因此进入租户员工工作台是不合理的。

## 2. 后端排查结论

问题出在小程序登录链路仍使用粗粒度身份判断。

### 2.1 `/auth` 登录只返回粗粒度 roles

位置：

```text
apps/api/src/controllers/wechat/index.ts
```

当前 `/auth` 在拿到 `auth_user_id` 后调用 `getUserRoles(userId)`，然后直接签发小程序 token。

```ts
const roles = await this.getUserRoles(userId);
const token = signToken({
  sub: userId,
  openid: wxData.openid,
  roles,
});
```

这个 token 不包含：

- `tenant_id`
- `tenant_slug`
- `platform_admin`
- `authMode`
- `employee_id`

因此小程序端没有足够上下文判断“平台超管”和“普通租户员工”。

### 2.2 `getUserRoles()` 没有读取真实角色表

当前逻辑：

```ts
private async getUserRoles(userId: string) {
  const roles: string[] = [];

  const [{ data: employeeData }, { data: customerData }] = await Promise.all([
    adminClient.from("employees").select("id").eq("user_id", userId).limit(1),
    adminClient.from("customers").select("id").eq("user_id", userId).limit(1),
  ]);

  if ((employeeData || []).length > 0) {
    roles.push("employee");
  }

  if ((customerData || []).length > 0) {
    roles.push("customer");
  }

  if (roles.length === 0) {
    roles.push("visitor");
  }

  return roles;
}
```

只要 `employees.user_id = 当前用户`，就会返回 `employee`。它不会查询 `employee_roles -> roles.code`，所以平台超管的 `platform_admin` 身份在小程序登录态里丢失。

### 2.3 admin 后台链路是正确的

admin 后台使用 `authorizationService.getAuthContextByAuthUserId()` 读取真实角色和租户上下文。

该链路可以识别：

```ts
isPlatformAdmin: roleCodes.includes("platform_admin")
```

并返回：

- `roles: authContext.roleCodes`
- `tenant: null`
- `permissions`

所以问题不是平台超管数据模型本身，而是小程序登录链路没有复用 admin 的授权上下文。

## 3. 根因

根因是“小程序身份类型”和“租户员工身份”没有明确分层：

- 平台超管本质上也是一条 `employees` 记录。
- 小程序当前只要发现员工记录，就返回 `roles: ["employee"]`。
- 小程序前端再按 `employee` 分流，导致平台超管进入员工首页。
- `tenant: null` 已经暴露了异常信号，但前端没有把“employee + tenant null”当作不可进入员工端处理。

## 4. 后端推荐调整

建议后端新增小程序登录态归一化，不再让小程序端直接依赖粗粒度 `getUserRoles()`。

### 4.1 推荐返回结构

#### 平台超管

```json
{
  "mode": "platform_admin",
  "authMode": "platform_admin",
  "token": "xxx",
  "user_id": "auth-user-id",
  "roles": ["platform_admin"],
  "tenant": null,
  "employee": {
    "id": "employee-id",
    "name": "平台超管"
  },
  "message": "平台超管暂不进入小程序员工端"
}
```

平台超管如果暂不支持小程序端业务页面，可以继续签发 token，但前端必须进入“平台账号提示页”，不能进入员工首页。

#### 租户员工

```json
{
  "mode": "tenant_employee",
  "authMode": "tenant_employee",
  "token": "xxx",
  "user_id": "auth-user-id",
  "roles": ["employee"],
  "tenant": {
    "id": "tenant-id",
    "name": "某某装修公司",
    "slug": "demo",
    "status": "active"
  },
  "employee": {
    "id": "employee-id",
    "name": "张三"
  }
}
```

#### 客户

```json
{
  "mode": "customer",
  "authMode": "customer",
  "token": "xxx",
  "user_id": "auth-user-id",
  "roles": ["customer"],
  "tenant": {
    "id": "tenant-id",
    "name": "某某装修公司",
    "slug": "demo"
  },
  "customer": {
    "id": "customer-id",
    "name": "李先生"
  }
}
```

#### 平台访客

```json
{
  "mode": "platform_visitor",
  "authMode": "platform_visitor",
  "roles": ["visitor"],
  "tenant": null,
  "message": "暂未匹配到装修公司，可先提交装修需求"
}
```

### 4.2 token 建议补充字段

小程序 token 建议补充：

```json
{
  "sub": "auth-user-id",
  "openid": "openid",
  "roles": ["platform_admin"],
  "tenant_id": null,
  "tenant_slug": null,
  "employee_id": "employee-id",
  "customer_id": null,
  "login_channel": "wechat"
}
```

其中：

- 平台超管：`roles` 必须包含 `platform_admin`，`tenant_id = null`。
- 租户员工：`roles` 可保留 `employee`，但必须带 `tenant_id`。
- 客户：必须带 `customer_id`，如果已选择租户则带 `tenant_id`。

## 5. 小程序端对接建议

### 5.1 不要只按 `roles.includes("employee")` 分流

推荐优先级：

```ts
function resolveLandingRoute(session) {
  const roles = session?.roles || session?.userInfo?.roles || [];
  const tenant = session?.tenant || null;
  const authMode = session?.authMode || session?.mode || "";

  if (authMode === "platform_admin" || roles.includes("platform_admin")) {
    return "/pages/platform-account/index";
  }

  if (roles.includes("employee")) {
    if (!tenant?.id) {
      return "/pages/account-unsupported/index?reason=employee_missing_tenant";
    }

    return "/packageEmployee/pages/home/index";
  }

  if (roles.includes("customer")) {
    return "/packageCustomerPortal/pages/home/index";
  }

  if (authMode === "select_tenant") {
    return "/packageCustomerPortal/pages/select-tenant/index";
  }

  return "/pages/visitor/index";
}
```

### 5.2 对 `employee + tenant null` 做强保护

小程序端遇到以下状态时，不允许进入员工首页：

```json
{
  "roles": ["employee"],
  "tenant": null
}
```

推荐展示：

```text
当前账号未绑定装修公司，暂不支持进入员工端。
如你是平台管理员，请使用 admin 后台处理平台运营工作。
```

这条规则能立即避免平台超管、异常员工、历史脏数据误进入租户员工页面。

### 5.3 `hydrateAuth` 恢复登录态时要二次校验

小程序启动时从本地缓存恢复 token 后，不应只看本地 `userInfo.roles`。

推荐流程：

1. 读取本地 token。
2. 调后端当前身份接口，或调用一个专门的 `GET /auth/session`。
3. 使用服务端最新返回覆盖本地 `authMode / roles / tenant`。
4. 再执行分流。

如果暂时没有通用 session 接口，前端至少要做本地保护：

```ts
if (roles.includes("employee") && !tenant?.id) {
  clearEmployeeHomeRedirect();
  redirectToUnsupportedAccountPage();
}
```

### 5.4 本地缓存升级策略

历史缓存里可能只有：

```json
{
  "roles": ["employee"],
  "tenant": null,
  "authMode": ""
}
```

小程序端需要在版本升级时兼容：

- 如果 `authMode` 为空，按新规则重新推断。
- 如果 `employee + tenant null`，不要继续使用旧路由缓存。
- 建议清理旧的 `lastRoute` / `homeRoute` 缓存，防止启动后又跳回员工首页。

## 6. 推荐实施顺序

### 阶段 1：小程序端止血

1. 分流逻辑增加 `platform_admin` 优先判断。
2. 增加 `employee + tenant null` 阻断。
3. 新增账号不支持页面或平台账号提示页。
4. `hydrateAuth` 后不要直接跳员工首页。

验收：

- 当前平台超管账号不再进入员工首页。
- 普通租户员工仍能进入员工首页。
- 客户仍能进入客户门户。

### 阶段 2：后端补齐小程序登录上下文

1. `/auth` 和 `/auth/verify-role` 复用 `authorizationService.getAuthContextByAuthUserId()`。
2. 返回 `authMode`。
3. 返回 `tenant`、`employee`、`customer`。
4. token 补充 `tenant_id / tenant_slug / employee_id / customer_id / login_channel`。
5. 对平台超管返回 `mode=platform_admin`，不再返回单纯 `employee`。

验收：

- 平台超管：`roles=["platform_admin"]`，`tenant=null`。
- 租户员工：`roles` 至少包含 `employee`，且 `tenant.id` 有值。
- 客户：`roles` 包含 `customer`，客户态字段完整。

### 阶段 3：统一身份接口

建议补一个统一接口：

```http
GET /auth/session
```

返回当前 token 对应的标准身份包。小程序、H5、admin BFF 都可以按这个结构恢复登录态。

## 7. 最终建议

短期小程序端必须加保护：`roles.includes("employee") && tenant == null` 不能进入员工首页。

长期后端要修正小程序登录协议：小程序登录不能继续使用 `getUserRoles()` 的粗粒度判断，应复用授权上下文，让平台超管、租户员工、客户、平台访客四种身份在返回包里明确分开。
