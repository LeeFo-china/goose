# 租户自定义品牌技术支持后端批次 A 设计

## 1. 目标

在不引入增值商品、付费订单、微信支付或退款语义的前提下，为
平台默认品牌、租户品牌草稿与发布、自定义品牌权益、品牌 Logo
上传和有效品牌解析提供完整后端能力。

批次 A 必须满足：

- 平台品牌、租户品牌、权益和未来付费订单保持独立领域模型。
- 租户接口只信任登录态中的 `tenant_id`。
- 品牌资料只保存可信的 `logo_file_id`。
- 权益、品牌或文件异常时稳定回退平台品牌。
- 超管权益动作原子写入权益事件和平台审计。
- 不修改积分充值订单、积分账户和积分流水语义。

## 2. 范围

### 2.1 本批次包含

- `brand_profiles`
- `tenant_entitlements`
- `tenant_entitlement_events`
- `brand_logo` 上传场景
- 品牌和权益权限初始化
- 平台品牌草稿、发布和读取
- 租户品牌草稿、发布和读取
- 超管授予、暂停、恢复和撤销品牌权益
- `GET /branding/effective`
- API schema、响应示例、测试和联调文档

### 2.2 本批次不包含

- `platform_addon_products`
- `tenant_addon_orders`
- 微信支付下单、回调、查单或补偿
- 购买续费
- 退款申请、退款状态或退款执行
- Admin 页面和 Orange 小程序代码
- 任何积分充值表、积分账户或积分流水变更

## 3. 关键设计决策

### 3.1 单行品牌资料保存草稿和发布快照

每个平台或租户只有一条 `brand_profiles` 记录。草稿字段和发布
快照字段分开保存：

- `display_name`、`logo_file_id`：当前草稿。
- `published_display_name`、`published_logo_file_id`：线上发布快照。
- `version`：草稿乐观锁版本。
- `published_version`：当前线上快照版本。

`PATCH` 只修改草稿并递增 `version`。`publish` 在数据库中原子地将
草稿复制到发布快照，并把 `published_version` 更新为当前
`version`。有效品牌解析只读取发布快照。

这可以保证：

- 第一次发布前，租户品牌不生效。
- 已发布品牌继续生效，不受后续草稿编辑影响。
- `version !== published_version` 表示存在未发布变更。
- 不需要在批次 A 增加完整 revision 表。

`status` 的语义为：

- `draft`：从未发布。
- `published`：存在可用发布快照，可能同时有未发布草稿。
- `disabled`：预留状态，本批次不提供主动禁用接口。

### 3.2 服务端计算自然年

手动授予请求使用 `term_years`，默认 `1`，允许范围为 `1..10`。
数据库使用：

```sql
now() + make_interval(years => p_term_years)
```

计算 `expires_at`。`expires_at` 是数据库必填字段，不接受客户端
直接指定任意时间。

### 3.3 权益动作使用原子数据库命令

授予、暂停、恢复和撤销通过 service-role-only RPC 执行。一次事务
必须同时完成：

1. 锁定目标租户和当前权益行。
2. 校验租户、版本和状态转换。
3. 写入或更新 `tenant_entitlements`。
4. 追加 `tenant_entitlement_events`。
5. 追加 `platform_audit_logs`。
6. 返回最新权益。

任何一步失败都回滚，避免出现“权益已变更但事件或审计缺失”。

### 3.4 不缓存有效品牌

批次 A 的 resolver 不增加服务端缓存。每次读取均实时检查：

- 租户状态。
- 权益状态和时间边界。
- 发布快照。
- Logo 文件状态和归属。

这样暂停、撤销、过期和文件失效可以立即回退，不需要解决缓存
失效和到期边界问题。性能优化可以在有真实负载数据后单独实施。

### 3.5 跨租户资源统一按不存在处理

品牌保存时，如果 `logo_file_id` 不属于当前作用域，统一返回：

```text
404 BRANDING_LOGO_FILE_NOT_FOUND
```

不使用 403 暴露文件在其他租户或平台作用域中存在。

## 4. 数据模型

### 4.1 `brand_profiles`

| 字段 | 类型 | 约束与语义 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `scope` | text | `platform` / `tenant` |
| `tenant_id` | uuid nullable | 平台为空，租户必填 |
| `display_name` | text | 草稿名称，2–40 个 Unicode 字符 |
| `logo_file_id` | uuid | 草稿 Logo |
| `published_display_name` | text nullable | 发布名称快照 |
| `published_logo_file_id` | uuid nullable | 发布 Logo 快照 |
| `status` | text | `draft` / `published` / `disabled` |
| `version` | integer | `> 0` |
| `published_version` | integer nullable | 已发布草稿版本 |
| `published_at` | timestamptz nullable | 最近发布时间 |
| `updated_by_employee_id` | uuid nullable | 最近操作人 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

数据库约束：

- `scope = 'platform'` 时 `tenant_id IS NULL`。
- `scope = 'tenant'` 时 `tenant_id IS NOT NULL`。
- 平台行唯一。
- 每个租户行唯一。
- 发布状态必须有完整发布快照和 `published_version`。
- `published_version <= version`。

### 4.2 `tenant_entitlements`

| 字段 | 类型 | 约束与语义 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `tenant_id` | uuid | 目标租户 |
| `entitlement_code` | text | 本期固定 `custom_support_branding` |
| `status` | text | `active` / `suspended` / `expired` / `revoked` |
| `starts_at` | timestamptz | 生效时间 |
| `expires_at` | timestamptz | 必填，且晚于开始时间 |
| `source_type` | text | `manual_grant` / `purchase` |
| `source_id` | uuid nullable | 批次 A 手动授予为空 |
| `suspended_at` | timestamptz nullable | 暂停时间 |
| `suspend_reason` | text nullable | 暂停原因 |
| `version` | integer | `> 0` |
| `updated_by_employee_id` | uuid nullable | 最近操作人 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

唯一约束：

```text
UNIQUE (tenant_id, entitlement_code)
```

### 4.3 `tenant_entitlement_events`

| 字段 | 类型 | 约束与语义 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `entitlement_id` | uuid | 当前权益 |
| `tenant_id` | uuid | 冗余租户键，便于隔离查询 |
| `entitlement_code` | text | 权益编码快照 |
| `event_type` | text | `granted` / `renewed` / `suspended` / `resumed` / `expired` / `revoked` |
| `source_type` | text | `manual_grant` / `purchase` / `system` |
| `source_id` | uuid nullable | 来源记录 |
| `old_value` | jsonb | 动作前快照 |
| `new_value` | jsonb | 动作后快照 |
| `reason` | text nullable | 动作说明 |
| `actor_employee_id` | uuid nullable | 操作员工 |
| `actor_user_id` | uuid nullable | 操作用户 |
| `created_at` | timestamptz | 事件时间 |

事件表只追加，不更新和删除。批次 B 再为支付来源增加幂等唯一约束。

### 4.4 过期整理

有效性始终按时间实时计算，不依赖整理任务：

```text
status = active
starts_at <= now
expires_at > now
tenant.status = active
```

读取到数据库仍为 `active` 但已经到期的权益时，服务调用原子
`expire` RPC，将状态整理为 `expired` 并追加一次 `expired` 事件。
即使整理失败，resolver 仍按时间判断为无效并回退平台品牌。

## 5. 权益状态机

### 5.1 grant

- 不存在：创建一年或指定自然年数的 active 权益。
- `expired` / `revoked`：从当前时间重新授予，重置开始和到期时间。
- `active`：返回 409，避免误把手动授予当作续费。
- `suspended`：返回 409，要求明确调用 resume。

### 5.2 suspend

- 只允许未过期的 `active` 权益。
- `reason` 必填。
- 保存 `suspended_at` 和 `suspend_reason`。
- 不修改 `starts_at`、`expires_at`。

### 5.3 resume

- 只允许 `suspended`。
- `reason` 必填，用于事件和审计。
- 如果原 `expires_at <= now`，先整理为 expired，然后返回 409。
- 清空暂停字段。
- 不延长 `expires_at`。

### 5.4 revoke

- 允许 `active` 或 `suspended`。
- `reason` 必填。
- 请求必须包含 `confirm: true`。
- 保留原开始和到期时间，状态改为 `revoked`。

## 6. 品牌 Logo 上传

### 6.1 上传授权

`brand_logo` 使用现有 COS 直传初始化和完成接口。

平台上传：

- 必须是平台管理员。
- 必须拥有 `platform.branding.manage`。
- 生成 `public/brand-logo/...`。
- 文件 `tenant_id IS NULL`。

租户上传：

- 必须是员工登录态。
- 必须拥有 `brand.settings.update`。
- 必须拥有有效 `custom_support_branding` 权益。
- 生成 `tenants/{AuthContext.tenantId}/brand-logo/...`。
- 不接受客户端传 `tenant_id`。

客户和 visitor 不能使用该场景。

### 6.2 实际文件验证

初始化阶段校验客户端声明：

- MIME：`image/jpeg`、`image/png`、`image/webp`。
- 大小：`1..2MB`。

完成阶段由服务端读取实际上传对象，并校验：

- 实际文件不超过 2MB。
- 文件 magic bytes 与受支持格式一致。
- 实际 MIME 与声明一致。
- 宽、高均至少 128。
- 宽高比在 `0.8..1.25`。

验证通过后才创建 active `platform_file_objects` 记录，并记录实际
`width`、`height` 和规范 MIME。验证失败不创建可绑定文件记录。

### 6.3 品牌保存时二次校验

平台品牌 Logo 必须：

- `tenant_id IS NULL`
- `scene = brand_logo`
- `status = active`
- `visibility = public`
- MIME 属于允许集合
- 尺寸和比例合法

租户品牌除上述条件外，还必须：

```text
file.tenant_id = AuthContext.tenantId
```

替换草稿或发布 Logo 后，旧文件不立即物理删除。品牌 RPC 在旧文件
不再被草稿或发布快照引用时，将其 metadata 标记为 branding
unreferenced，供后续延迟清理任务处理。

## 7. API 契约

所有 JSON 成功响应继续使用：

```json
{
  "data": {},
  "message": "success"
}
```

### 7.1 有效品牌

```http
GET /branding/effective
```

- 公共可读；携带合法 token 时使用 token 的当前租户上下文。
- 员工和客户 token 的 `tenant_id` 必须由认证插件验证。
- visitor、无 token、无租户上下文返回平台品牌。
- 使用严格空 query schema，拒绝 `tenant_id` 等参数。
- 不返回商品、订单、操作人、暂停原因或购买历史。
- 批次 A 返回 `Cache-Control: private, no-store`。

响应 data：

```json
{
  "source": "tenant",
  "tenant_id": "00000000-0000-4000-8000-000000000001",
  "display_name": "晴天装饰",
  "logo_url": "https://cdn.example.com/tenant-logo.png",
  "support_text": "晴天装饰提供技术支持",
  "version": 4,
  "updated_at": "2026-07-27T10:00:00.000Z"
}
```

解析顺序：

1. 解析有效的平台发布快照；异常时使用代码默认。
2. 无租户上下文时返回平台品牌。
3. 租户不存在或非 active 时返回平台品牌。
4. 没有有效权益时返回平台品牌。
5. 租户没有完整发布快照时返回平台品牌。
6. 租户发布 Logo 文件异常时返回平台品牌。
7. 其余返回租户品牌。

### 7.2 平台品牌

```http
GET /platform/branding
PATCH /platform/branding
POST /platform/branding/publish
```

权限：

```text
platform admin + platform.branding.manage
```

PATCH body：

```json
{
  "display_name": "字节跳动",
  "logo_file_id": "00000000-0000-4000-8000-000000000010",
  "version": 3
}
```

第一次创建使用 `version: 0`。publish body：

```json
{
  "version": 4
}
```

GET/PATCH/publish 返回：

```json
{
  "profile": {
    "display_name": "字节跳动",
    "logo_file_id": "00000000-0000-4000-8000-000000000010",
    "logo_url": "https://cdn.example.com/platform-logo.png",
    "status": "published",
    "version": 4,
    "published_version": 4,
    "has_unpublished_changes": false,
    "published_at": "2026-07-27T10:00:00.000Z",
    "updated_at": "2026-07-27T10:00:00.000Z"
  },
  "effective": {
    "source": "platform",
    "tenant_id": null,
    "display_name": "字节跳动",
    "logo_url": "https://cdn.example.com/platform-logo.png",
    "support_text": "字节跳动提供技术支持",
    "version": 4,
    "updated_at": "2026-07-27T10:00:00.000Z"
  }
}
```

### 7.3 平台租户权益

```http
GET /platform/tenants/:id/entitlements?page=1&pageSize=20
POST /platform/tenants/:id/entitlements/custom_support_branding/grant
POST /platform/tenants/:id/entitlements/custom_support_branding/suspend
POST /platform/tenants/:id/entitlements/custom_support_branding/resume
POST /platform/tenants/:id/entitlements/custom_support_branding/revoke
```

权限：

```text
platform admin + platform.tenant_entitlement.manage
```

grant：

```json
{
  "term_years": 1,
  "reason": "平台赠送一年品牌权益"
}
```

suspend：

```json
{
  "version": 2,
  "reason": "品牌内容待核验"
}
```

resume：

```json
{
  "version": 3,
  "reason": "品牌内容已核验"
}
```

revoke：

```json
{
  "version": 4,
  "reason": "租户主动终止服务",
  "confirm": true
}
```

动作响应统一返回：

```json
{
  "entitlement": {
    "id": "00000000-0000-4000-8000-000000000020",
    "tenant_id": "00000000-0000-4000-8000-000000000001",
    "code": "custom_support_branding",
    "status": "active",
    "starts_at": "2026-07-27T10:00:00.000Z",
    "expires_at": "2027-07-27T10:00:00.000Z",
    "source_type": "manual_grant",
    "source_id": null,
    "suspended_at": null,
    "suspend_reason": null,
    "version": 1,
    "updated_at": "2026-07-27T10:00:00.000Z"
  }
}
```

GET 返回分页 `list` 和 `pagination`。

### 7.4 租户品牌

```http
GET /tenant/branding
PATCH /tenant/branding
POST /tenant/branding/publish
```

- GET：`brand.settings.read`。
- PATCH/publish：`brand.settings.update` 和有效权益。
- 租户 ID 始终来自员工 AuthContext。
- PATCH 和 publish body 与平台品牌相同。

返回：

```json
{
  "profile": null,
  "entitlement": {
    "code": "custom_support_branding",
    "status": "active",
    "expires_at": "2027-07-27T10:00:00.000Z",
    "version": 1
  },
  "can_customize": true,
  "effective": {
    "source": "platform",
    "tenant_id": null,
    "display_name": "字节跳动",
    "logo_url": "https://cdn.example.com/platform-logo.png",
    "support_text": "字节跳动提供技术支持",
    "version": 3,
    "updated_at": "2026-07-27T09:00:00.000Z"
  }
}
```

无 profile 或 entitlement 时明确返回 `null`，不省略字段。

## 8. 错误码

| HTTP | code | 场景 |
| --- | --- | --- |
| 403 | `BRANDING_ENTITLEMENT_REQUIRED` | 无品牌权益 |
| 403 | `BRANDING_ENTITLEMENT_SUSPENDED` | 权益暂停 |
| 403 | `BRANDING_ENTITLEMENT_EXPIRED` | 权益过期 |
| 403 | `BRANDING_ENTITLEMENT_REVOKED` | 权益撤销 |
| 409 | `BRANDING_PROFILE_VERSION_CONFLICT` | 品牌草稿版本冲突 |
| 409 | `TENANT_ENTITLEMENT_VERSION_CONFLICT` | 权益版本冲突 |
| 409 | `TENANT_ENTITLEMENT_STATE_CONFLICT` | 非法权益状态转换 |
| 404 | `TENANT_ENTITLEMENT_NOT_FOUND` | 权益不存在 |
| 404 | `BRANDING_LOGO_FILE_NOT_FOUND` | Logo 不存在或不属于当前作用域 |
| 400 | `BRANDING_LOGO_FILE_INVALID` | Logo scene、状态、可见性、MIME 或尺寸错误 |
| 400 | `BRANDING_PROFILE_INCOMPLETE` | 发布草稿不完整 |

Zod 请求格式错误继续使用项目统一 `VALIDATION_ERROR`。

## 9. 权限初始化

批次 A 只新增：

```text
platform.branding.manage
platform.tenant_entitlement.manage
brand.settings.read
brand.settings.update
```

默认角色：

- 平台 `platform_admin`：两个平台权限。
- 每个租户 `system_admin`：品牌读写权限。
- 普通员工：默认不授予。

`GET /branding/effective` 不要求业务权限，只使用合法认证上下文。

## 10. 代码分层

### Controller

- 读取 request。
- 调用 Zod schema。
- 获取平台或租户 AuthContext。
- 调 service。
- 使用 `ResponseHandler.success`。
- 不直接访问 Supabase。

### Service

- 权限和权益校验。
- 品牌 resolver 编排。
- 状态转换映射。
- 错误码转换。
- Logo 二次校验。

### Repository / RPC

- 精确选择必要字段。
- 所有租户查询显式绑定 `tenant_id`。
- 原子品牌保存和发布。
- 原子权益动作、事件和审计。
- 文件记录读取和延迟清理标记。

## 11. 安全边界

- 所有新表启用 RLS。
- 不授予 anon/authenticated 直接写权限。
- 新 mutation RPC 撤销 public/anon/authenticated，只有 service_role 可执行。
- API 使用 service role 时仍在 repository 中显式限定 tenant。
- 公开有效品牌接口只返回发布展示字段。
- 不记录 token、手机号、密钥或支付信息。
- 平台默认 Logo 使用服务端受控资产，不接受客户端 URL。

## 12. 测试策略

### 12.1 单元测试

- platform/tenant 品牌 schema。
- 名称字符、控制字符和纯标点校验。
- grant 的自然年计算契约。
- 闰日和月末 PostgreSQL 日期语义。
- 权益 active/suspended/expired/revoked 判定。
- 权益状态机和版本冲突。
- resume 不延长到期时间。
- Logo MIME、大小、尺寸和宽高比。
- Logo scene/status/visibility/tenant 归属。
- 草稿不影响发布快照。
- 无租户上下文回退平台。
- 无权益、暂停、过期、撤销回退平台。
- 租户非 active、未发布和文件异常回退平台。
- 路由公开/受保护边界。

### 12.2 Migration 契约测试

- 表、约束、索引和 RLS。
- 权限和默认角色初始化。
- RPC 行锁、乐观锁、事件和审计原子写入。
- RPC service-role-only 权限。
- migration 不引用积分充值表。

### 12.3 租户隔离

- A 租户不能绑定 B 租户 Logo。
- 租户接口忽略不了登录态，也不接受 tenant_id。
- A 租户不能读写 B 租户品牌。
- 平台文件不能被租户绑定。
- 租户文件不能被平台品牌绑定。
- 客户和 visitor 不能上传品牌 Logo。

### 12.4 回归

- Domain 权限测试。
- API typecheck、build、文件大小检查。
- 定向 API tests。
- 仓库 stable tests；既有基线失败单独记录。
- dev migration 状态和 API smoke。

## 13. 部署与联调

批次 A 在 dev 环境执行：

1. 应用 migration。
2. 验证 Local/Remote migration 对齐。
3. 部署 API。
4. 上传并发布平台默认品牌。
5. 创建或选取两个 dev 租户：
   - 一个 active entitlement 租户。
   - 一个无 entitlement 租户。
6. 为两个租户准备 system_admin 联调账号或短期 token。
7. smoke 全部批次 A endpoint。
8. 记录 API base URL、commit SHA、租户和凭证有效期。

凭证不写入仓库或公开文档，只在最终交付消息中安全提供。

## 14. Orange 交接边界

本批次只读检查 Orange 契约和现有组件，不修改 Orange。

后端通过后，小程序团队再实现：

- branding service。
- branding store。
- `BrandAttribution` 默认读取。
- 品牌设置页。
- 身份和租户切换清理。

批次 B 才开始年度微信支付商品和订单。
