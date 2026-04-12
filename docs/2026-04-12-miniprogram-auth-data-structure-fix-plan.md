# 小程序身份验证数据结构修复计划

日期：2026-04-12

## 背景

根据 `docs/miniprogram-auth-and-decoration-qa-api-summary.md` 的接口要求，当前项目已经具备以下基础：

- `auth.users` 作为基础账号体系
- `wechat_identities` 作为微信 `openid -> auth_user_id` 映射
- `employees.user_id` / `customers.user_id` 作为业务身份绑定字段
- visitor 登录态与 JWT 机制已初步打通

但当前数据结构与文档中的“手机号验证码绑定 customer / employee 身份”仍存在若干冲突和能力缺口，需要系统性修复。

---

## 一、核心问题概览

### 1. 手机号无法稳定唯一定位身份

当前问题：

- `employees.phone` 可空且无唯一约束
- `customers.phone` 可空且无唯一约束

带来的风险：

- `/auth/verify-role` 无法安全按手机号绑定身份
- 一个手机号可能命中多条员工或客户记录
- 可能将当前微信账号错误绑定到错误业务档案

### 2. 缺少验证码基础设施

当前问题：

- 没有验证码表
- 没有发送频控结构
- 没有验证码有效期与已使用状态的存储

带来的风险：

- `/auth/send-code` 和 `/auth/verify-role` 无法完整实现
- 无法做 60 秒频控、5 分钟有效期、防重放

### 3. `customers` 表当前更像 CRM 客户池，而非终端用户唯一账号表

当前字段：

- `owner_id`
- `source`
- `status`
- `tags`
- `last_follow_at`

说明：

该表带有明显 CRM 业务属性，不一定天然等于“一人一条小程序客户主档案”。

带来的风险：

- 同手机号可能存在多条客户记录
- 文档中的“手机号直接绑定 customer”假设可能不成立

### 4. 身份绑定口径需要统一

当前系统中并存：

- `wechat_identities.openid`
- `auth.users`
- `employees.user_id`
- `customers.user_id`
- 遗留字段 `employees.openid`

带来的风险：

- 后续开发容易混用不同字段
- 登录、绑定、查角色的口径不一致

### 5. 文档默认单角色返回，但当前系统支持多角色

文档示例：

- `roles: ["customer"]`
- `roles: ["employee"]`

当前系统设计：

- 允许一个 auth user 同时拥有多个角色
- 例如：`["employee", "customer"]`

带来的风险：

- 前端和后端对角色语义理解不一致

---

## 二、修复目标

本次修复目标如下：

1. 支持 `POST /auth/send-code`
2. 支持 `POST /auth/verify-role`
3. 支持 visitor 登录后按手机号升级为 `customer` 或 `employee`
4. 保持当前微信 visitor 登录链路不回退、不混乱
5. 明确未来身份绑定统一口径

---

## 三、分阶段修复方案

## 第一阶段：先打通身份验证主链路（必须优先完成）

### 1. 新增验证码存储表

建议新增表：`public.sms_verification_codes`

建议字段：

```sql
id uuid primary key default gen_random_uuid(),
phone text not null,
scene text not null,
code text not null,
status text not null default 'pending',
expired_at timestamptz not null,
verified_at timestamptz null,
created_at timestamptz not null default now(),
request_ip text null
```

建议索引：

- `(phone, scene)`
- `created_at`

业务规则：

- 同手机号 + 同 scene，60 秒内不可重复发送
- 验证码有效期 5 分钟
- 校验成功后标记为 `verified`

适配接口：

- `POST /auth/send-code`
- `POST /auth/verify-role`

### 2. 给员工手机号增加唯一约束

建议增加部分唯一索引：

```sql
create unique index if not exists employees_phone_unique
on public.employees(phone)
where phone is not null;
```

原因：

- 员工身份绑定必须稳定唯一
- 如果手机号不唯一，无法安全将微信 visitor 升级为 employee

### 3. 明确客户手机号策略

这里需要二选一：

#### 方案 A：客户手机号唯一（推荐，简单快速）

增加：

```sql
create unique index if not exists customers_phone_unique
on public.customers(phone)
where phone is not null;
```

适用场景：

- 一个自然客户只保留一条主客户档案
- 小程序客户身份与 CRM 客户表直接对齐

优点：

- `/auth/verify-role` 实现最简单
- 前后端联调最快

缺点：

- 会让 `customers` 更接近“用户主档案”，而不只是 CRM 线索表

#### 方案 B：客户手机号允许重复（业务更严谨）

如果保留 CRM 客户池语义，则不能只靠手机号绑定。

建议新增字段：

```sql
is_primary_account boolean not null default false
```

绑定规则：

- `/auth/verify-role` 只允许绑定 `is_primary_account = true` 的客户记录

优点：

- 更符合 CRM 线索池/客户池真实业务语义

缺点：

- 实现复杂度更高
- 需要数据清洗和运营后台配合

> 当前阶段建议优先采用方案 A，先保证链路打通。

### 4. 统一身份绑定口径

后续所有接口统一只使用以下四类字段：

- 微信身份映射：`wechat_identities`
- 基础登录用户：`auth.users.id`
- 员工绑定：`employees.user_id`
- 客户绑定：`customers.user_id`

明确约定：

- `employees.openid` 作为历史遗留字段，不再参与新的登录和绑定主流程

### 5. 实现 `POST /auth/send-code`

#### 请求参数

```json
{
  "phone": "13877778888",
  "scene": "bind_customer"
}
```

或：

```json
{
  "phone": "13877778888",
  "scene": "bind_employee"
}
```

#### 后端逻辑

1. 校验手机号格式
2. 校验 `scene` 是否合法
3. 检查发送频控（60 秒）
4. 生成 6 位验证码
5. 落库到 `sms_verification_codes`
6. 调用短信服务发送

#### 响应

```json
{
  "message": "验证码已发送"
}
```

#### 开发期建议

- 本地 / 开发环境可先把验证码打印到日志中
- 生产环境再接真实短信平台

### 6. 实现 `POST /auth/verify-role`

#### 请求参数

```json
{
  "phone": "13877778888",
  "code": "123456",
  "target_role": "customer"
}
```

或：

```json
{
  "phone": "13877778888",
  "code": "123456",
  "target_role": "employee"
}
```

#### 请求前提

调用该接口时，前端已经持有 visitor token。

后端需要从：

- `request.user.sub`

中拿到当前 `auth_user_id`。

#### 推荐后端逻辑

##### Step 1：校验当前登录态

- 必须已经登录
- 必须能识别出当前 visitor 对应的 `auth.users.id`

##### Step 2：校验验证码

匹配以下条件：

- `phone` 正确
- `scene` 正确
- `code` 正确
- 未过期
- 未使用

##### Step 3：查目标角色数据

###### 如果 `target_role = customer`

按手机号查 `customers`：

- 查不到：返回 400 / 422，message：`该手机号未绑定客户身份`
- 查到多条：返回 409 / 422，message：`该手机号绑定了多个客户档案，请联系管理员处理`
- 查到唯一一条：执行绑定

绑定动作：

```sql
update customers set user_id = currentAuthUserId where id = xxx;
```

###### 如果 `target_role = employee`

按手机号查 `employees`：

- 查不到：返回 400 / 422，message：`该手机号未绑定员工身份`
- 查到多条：返回 409 / 422，message：`该手机号绑定了多个员工档案，请联系管理员处理`
- 查到唯一一条：执行绑定

绑定动作：

```sql
update employees set user_id = currentAuthUserId where id = xxx;
```

##### Step 4：验证码置为已使用

##### Step 5：重新计算用户角色

##### Step 6：重新签发 JWT

##### Step 7：返回新 token

成功响应示例：

```json
{
  "data": {
    "token": "jwt-token",
    "user_id": "auth-user-id",
    "roles": ["customer"],
    "is_new_user": false
  },
  "message": "身份验证成功"
}
```

---

## 第二阶段：修正数据模型歧义（建议尽快完成）

### 7. 清理历史手机号重复数据

在为 `employees.phone` 或 `customers.phone` 增加唯一索引前，需要先清洗历史数据。

建议检查：

- 员工表中重复手机号
- 客户表中重复手机号
- 空手机号、测试手机号、无效手机号

清洗完成后再执行唯一索引 migration。

### 8. 明确 `customers` 是否承担终端用户主档案职责

如果希望小程序客户身份直接与 `customers` 对齐，建议明确：

- 一个手机号对应一条客户主档案
- 允许 CRM 补充字段继续保留

如果不希望，则建议后续新增独立“终端用户档案”表，但这不建议作为当前第一阶段目标。

### 9. 停止在新逻辑中使用 `employees.openid`

建议：

- 代码层面停止读取它作为主绑定条件
- 保留字段以兼容历史数据
- 后续可考虑迁移/废弃

### 10. 重新生成 `types/database.ts`

本轮以及后续 migration 新增了：

- `wechat_identities`
- 查询历史 auth 用户的 RPC
- 未来还会新增 `sms_verification_codes`

所以完成 migration 后，需要重新生成数据库类型文件，避免类型落后于实际数据库结构。

---

## 第三阶段：统一协议与前后端角色认知（建议同步推进）

### 11. 统一角色返回协议

后端应统一返回数组形式：

- `roles: ["visitor"]`
- `roles: ["customer"]`
- `roles: ["employee"]`
- `roles: ["employee", "customer"]`

前端建议按优先级处理：

1. 包含 `employee` -> 员工工作台
2. 否则包含 `customer` -> 客户主页
3. 否则 -> visitor 页

这样可以兼容未来的一人多角色。

### 12. 明确 `/auth/verify-role` 的职责不是创建 auth 用户

该接口职责应明确为：

- 验证手机号与验证码
- 将当前 visitor 对应的 `auth.users.id` 绑定到 `employees` 或 `customers`
- 重新签发 JWT

不负责创建新的基础 auth 用户。

### 13. `POST /ai/decoration-qa` 可独立推进

该接口与当前业务数据结构耦合低，不依赖 `employees/customers/projects` 表结构，可以在身份链路稳定后单独实现。

---

## 四、推荐实施顺序

推荐按以下顺序推进：

### 第 1 步

新增 `sms_verification_codes` 表与发送频控逻辑

### 第 2 步

为 `employees.phone` 增加唯一索引

### 第 3 步

确定 `customers.phone` 采用“唯一”还是“主档案标记”策略

### 第 4 步

实现 `POST /auth/send-code`

### 第 5 步

实现 `POST /auth/verify-role`

### 第 6 步

统一身份绑定口径，停止新逻辑使用 `employees.openid`

### 第 7 步

重新生成数据库类型文件

### 第 8 步

最后补 `POST /ai/decoration-qa`

---

## 五、推荐决策

当前建议先采用：

### 方案 1：简单快速版

包含：

- 新增验证码表
- `employees.phone` 唯一
- `customers.phone` 唯一
- 实现 `/auth/send-code`
- 实现 `/auth/verify-role`

优点：

- 前后端联调最快
- visitor -> customer / employee 升级链路最简单
- 可尽快稳定交付小程序能力

缺点：

- `customers` 会兼具 CRM 与终端用户主档案语义

如果未来 CRM 复杂度提高，再演进为“主档案 + 线索池”双模型。

---

## 六、总结

当前文档要求与现有项目数据结构**并非不可兼容**，但存在以下关键缺口：

1. 手机号缺乏唯一性约束
2. 缺少验证码存储与频控能力
3. `customers` 作为 CRM 表与终端账号主档案的语义尚未明确
4. 身份绑定字段口径需要统一

建议先按“简单快速版”打通 visitor 升级链路，保证前端联调成功；后续再根据 CRM 复杂度逐步演进数据模型。
