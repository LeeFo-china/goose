# 腾讯云 OCR 租户灰度策略设计

日期：2026-07-23  
状态：已确认，进入实现  
范围：gooes API、平台超管 Admin、Supabase migration

## 1. 结论

OCR 上线采用“平台总开关 + 租户灰度策略 + 员工业务权限”三层门禁：

1. `TENCENT_OCR_ENABLED` 继续作为平台总熔断，关闭时所有租户均不可调用。
2. 新增平台维护的租户灰度策略。没有策略记录或策略未启用的租户默认不可调用。
3. 租户启用后，只能使用策略明确允许的文档类型，并继续校验 `ocr.recognize` 和业务权限。
4. 平台超管配置测试用于验证腾讯云配置，不受租户灰度策略影响，也不产生租户识别记录。
5. 本期只允许平台超管维护策略，不开放租户 Admin 自助开启，不自动迁移或开启任何现有租户。

该设计解决全局 OCR 开关开启后所有有权限租户同时获得真实计费能力的问题，并为单租户生产
Smoke、逐批放量和紧急回滚提供明确控制面。

## 2. 生效判定

租户 OCR 能力的有效状态为：

```text
effective_enabled = platform_master_enabled
  AND tenant_policy.enabled
  AND document_type IN tenant_policy.allowed_document_types
  AND result_encryption_ready
  AND employee_has_ocr_permission
  AND employee_has_business_permission
```

判定顺序遵循“先低成本门禁、后文件和供应商调用”：

1. 认证和租户上下文。
2. 员工权限。
3. 平台总开关。
4. 租户策略及文档类型。
5. 结果加密配置。
6. 文件、业务对象、幂等、去重和日额度。
7. 腾讯云调用。

`GET /ocr/capabilities` 只返回当前租户策略允许且平台配置完整的能力。未启用租户返回空数组。
`POST /ocr/recognitions` 对未启用租户返回稳定的 `OCR_TENANT_NOT_ENABLED`，对未授权文档类型
返回 `OCR_CAPABILITY_UNAVAILABLE`，两种情况都不得读取文件或调用腾讯云。

## 3. 数据模型

新增 `public.ocr_tenant_policies`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tenant_id` | `uuid` PK | 租户，一租户一条策略 |
| `enabled` | `boolean` | 是否进入灰度，默认 `false` |
| `allowed_document_types` | `text[]` | 允许的 Phase 1 文档类型 |
| `daily_limit` | `integer null` | 租户日额度覆盖；空值使用平台默认值 |
| `remark` | `text null` | 平台运营备注，最多 500 字 |
| `enabled_at` | `timestamptz null` | 最近一次启用时间 |
| `updated_by_employee_id` | `uuid null` | 最近操作的平台员工 |
| `created_at` / `updated_at` | `timestamptz` | 审计时间 |

数据库约束：

- 文档类型只能为 `business_license`、`id_card_front`、`id_card_back`、`bank_card`。
- `daily_limit` 为空或在 `1..10000` 之间。
- 启用策略时允许文档类型不能为空。
- 表启用并强制 RLS，不提供客户端策略，只允许后端 service-role 访问。
- 启用状态和更新时间建立索引；删除租户时级联删除策略。

新增只读视图 `platform_ocr_tenant_policy_overview`，从 `tenants` 左连接策略表，使尚未配置策略的
租户也能在平台列表中显示为“未启用”。视图只包含租户基本信息和策略字段，不包含联系人、证照
或其他敏感资料。

## 4. API 契约

### 4.1 平台分页列表

```http
GET /platform/ocr/tenant-policies?page=1&pageSize=20&keyword=晴天&enabled=true
Authorization: Bearer <platform-admin-token>
```

响应：

```json
{
  "list": [
    {
      "tenant_id": "uuid",
      "tenant_name": "固始晴天装饰工程有限公司",
      "tenant_slug": "tenant-slug",
      "tenant_status": "active",
      "enabled": true,
      "allowed_document_types": ["business_license", "id_card_front", "id_card_back", "bank_card"],
      "daily_limit": 20,
      "remark": "首批支付进件灰度",
      "enabled_at": "2026-07-23T00:00:00.000Z",
      "updated_by_employee_id": "uuid",
      "updated_at": "2026-07-23T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

`pageSize` 默认 20，最大 100；`keyword` 最多 80 字；`enabled` 为可选布尔值。搜索和筛选在
数据库执行，`pagination.total` 必须对应完整筛选结果。

### 4.2 保存租户策略

```http
PUT /platform/ocr/tenant-policies/:tenantId
Authorization: Bearer <platform-admin-token>
Content-Type: application/json

{
  "enabled": true,
  "allowed_document_types": ["business_license", "id_card_front", "id_card_back", "bank_card"],
  "daily_limit": 20,
  "remark": "首批支付进件灰度"
}
```

保存前确认租户存在。`enabled=true` 时至少选择一种文档类型；`enabled=false` 时保留能力和额度
配置，便于后续重新启用。每次保存都写 `platform_audit_logs`，记录目标租户、前后 enabled、
文档类型、额度和备注是否变化，但不记录任何 OCR 结果或证照内容。

平台读取使用 `platform.ocr.recognition.read`，策略写入使用新增权限
`platform.ocr.tenant_policy.manage`。该权限通过 migration 分配给平台 `platform_admin` 角色。

## 5. 运行时与额度

- `daily_limit=null` 时读取 `TENCENT_OCR_DEFAULT_TENANT_DAILY_LIMIT`。
- 租户额度只覆盖每日调用上限，不覆盖平台凭证、endpoint、区域、超时或结果保留时间。
- 额度仍按 `tenant_id + UTC day` 统计；幂等命中和有效去重缓存不重复计费。
- 平台总开关关闭后，租户策略仍保留，但有效状态为关闭。
- 租户被停用或归档时，现有认证层继续阻断员工访问；策略本身不自动删除或改写。

## 6. 平台 Admin

`/platform/ocr` 增加“调用记录”和“租户灰度”两个视图：

- 调用记录保持现有服务端分页和安全字段投影。
- 租户灰度使用服务端分页，支持租户名称/标识搜索和启用状态筛选。
- 表格展示租户、状态、允许能力、日额度、启用时间和更新时间。
- 编辑对话框使用现有 shadcn `Dialog`、`FieldGroup`、`Switch`、`Checkbox`、`Input`、
  `Textarea`、`Button`，不使用原生表单控件。
- 页面固定提示：平台总开关关闭时，所有租户策略均不生效。
- 保存后刷新服务端数据；失败时保留表单内容并展示后端错误。

租户 Admin 和小程序本期不新增策略管理 UI。它们继续只消费 `/ocr/capabilities`；返回空数组即
不展示识别入口，不本地推断是否处于灰度。

## 7. 发布与回滚

发布顺序：

1. 应用 migration，确认 Local/Remote migration 对齐。
2. 部署 API 和 Admin，保持 `TENCENT_OCR_ENABLED=false`。
3. 完成 CAM control-plane 策略绑定回读。
4. 在平台 Admin 为一个测试租户配置策略。
5. 开启平台总开关，仅对该租户执行真实小额/低频 OCR Smoke。
6. 核对腾讯云 RequestId、加密结果、调用审计、额度和清理任务后再逐批放量。

紧急回滚优先关闭平台总开关，立即阻断全部新调用；数据库策略和识别审计保留。若只需隔离单个
租户，则关闭该租户策略。代码回滚前不删除策略表，避免丢失控制面和审计记录。

## 8. 验收标准

1. migration 创建策略表、只读视图、约束、索引、RLS 和平台管理权限。
2. 未配置策略的租户能力列表为空，识别请求在文件读取前被拒绝。
3. 已启用租户只看到允许文档类型，禁用类型不能调用供应商。
4. 租户额度覆盖生效，空值回退平台默认额度。
5. 平台配置测试仍可独立验证腾讯云配置。
6. 平台列表分页、搜索、筛选和 total 正确，不发生 N+1 查询。
7. 平台策略变更写入审计日志。
8. Admin 使用现有 shadcn 组件完成编辑、校验、保存、错误和空状态。
9. API、Admin、domain 定向测试、类型检查、构建和 migration 静态检查通过。
10. OCR 总开关在本次实现和验证结束后仍保持关闭。
