# 多租户阶段 4H 执行记录：站内通知 MVP

日期：2026-05-10

## 本阶段目标

补齐阶段 4 获客链路的站内通知能力，先覆盖：

- 平台线索分配成功通知租户管理员。
- 员工分享直绑定成功通知租户管理员和分享员工。

短信通知暂不做。

## 已完成

### 1. 数据库

新增 migration：

```text
supabase/migrations/20260510090000_create_notifications.sql
```

新增表：

```text
notifications
```

核心字段：

- `tenant_id`
- `recipient_employee_id`
- `scene`
- `title`
- `content`
- `target_type`
- `target_id`
- `target_url`
- `payload`
- `status`
- `read_at`

### 2. 后端通知能力

新增：

```text
apps/api/src/schema/notifications.ts
apps/api/src/repositories/notifications.ts
apps/api/src/services/notifications.ts
apps/api/src/controllers/notifications/index.ts
```

新增接口：

```text
GET /notifications
GET /notifications/summary
POST /notifications/read
```

### 3. 业务接入

#### 平台线索分配

`POST /platform/leads/:id/assign` 成功后写入：

```text
scene = platform_lead_assigned
```

通知对象：

- 目标租户下拥有 `system_admin` 角色的 active 员工。

#### 员工分享直绑定

`POST /auth/verify-role` 携带 `share_token` 且绑定成功后写入：

```text
scene = employee_share_customer_bound
```

通知对象：

- 目标租户下拥有 `system_admin` 角色的 active 员工。
- 分享员工本人。

## 设计说明

- 通知写入失败不回滚主业务流程。
- 租户管理员 MVP 判定方式：同租户 active 员工 + `system_admin` 角色。
- 短信通知后续统一接入，不在本阶段实现。

## 验证

已执行：

```bash
bun run api:typecheck
bun run api:build
git diff --check
```

通过。
