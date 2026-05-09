# 多租户阶段 4E 执行记录：平台公海线索与手动分配

日期：2026-05-09

## 本阶段目标

落地平台访客提交装修需求后的公海线索能力，并支持平台超管手动分配给目标租户。

## 已完成

### 1. 数据库

新增 migration：

```text
supabase/migrations/20260509210000_create_platform_leads.sql
```

包含：

- `platform_leads`：平台级公海线索，不带业务 `tenant_id`。
- `platform_lead_assign_logs`：平台线索分配审计日志。
- `customer_sources`：租户客户来源时间线。
- `assign_platform_lead()`：平台线索原子化分配 RPC。

分配 RPC 做了以下事情：

1. 锁定 `platform_leads` 当前行。
2. 校验目标租户存在且 `status = active`。
3. 如果线索已分配给同一租户，幂等返回。
4. 如果线索已分配给其他租户，返回业务冲突。
5. 按 `customers.tenant_id + customers.phone` 在目标租户下查重。
6. 老客户命中时不创建新客户。
7. 未命中时创建新客户，`source = platform_assigned`。
8. 写入 `customer_sources`。
9. 更新 `platform_leads.assigned_*` 字段。
10. 写入 `platform_lead_assign_logs`。

### 2. 后端接口

新增：

```text
POST /platform/leads
GET /platform/leads
GET /platform/leads/:id
POST /platform/leads/:id/assign
```

实现文件：

```text
apps/api/src/schema/platform-leads.ts
apps/api/src/repositories/platform-leads.ts
apps/api/src/services/platform-leads.ts
apps/api/src/controllers/platform-leads/index.ts
apps/api/src/routes/index.ts
```

### 3. 鉴权边界

- `POST /platform/leads`：要求登录态中带 `verified_phone`，提交手机号必须与登录手机号一致。
- `GET /platform/leads`：仅 `platform_admin` 可用。
- `GET /platform/leads/:id`：仅 `platform_admin` 可用。
- `POST /platform/leads/:id/assign`：仅 `platform_admin` 可用，且操作人必须是员工。

## 业务结果

平台访客提交需求后：

- 后端创建 `platform_leads`。
- 状态为 `new`。
- 不直接进入任意租户客户表。

平台超管分配后：

- `platform_leads.status = assigned`。
- 同租户手机号已存在：关联旧客户，来源时间线追加“平台分配线索”。
- 同租户手机号不存在：创建新客户，来源为 `platform_assigned`。
- 重复分配给同一租户：幂等返回 `already_assigned`。

## 未完成项

本阶段没有实现通知发送，因为当前后端还没有统一站内信/短信通知基础设施。

后续建议在阶段 5 平台后台或通知模块中补：

- `notifications` 表或现有通知表对接。
- 分配成功后通知目标租户管理员。
- 租户短信配置可用时发送短信。

## 验证

已执行：

```bash
bun run api:typecheck
```

通过。
