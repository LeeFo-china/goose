# 多租户阶段 0 直接查询风险扫描

日期：2026-05-09

## 扫描命令

已新增脚本：

```bash
scripts/audit-tenant-scope.sh
```

脚本扫描范围：

```text
apps/api/src
```

核心匹配表：

- `customers`
- `projects`
- `employees`
- `project_logs`
- `expense_requests`

## 风险结论

当前有大量 controller/service/repository 直接访问核心业务表。阶段 2 不能只在少量接口补 `.eq("tenant_id")`，需要逐步把核心查询收敛到 repository，强制传入 `tenantId`。

## 高风险区域

| 区域 | 风险 | 建议 |
| --- | --- | --- |
| `apps/api/src/controllers/customer/index.ts` | 客户接口大量直接查 `customers` | 阶段 2 优先重构 |
| `apps/api/src/controllers/projects/index.ts` | 项目列表、详情、统计直接查 `projects/project-logs/customers/employees` | 阶段 2 优先重构 |
| `apps/api/src/controllers/wechat/index.ts` | 小程序登录匹配客户/员工 | 阶段 2 必须加入租户选择态和平台访客态 |
| `apps/api/src/controllers/customer-self-service/index.ts` | 客户侧项目/日志查询 | 阶段 2-3 加客户租户上下文 |
| `apps/api/src/services/customer-project-log-shares.ts` | 分享链路跨项目、客户、日志 | 阶段 3-4 处理 |
| `apps/api/src/repositories/permissions.ts` | 员工、项目、客户可见范围 | 阶段 2 处理 |
| `apps/api/src/repositories/expense-requests.ts` | 费用审批 | 阶段 3 处理 |
| `apps/api/src/repositories/project-acceptances.ts` | 工序验收 | 阶段 3 处理 |
| `apps/api/src/repositories/marketing-pages.ts` | H5 页面、线索转换 | 阶段 4 处理 |

## 第一批必须处理的查询

阶段 2 必须优先处理：

- 客户列表和详情。
- 项目列表和详情。
- 员工列表和详情。
- 小程序登录身份匹配。
- admin 登录后的员工权限上下文。

## 查询改造规则

### 普通租户业务查询

必须满足：

```text
where tenant_id = authContext.tenantId
```

### 通过关联表查询

如果子表暂未直接带 `tenant_id`，必须通过父表校验：

```text
child -> project/customer/employee -> tenant_id
```

### 平台级查询

只能走：

```text
/platform/*
```

且必须校验平台超管。

### 禁止模式

```ts
SupabaseDB.from("customers").select("*")
```

除非紧跟租户过滤或平台超管显式绕过。

## 后续要求

- 新增业务查询必须说明租户边界。
- 新增业务表必须说明是否带 `tenant_id`。
- 阶段 2 完成前，`scripts/audit-tenant-scope.sh` 输出必须逐项确认。

