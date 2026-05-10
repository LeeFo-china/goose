# Admin 对接执行记录：通知入口与客户来源时间线

日期：2026-05-10

## 背景

依据 `docs/2026-05-10-admin-integration-execution-plan-from-application-docs.md` 的推荐顺序，本次先落地第二批中对租户运营最直接的 admin 能力：

- 客户列表来源 tag。
- 客户详情来源摘要。
- 客户详情来源时间线。
- 顶部站内通知入口。

阶段 5.9 真实账号回归仍需要生产环境人工登录执行，不能用本次代码改动替代。

## 已完成

### 1. 客户列表来源 tag

页面：

```text
/customers
```

改动：

- 客户列表“来源”列增加来源标记展示：
  - 老客户新线索
  - 平台新线索
  - 员工分享
- 标记来自后端 `GET /customers` 返回的：
  - `has_old_customer_new_lead`
  - `has_platform_new_lead`
  - `has_employee_share`

### 2. 客户详情来源摘要

入口：

```text
客户列表 -> 详情
```

改动：

- 详情弹窗增加“线索来源”摘要区。
- 展示：
  - 最近来源
  - 来源时间
  - 来源总数
  - 来源 tag

数据来自：

```text
GET /customers/:id/detail
```

### 3. 客户详情来源时间线

接口：

```http
GET /customers/:id/sources?page=1&pageSize=20
```

改动：

- 详情弹窗新增“来源时间线”区域。
- 展示每条来源：
  - 来源名称
  - 时间
  - 老客户新线索 / 平台新线索 / 员工分享 tag
  - 操作人
  - 去重结果
  - 平台线索信息

### 4. 顶部站内通知入口

位置：

```text
admin 顶部栏
```

接口：

```http
GET /notifications/summary
GET /notifications?page=1&pageSize=8
POST /notifications/read
```

改动：

- 顶部栏新增通知按钮。
- 显示未读数量。
- 点击后展示最近通知。
- 支持单条点击后标记已读。
- 支持全部已读。

当前支持后端场景：

| scene | 含义 |
| --- | --- |
| `platform_lead_assigned` | 平台线索分配成功 |
| `employee_share_customer_bound` | 员工分享绑定客户成功 |

## 修改文件

```text
apps/admin/components/customers/customer-mutations.tsx
apps/admin/components/customers/customers-table.tsx
apps/admin/components/layout/admin-shell.tsx
apps/admin/components/layout/notification-menu.tsx
```

## 验证

已执行：

```bash
bun run api:typecheck
pnpm --dir apps/admin build
```

结果：

```text
通过
```

## 待人工回归

生产部署后建议执行：

1. 用租户管理员账号登录 admin。
2. 打开客户列表，确认平台分配和员工分享产生的客户显示来源 tag。
3. 打开客户详情，确认来源摘要和来源时间线正常。
4. 由平台超管分配一条平台线索给该租户。
5. 确认租户管理员顶部通知出现未读数。
6. 打开通知下拉，确认能看到“平台分配新线索”。
7. 点击通知后确认标记已读。

## 未完成项

以下仍在总方案后续批次内：

- 阶段 5.9 真实账号完整人工回归。
- 自媒体脚本页面用量摘要。
- 平台 AI Provider / Model / Scene Route 配置页。
