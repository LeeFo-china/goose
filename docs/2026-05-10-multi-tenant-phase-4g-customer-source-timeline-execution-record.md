# 多租户阶段 4G 执行记录：客户来源时间线

日期：2026-05-10

## 本阶段目标

让租户 admin 能在客户列表和客户详情中识别客户后续来源触达，尤其是：

- 平台分配线索
- 老客户新线索
- 员工分享直绑定

## 已完成

### 1. 后端服务

新增：

```text
apps/api/src/schema/customer-sources.ts
apps/api/src/repositories/customer-sources.ts
apps/api/src/services/customer-sources.ts
```

能力：

- 查询单个客户来源时间线。
- 对客户列表批量生成来源摘要。
- 补全来源关联信息：
  - 分享员工
  - 分配操作人
  - 平台线索
  - 员工分享链接

### 2. 客户接口

新增：

```text
GET /customers/:id/sources
```

客户列表和客户详情响应新增轻量摘要字段：

```text
source_summary
latest_source
source_tags
has_old_customer_new_lead
has_platform_new_lead
has_employee_share
```

### 3. 领域枚举

更新 `@gooes/domain` 客户来源枚举，补充：

```text
platform_lead
platform_assigned
employee_share
h5_campaign
quote_form
miniprogram_qrcode
```

## 未完成项

本阶段没有做“按来源标记筛选”，原因是 UI 筛选项和产品命名还需要确认。

建议后续单独补：

- `source_tag=old_customer_new_lead`
- `source_tag=platform_new_lead`
- `source_tag=employee_share`

## 验证

已执行：

```bash
bun run api:typecheck
bun run api:build
git diff --check
```

通过。
