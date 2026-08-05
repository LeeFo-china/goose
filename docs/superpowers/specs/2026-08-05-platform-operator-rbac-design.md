# 平台运营人员与权限体系设计

**日期：** 2026-08-05

**状态：** 方案已确认，待书面评审

**适用范围：** Gooes API、Admin、Domain 与 Supabase migration

## 1. 执行结论

平台新增运营人员时，不直接复制现有超级管理员账号，也不把普通运营人员绑定为 `platform_admin`。

本期采用以下模型：

- `platform_admin` 继续表示平台超级管理员，只分配给极少数负责人；
- 新增全局基础角色 `platform_staff`，只表示“平台工作人员身份”，不自动获得业务管理权限；
- 普通运营人员由一个 `tenant_id IS NULL` 的 `employees` 记录承载，并固定绑定 `platform_staff`；
- 运营人员再按岗位叠加一个或多个平台业务角色；
- 平台菜单、页面、按钮和后端接口统一按 `platform.*` 权限点判断；
- 租户 `/employees`、`/roles`、`/employees/:id/roles` 等接口继续保持租户专用，不允许平台侧复用或传入伪造租户上下文。

首版目标是让当前单人超管后台安全扩展到小规模运营团队，同时保持逻辑清晰、授权简单、敏感操作可追溯。

## 2. 背景与当前事实

当前平台后台仍以单一超级管理员为主要运行方式：

1. 平台身份由 `employees.tenant_id IS NULL` 且角色包含 `platform_admin` 推导；
2. `PlatformBaseController` 主要校验 `isPlatformAdmin`，部分业务 service 再校验具体权限，但不同模块的落实程度不一致；
3. 当前平台侧导航共 25 个入口，其中 16 个入口没有配置权限要求；
4. `system_admin` 会在授权上下文中直接得到全部权限，平台运营人员不得绑定该角色；
5. 租户员工和租户角色接口均要求非空租户上下文，现有设计文档已经明确平台角色必须使用独立 `/platform/roles`；
6. `platform_audit_logs`、平台审计列表和员工短信验证码登录已经存在，可以复用；
7. 员工状态为非 `active` 时权限集合会被清空，但平台身份标志仍可能保留。对于只检查平台身份、不检查具体权限的接口，已有 Token 存在继续通过的风险；
8. Admin JWT 默认有效期为 7 天，当前没有平台账号专用的会话版本或统一强制退出机制。

因此，增加第二个 `platform_admin` 虽然数据上可行，但会把平台支付、退款、系统设置、运维脚本、供应商黑名单等高风险能力同时交给普通运营人员，不符合最小权限原则。

## 3. 目标

本期实现以下目标：

1. 超级管理员可以从 Admin 创建、编辑、停用和恢复平台运营人员；
2. 超级管理员可以维护平台业务角色并按模块配置权限；
3. 运营人员登录后只看到并只能调用自己获授权的能力；
4. 停用、离职或强制退出后，平台账号不能继续使用历史 Token 调用平台接口；
5. 平台人员、角色、授权和关键业务操作均留下操作者、时间、结果和资源摘要；
6. 超级管理员、平台工作人员、租户管理员三种身份边界清晰；
7. 所有列表分页，默认 `page=1&pageSize=20`，`pageSize` 最大为 `100`；
8. 首版不引入新的身份中心、缓存系统、审批引擎或第三方权限产品。

## 4. 非目标

首版不包含：

- 平台人员按部门、汇报关系或组织树管理；
- 将租户角色管理改造成同时兼容平台角色；
- 平台人员模拟登录租户后台；
- 平台人员按城市、区县或租户集合进行数据范围授权；
- 支持同一手机号同时作为平台运营人员和任意租户员工登录 Admin；
- 为所有敏感操作建设双人复核工作流；
- 接入企业微信、LDAP、SSO、TOTP 或 Passkey；
- 删除历史角色、员工、授权和审计数据。

平台团队扩大或出现区域化运营后，再单独设计 `assigned_tenants`、`region_codes` 等平台数据范围。首版所有已授予平台权限统一使用 `access_scope=all`，不得借用租户的 `department`、`assigned` 或 `self` 表达平台区域权限。

## 5. 身份与角色模型

### 5.1 身份判定

授权上下文新增两个明确字段：

```ts
isPlatformStaff: boolean;
isPlatformSuperAdmin: boolean;
```

判定规则：

```text
isPlatformSuperAdmin = employee.tenant_id IS NULL
  AND active role contains platform_admin

isPlatformStaff = employee.tenant_id IS NULL
  AND active role contains platform_staff or platform_admin
```

现有 `isPlatformAdmin` 在迁移期继续保留原语义，只代表 `platform_admin` 超级管理员，避免普通运营人员因兼容字段被旧接口误判为超管。全部平台模块迁移完成后，再单独评估是否废弃该字段。

### 5.2 角色层次

| 角色编码 | 名称 | 类型 | 规则 |
| --- | --- | --- | --- |
| `platform_admin` | 平台超级管理员 | 内置、受保护 | 拥有全部 `platform.*` 权限；不可删除；不能停用最后一名有效超管 |
| `platform_staff` | 平台工作人员 | 内置、受保护 | 只建立平台登录身份；普通业务权限为空；运营人员必须绑定 |
| `platform_operations` | 综合运营 | 内置模板 | 租户、入驻、线索、内容和基础用量运营 |
| `platform_supplier_operations` | 供应商运营 | 内置模板 | 供应商准入、资质、商品目录和 OCR 操作 |
| `platform_service_delivery` | 服务交付 | 内置模板 | 技术服务订单、工单、履约记录和客户验收准备 |
| `platform_finance_review` | 财务审核 | 内置模板 | 订单、收入、退款申请和结算信息审核，不管理密钥 |
| `platform_technical_operations` | 技术运维 | 内置模板 | 设备、OCR 策略、AI 路由和身份诊断，不执行高危运维脚本 |

运营人员可以绑定多个业务角色。角色权限取并集；员工级 `deny` 覆盖继续优先于角色权限，但首版 Admin 不提供平台员工级临时授权入口，避免形成难以解释的隐性权限。

### 5.3 超管保护规则

- 平台侧不得给任何员工分配 `system_admin`；
- 平台员工不得绑定 `tenant_id IS NOT NULL` 的租户角色；
- 租户员工不得绑定 `tenant_id IS NULL` 的平台角色；
- 当前操作者不能停用、离职或移除自己的最后一个 `platform_admin` 身份；
- 系统始终至少保留一名 `active` 且可登录的 `platform_admin`；
- 内置角色编码不可修改，`platform_admin` 与 `platform_staff` 不可归档；
- 自定义平台角色只能绑定状态为 `active` 且编码以 `platform.` 开头的权限点。

## 6. 平台权限目录

### 6.1 复用现有权限

以下现有权限保持编码和含义不变：

- 微信支付进件：`platform.wechat_pay.applyment.*`、`platform.wechat_pay.config.activate`；
- 平台支付：`platform.payment.config.read`、`platform.payment.config.manage`；
- 计费退款：`platform.billing.recharge_product.manage`、`platform.billing.recharge_refund.*`；
- 技术服务：`platform.service_product.manage`、`platform.service_order.read`、`platform.service_work_order.manage`、`platform.service_refund.review`；
- OCR：`platform.ocr.*`；
- 装企入驻：`platform.tenant_onboarding.review`、`platform.service_provider.publish`；
- 城市合伙人：`platform.partner.*`；
- 官网内容：`platform.site_content.*`；
- 品牌与权益：`platform.branding.*`、`platform.branding_product.manage`、`platform.branding_order.read`、`platform.tenant_entitlement.manage`；
- 虚拟商品：`platform.virtual_product.*`、`platform.virtual_order.read`、`platform.virtual_refund.manage`；
- 供应商：`platform.supplier.*`、`platform.catalog.manage`；
- 抖音小程序：`platform.douyin_miniapp.manage`。

### 6.2 新增基础权限

为当前无权限保护的平台页面和平台组织能力新增：

| 权限编码 | 用途 |
| --- | --- |
| `platform.dashboard.read` | 查看平台概览 |
| `platform.operator.read` | 查看平台运营人员 |
| `platform.operator.manage` | 新增、编辑、停用、恢复和强制退出运营人员 |
| `platform.role.read` | 查看平台角色与有效权限 |
| `platform.role.manage` | 创建、编辑、归档角色和配置角色权限 |
| `platform.audit.read` | 查看平台审计日志 |
| `platform.tenant.read` | 查看租户列表和详情 |
| `platform.tenant.manage` | 创建和编辑租户、初始化租户管理员 |
| `platform.tenant.status.manage` | 停用、恢复或归档租户 |
| `platform.device.read` | 查看平台设备资产 |
| `platform.device.manage` | 维护设备、厂商和绑定关系 |
| `platform.lead.read` | 查看平台线索 |
| `platform.lead.assign` | 分配、改派和关闭平台线索 |
| `platform.picture.read` | 查看平台图片资料库 |
| `platform.picture.manage` | 上传、编辑和归档平台图片 |
| `platform.marketing_page.read` | 查看 H5 活动页 |
| `platform.marketing_page.manage` | 创建和编辑 H5 活动页 |
| `platform.marketing_page.publish` | 发布、下线 H5 活动页 |
| `platform.usage.read` | 查看平台用量统计 |
| `platform.billing.read` | 查看平台计费总览和订单摘要 |
| `platform.ai_config.read` | 查看 AI 模型路由 |
| `platform.ai_config.manage` | 修改和验证 AI 模型路由 |
| `platform.identity_diagnostic.read` | 使用身份排障能力 |
| `platform.system_setting.read` | 查看平台级系统配置 |
| `platform.system_setting.manage` | 修改平台级系统配置 |
| `platform.social_video.manage` | 使用平台自媒体脚本能力 |
| `platform.location.manage` | 维护平台行政区域和运营区域数据 |
| `platform.ops.execute` | 执行平台运维脚本 |

平台 Admin 菜单的 25 个入口必须全部配置对应权限。没有权限的入口不显示；直接访问页面时展示权限不足；后端仍必须独立拒绝，菜单隐藏不构成安全边界。

### 6.3 默认角色权限

| 角色 | 默认权限范围 |
| --- | --- |
| 综合运营 | 平台概览、租户读写、装企入驻审核、服务商发布、合伙人基础读写、平台线索、图片和 H5 内容、官网内容、用量只读 |
| 供应商运营 | 平台概览、供应商查看/审核/管理、标准目录、OCR 识别和记录查看 |
| 服务交付 | 平台概览、技术服务订单查看、实施工单管理；商品价格和退款审核不默认授予 |
| 财务审核 | 平台概览、计费只读、充值退款查看/审核、技术服务退款审核、品牌与虚拟订单只读、合伙人收入与佣金只读 |
| 技术运维 | 平台概览、设备读写、OCR 策略、AI 路由读写、身份诊断、系统配置只读 |

以下权限默认只授予 `platform_admin`：

- `platform.operator.manage`、`platform.role.manage`；
- `platform.payment.config.manage`；
- `platform.wechat_pay.config.activate`、`platform.wechat_pay.applyment.repair`；
- `platform.supplier.blacklist`；
- `platform.partner.settlement.manage`；
- `platform.system_setting.manage`；
- `platform.ops.execute`。

平台超级管理员不是通过 `system_admin` 的“全部权限快捷逻辑”获得平台能力，而是由 migration 将全部有效 `platform.*` 权限显式绑定到 `platform_admin`。后续新增平台权限时，migration 必须同步补给 `platform_admin`。

## 7. 数据模型与数据库约束

### 7.1 复用现有表

首版复用：

- `employees`：平台人员记录使用 `tenant_id=NULL`；
- `roles`：平台角色使用 `tenant_id=NULL`；
- `permissions`：保存平台权限字典；
- `role_permissions`：平台角色权限；
- `employee_roles`：平台人员角色；
- `employee_permission_overrides`：兼容已有授权计算，但首版平台 UI 不维护；
- `user_auth_events`：登录和身份安全事件；
- `platform_audit_logs`：平台业务和权限变更审计。

不新增 `platform_users` 或 `platform_accounts`，避免复制员工身份、手机号、Supabase Auth 绑定和权限上下文。

### 7.2 员工扩展字段

为支持立即强制退出，在 `employees` 增加：

```text
admin_auth_version integer NOT NULL DEFAULT 1
```

Admin 登录 Token 写入同一版本。平台接口读取当前员工状态与 `admin_auth_version`；状态不是 `active`、租户不为空、版本不一致或未绑定有效平台身份时统一拒绝。

停用、离职、移除平台基础身份、替换人员角色或点击“强制退出”时，原子递增 `admin_auth_version`，并清理当前进程授权缓存。平台角色的权限集合发生变化时，同一事务内递增所有已绑定有效平台人员的版本。这样即使 JWT 尚未到期或其他 API 副本仍有旧权限缓存，也不能继续使用旧授权调用平台接口。

上线会话版本校验后，缺少 `admin_auth_version` claim 的历史平台 Token 统一视为已撤销，现有超级管理员需要重新登录一次；租户 Admin Token 的兼容策略不在本期改变。

### 7.3 手机号冲突保护

Admin 登录目前按手机号查找员工，当同一手机号对应多个员工记录时会拒绝登录。平台人员手机号因此必须在全部员工记录中唯一。

数据库 migration 增加受控触发器：

- 写入或更新平台员工手机号时，对标准化手机号加事务级 advisory lock，并拒绝任何现有同手机号员工；
- 写入或更新租户员工手机号时，同样加锁；如果该手机号已属于平台员工则拒绝；
- 不改变不同租户之间允许相同手机号的现有规则；
- 平台人员创建 service 在调用数据库命令前仍做友好预检，数据库触发器作为并发最终保护。

### 7.4 数据完整性

平台人员和角色写操作通过受控 RPC 原子完成，至少保证：

- 员工、基础角色和业务角色一次成功或一次回滚；
- 角色替换时只能选择 `tenant_id IS NULL` 的有效平台角色；
- 角色权限替换时只能选择有效 `platform.*` 权限；
- 停用或移除超管前锁定有效超管集合并验证不会变为零；
- 并发更新使用 `expected_version`，冲突返回 409；
- 创建和动作接口支持幂等键，重复请求返回第一次结果；
- 不物理删除员工、角色、授权历史或审计记录。

所有数据库变化必须写入 `supabase/migrations/`。不得通过远端控制台或临时 SQL 手工创建平台运营人员、角色或授权。

## 8. 后端边界与接口

### 8.1 分层

```text
controllers/platform-operators
controllers/platform-roles
  只读取请求、执行 Zod 校验、获取平台上下文、调用 service、包装 ResponseHandler.success

services/platform-operators
services/platform-roles
services/platform-authorization
  负责身份边界、权限、最后超管保护、幂等、版本冲突和领域转换

repositories/platform-operators
repositories/platform-roles
  只访问 Supabase、SQL 和受控 RPC
```

所有错误通过 `error-factory.ts` 包装，禁止直接 `throw new Error()`。

### 8.2 平台上下文

`PlatformBaseController` 保留超管入口，同时增加工作人员入口：

```text
getRequiredPlatformStaffContext()
  要求 active 平台员工、有效 Token 版本和 platform_staff/platform_admin 身份

getRequiredPlatformSuperAdminContext()
  在工作人员校验基础上要求 platform_admin
```

业务接口必须在工作人员身份校验后继续调用 `assertPermission(permissionCode)`。旧的 `getRequiredPlatformAdminContext()` 在迁移期只用于尚未拆权限或明确要求超管的接口，不扩大为普通工作人员通行证。

### 8.3 运营人员接口

```http
GET   /platform/operators?page=1&pageSize=20&status=&roleId=&keyword=
POST  /platform/operators
GET   /platform/operators/:id
PATCH /platform/operators/:id
PUT   /platform/operators/:id/roles
POST  /platform/operators/:id/activate
POST  /platform/operators/:id/suspend
POST  /platform/operators/:id/leave
POST  /platform/operators/:id/revoke-sessions
```

列表只返回 `tenant_id IS NULL` 且绑定 `platform_staff` 或 `platform_admin` 的员工，支持姓名/手机号关键词、状态和角色筛选。响应手机号默认脱敏；只有 `platform.operator.manage` 可以在编辑流程读取完整手机号。

创建表单字段固定为：

- 姓名；
- 手机号；
- 业务角色，至少一个；
- 初始状态：`pending` 或 `active`，默认 `pending`。

平台基础角色由后端自动绑定，前端不展示为可取消选项。`pending` 人员不能登录；超管确认启用后才可通过现有短信验证码登录，首次成功登录时创建或绑定 Supabase Auth 用户并记录登录事件。

### 8.4 平台角色接口

```http
GET   /platform/roles?page=1&pageSize=20&status=&keyword=
POST  /platform/roles
GET   /platform/roles/:id
PATCH /platform/roles/:id
PUT   /platform/roles/:id/permissions
POST  /platform/roles/:id/archive
GET   /platform/permissions?page=1&pageSize=100&module=&keyword=
```

角色列表返回人员数量和权限数量。权限目录仅返回 `platform.*` 权限，按模块分组，并明确标记高风险权限。归档角色不影响历史审计，但不能再分配；仍被有效人员使用的角色归档前必须先解除绑定。

### 8.5 错误码

| 错误码 | HTTP | 含义 |
| --- | ---: | --- |
| `PLATFORM_STAFF_REQUIRED` | 403 | 当前身份不是有效平台工作人员 |
| `PLATFORM_SUPER_ADMIN_REQUIRED` | 403 | 当前操作仅平台超管可执行 |
| `PLATFORM_PERMISSION_REQUIRED` | 403 | 缺少指定平台权限 |
| `PLATFORM_OPERATOR_NOT_FOUND` | 404 | 运营人员不存在或不属于平台 |
| `PLATFORM_OPERATOR_PHONE_CONFLICT` | 409 | 手机号已绑定其他员工身份 |
| `PLATFORM_OPERATOR_VERSION_CONFLICT` | 409 | 人员资料或角色已被其他管理员修改 |
| `PLATFORM_LAST_SUPER_ADMIN_REQUIRED` | 409 | 操作会导致平台没有有效超级管理员 |
| `PLATFORM_ROLE_NOT_FOUND` | 404 | 平台角色不存在 |
| `PLATFORM_ROLE_PROTECTED` | 409 | 试图修改受保护角色编码或归档内置基础角色 |
| `PLATFORM_ROLE_IN_USE` | 409 | 角色仍被有效运营人员使用 |
| `PLATFORM_ROLE_PERMISSION_INVALID` | 400 | 角色包含租户权限、无效权限或非 all 范围 |
| `ADMIN_SESSION_REVOKED` | 401 | Token 会话版本已失效，需要重新登录 |

错误响应继续使用现有统一结构，并携带 `requestId`；不得在错误详情中返回完整手机号、Token、支付密钥或权限内部 SQL 信息。

## 9. Admin 信息架构与交互

### 9.1 导航

平台侧新增“账号与权限”分组，放在“平台配置”和“运维”之间：

```text
账号与权限
├── 运营人员
├── 平台角色
└── 平台审计
```

现有“平台审计”从“平台运营”移动到该分组，路由保持 `/platform/audit-logs` 不变。导航文案“平台超管”调整为：

- `platform_admin`：平台超管；
- 普通 `platform_staff`：平台运营；
- 侧栏身份摘要展示主要业务角色，不再把所有平台账号都称为超管。

### 9.2 运营人员页面

路由：`/platform/operators`

列表列：

- 姓名与脱敏手机号；
- 业务角色 Badge；
- 状态；
- 最后登录时间；
- 最近平台操作时间；
- 创建时间；
- 操作。

顶部提供关键词、状态、角色筛选和“新增运营人员”。表格有分页、加载、空状态、错误状态和权限不足状态。

新增/编辑使用一个 Dialog 表单。编辑抽屉或详情 Dialog 展示基础资料、角色、最终有效权限、最近安全事件和最近审计摘要。危险操作使用确认 Dialog：

- 停用账号；
- 标记离职；
- 强制退出；
- 授予或移除平台超管。

操作期间按钮保持固定高度，使用按钮内 Spinner 和稳定状态文本，不通过临时插入块级内容改变 Dialog 或 Card 高度。

### 9.3 平台角色页面

路由：`/platform/roles`

角色列表显示角色名称、编码、类型、状态、人员数量、权限数量和更新时间。角色详情按模块折叠展示权限，使用中文名称为主、编码为辅；高风险权限显示风险标记和影响说明。

新建和编辑角色时：

- 自定义角色编码由后端生成，前端只输入名称和说明；
- 权限按平台菜单模块分组；
- 提供全选当前模块，不提供“一键全选全部平台权限”；
- 保存前展示新增和移除权限摘要；
- 内置角色只允许查看权限模板，`platform_admin` 和 `platform_staff` 不允许通过普通表单改写。

### 9.4 权限一致性

每个平台入口必须形成四层一致授权：

```text
Admin 菜单可见性
→ 页面访问保护
→ 按钮与动作可用性
→ API service 权限校验
```

前端只能使用 `/admin/auth/me` 返回的最终权限集合，不根据角色名称推测权限。后端不能因为菜单隐藏而省略 service 权限检查。

## 10. 登录、停用与会话安全

1. 平台人员继续使用手机号和短信验证码登录，不设置共享密码；
2. `pending`、`suspended`、`leaved` 均不能发送验证码或登录；
3. 登录成功后更新 `employees.last_login_time` 并写 `user_auth_events`；
4. 平台 Admin Token 使用独立过期配置，默认 12 小时，不继续使用通用 7 天默认值；
5. 高风险操作可在后续增加二次短信确认，首版不阻塞上线；
6. 每次平台请求验证员工状态、平台身份和 `admin_auth_version`；
7. 停用、离职、移除平台身份和强制退出均立即递增版本；
8. 授权变化后清理操作者和目标员工授权缓存；
9. 权限被移除后，用户刷新页面得到新菜单；接口侧从授权生效时起立即拒绝；
10. 登录失败、验证码失败、账号停用、会话失效和高风险授权变化写安全事件，但不记录验证码和 Token 原文。

## 11. 审计要求

平台组织相关审计至少包含：

- `platform_operator.create`；
- `platform_operator.update`；
- `platform_operator.roles.replace`；
- `platform_operator.activate`；
- `platform_operator.suspend`；
- `platform_operator.leave`；
- `platform_operator.sessions.revoke`；
- `platform_role.create`；
- `platform_role.update`；
- `platform_role.permissions.replace`；
- `platform_role.archive`。

审计记录必须包含操作者员工 ID、用户 ID、资源 ID、可读标签、结果、摘要、请求 ID、变更前后角色/权限编码集合和时间。手机号只保存脱敏值，禁止记录验证码、JWT、支付密钥、OCR 字段原文或文件签名 URL。

人员、角色、支付配置、退款审核、商户进件修复、供应商黑名单和运维脚本等高风险本地状态写入必须与审计通过同一受控 RPC 原子提交；不能使用 `recordBestEffort` 造成业务成功但审计丢失。调用微信等外部系统时无法与远端请求形成数据库事务，必须先原子写入操作意图和审计，再调用远端，最后原子写入成功或失败结果。普通只读访问和低风险摘要可以保持非阻断日志策略。

## 12. 迁移与兼容策略

按以下安全顺序发布：

1. 新增权限字典、`platform_staff` 和预设角色，不分配真实运营人员；
2. 为 `platform_admin` 显式绑定全部 `platform.*` 权限；
3. 增加授权上下文字段、会话版本和平台工作人员校验，同时保留旧超管入口；
4. 逐模块为现有平台接口补具体权限，先后端、再页面、最后菜单；角色或人员授权变化同步递增受影响人员的 `admin_auth_version`；
5. 增加平台人员和角色 API；
6. 增加 Admin 页面；
7. 在 dev 创建测试运营人员，完成权限矩阵验收；
8. 确认现有唯一超管仍可登录且具有全部平台能力；
9. 再创建真实运营人员并按岗位授权；
10. 最后移除平台员工历史 `system_admin` 绑定，禁止平台侧再次分配。

迁移期间采取“默认拒绝”策略：尚未完成权限拆分的模块继续只允许 `platform_admin`，不得为了快速开放运营人员而把 `platform_staff` 等同于旧 `isPlatformAdmin`。

回滚时可以停用新运营人员并将相关路由恢复为超管专用；不得删除已经产生的平台人员、角色和审计数据。数据库结构采用向前兼容回滚，保留新增字段和权限记录。

## 13. 验收矩阵

### 13.1 身份边界

- 现有平台超管登录、菜单和全部平台操作不受影响；
- 普通运营人员没有 `platform_admin`，但能够进入平台模式；
- 租户员工不能进入平台模式；
- 平台运营人员不能访问租户 `/employees`、`/roles` 和组织页面；
- 平台运营人员不能绑定租户角色，租户员工不能绑定平台角色；
- 平台员工不能绑定 `system_admin`。

### 13.2 权限边界

- 综合运营看不到支付配置、退款审核和运维脚本；
- 供应商运营能审核供应商，但没有黑名单权限时不能执行拉黑；
- 服务交付能维护工单，但不能修改技术服务套餐价格；
- 财务审核能查看和审核已授权退款，但不能读取或修改支付密钥；
- 技术运维能管理设备和 AI 路由，但不能审核退款或结算；
- 手工访问无权限 URL 显示明确的权限不足；
- 直接请求无权限 API 返回 403，不能只依赖前端隐藏。

### 13.3 生命周期与安全

- 新建 `pending` 运营人员不能登录；
- 启用后可以通过短信验证码首次登录；
- 停用、离职或强制退出后，旧 Token 立即返回 `ADMIN_SESSION_REVOKED` 或员工状态错误；
- 修改角色后旧权限立即失效，新权限在刷新会话后正确展示；
- 不能停用最后一名有效超管；
- 同手机号已经绑定任意员工身份时，创建平台人员返回明确冲突；
- 并发修改人员或角色时只有正确 `expected_version` 可以成功。

### 13.4 审计与数据

- 所有人员和角色写操作都有一条对应平台审计；
- 高风险业务写入和审计不存在一边成功、一边失败的状态；
- 审计列表可以按操作、操作者、资源和时间分页查询；
- 审计不包含完整手机号、验证码、Token 或密钥；
- migration 应用后 Local/Remote 对齐；
- 所有新增列表均分页且 `pageSize<=100`；
- 平台列表查询限定字段、范围和索引，不产生 N+1 查询。

## 14. 推荐实施阶段

### 阶段一：权限与身份安全基线

- 新增平台权限目录和角色种子；
- 增加 `isPlatformStaff`、`isPlatformSuperAdmin`；
- 增加平台账号状态与会话版本校验；
- 修复 `system_admin` 对平台员工的边界；
- 补齐平台菜单、页面和 API 权限清单测试。

阶段一完成前不创建真实运营人员。

### 阶段二：平台人员与角色后端

- migration、受控 RPC、repository、service、controller；
- 人员和角色分页查询；
- 创建、编辑、角色替换、状态切换和强制退出；
- 最后超管保护和原子审计。

### 阶段三：Admin 账号与权限页面

- “账号与权限”导航分组；
- 运营人员列表、表单、详情和安全操作；
- 平台角色列表和按模块配置权限；
- Header 身份文案和权限不足状态；
- 同步 loading、empty、error 和骨架屏。

### 阶段四：逐模块开放与 dev 验收

- 按权限矩阵逐个开放平台模块；
- 使用超管、五类运营角色、停用账号和无权限账号进行矩阵测试；
- 验证登录、会话撤销、越权、审计、分页和并发冲突；
- 通过后再创建真实运营人员。

## 15. 最终产品原则

平台账号体系遵循以下固定原则：

1. 身份只说明“是谁”，权限决定“能做什么”；
2. `platform_admin` 是超级权限，不是普通平台登录通行证；
3. 页面不可见、按钮禁用和 API 拒绝必须保持一致；
4. 默认无权限，按岗位授予，敏感权限单独控制；
5. 停用必须立即生效，不能等待 JWT 自然过期；
6. 平台和租户角色永不混用；
7. 高风险写操作必须可追溯，审计不得记录秘密；
8. 首版保持简单，不提前引入区域数据范围和双人审批。
