# Phase 8.1 结账快照差异与审计闭环 Smoke

日期：2026-06-30

分支：`feat/phase8-snapshot-diff-audit`

## 目标

本轮补齐 Phase 8 中结账快照和后续人工修正之间的追溯闭环：

- `GET /finance/reports/monthly-overview` 返回实时摘要、结账快照摘要、差异摘要和差异标记。
- Admin 财务报表展示“快照毛利 / 实时毛利 / 快照差异”，并能从月度报表跳转到当月修正审计。
- `GET /finance/correction-audits` 支持 `month=YYYY-MM` 语义筛选，后端展开为整月日期范围。
- 小程序端本轮无必改，继续不消费财务报表结账和审计页面。

## 后端契约

### 月度总览 closing 新增字段

接口：

`GET /finance/reports/monthly-overview?month=2026-06`

`closing` 新增：

- `current_summary`：当前实时口径的月度摘要。没有结账快照时返回 `null`。
- `snapshot_summary`：结账固化快照摘要。
- `difference_summary`：实时摘要减快照摘要的差异。没有结账快照时返回 `null`。
- `has_snapshot_difference`：是否存在非零差异。

未结账月份仍返回：

- `closing.status=not_started`
- `snapshot_summary=null`
- `current_summary=null`
- `difference_summary=null`
- `has_snapshot_difference=false`

### 修正审计 month 筛选

接口：

`GET /finance/correction-audits?page=1&pageSize=5&month=2026-06`

后端处理：

- 校验 `month` 格式必须为 `YYYY-MM`。
- 当请求未显式传 `date_from/date_to` 时，展开为当月完整范围。
- `month=2026-06` 等价默认范围为 `date_from=2026-06-01`、`date_to=2026-06-30`。
- 如果请求同时传了 `date_from/date_to`，显式日期优先。

## Admin 对接

### 财务报表页

页面：

`/finance/reports?month=2026-06`

新增展示：

- 快照毛利
- 实时毛利和实时毛利率
- 快照差异 badge：
  - `has_snapshot_difference=true` 显示“数据已变化”
  - `has_snapshot_difference=false` 显示“快照一致”
- 差异摘要：
  - 毛利差异
  - 收入差异
  - 支出差异
- “查看修正审计”入口，跳转到：

`/finance/audits?page=1&pageSize=20&month=2026-06`

### 修正审计页

页面：

`/finance/audits?month=2026-06`

新增：

- 月份筛选字段。
- 翻页保留 `month` 参数。
- 继续支持起止日期、项目 ID、修正类型、操作人筛选。

## 临时服务 smoke

本轮 smoke 使用 worktree 临时端口，未占用 main 工作区服务：

- API：`http://127.0.0.1:3308`
- Admin：`http://127.0.0.1:3310`
- API env：读取主仓库 `apps/api/.env` 和 `.env.local`
- Admin env：`GOOES_API_BASE_URL=http://127.0.0.1:3308`

### API 只读 smoke

账号：

- `18800000001 / 风清扬`
- 租户：固始晴天装饰工程有限公司

结果：

1. `POST /admin/auth/login`
   - 返回 `200`
   - 已取得 token

2. `GET /finance/reports/monthly-overview?month=2026-06`
   - 返回 `200`
   - `scope.month=2026-06`
   - `closing.status=not_started`
   - `closing.current_summary` 字段存在
   - `closing.difference_summary` 字段存在
   - `closing.has_snapshot_difference=false`

3. `GET /finance/correction-audits?page=1&pageSize=5&month=2026-06`
   - 返回 `200`
   - `pagination.total=8`
   - `pagination.pageSize=5`
   - `summary.total=8`
   - `summary.ledger_repair=4`
   - `summary.receivable_allocation=4`

### Admin 页面 smoke

账号：

- `18800000001 / 风清扬`

结果：

1. `POST /api/auth/login`
   - 返回 `200`
   - Admin cookie 设置成功

2. `GET /finance/reports?month=2026-06`
   - 返回 `200`
   - 页面包含“实时毛利”
   - 页面包含“快照差异”
   - 页面包含 `/finance/audits?page=1&pageSize=20&month=2026-06` 跳转

3. `GET /finance/audits?month=2026-06`
   - 返回 `200`
   - 页面包含“修正审计”
   - 月份筛选存在
   - 月份值为 `2026-06`

4. API 日志检查
   - 本轮管理员账号 smoke 相关接口均为 `200`
   - 未执行结账、反结账、修正、complete 或其他写操作

## 验证命令

```bash
cd apps/api
bun test src/services/finance-monthly-overview.test.ts src/services/finance-correction-audits.test.ts
pnpm --dir apps/api check
```

```bash
cd apps/admin
bun test components/finance/finance-correction-audit-utils.test.ts components/finance/finance-operating-report-utils.test.ts
pnpm --dir apps/admin check
```

## 小程序边界

本轮小程序端无必改。

原因：

- 结账快照差异属于 Admin 财务报表和审计闭环。
- 小程序不展示 `/finance/reports/monthly-overview`。
- 小程序不展示 `/finance/correction-audits`。
- workflow v2、收款、费用、施工入口契约未变。

如后续要在小程序员工端展示“月结后数据发生变化”提醒，应单独设计只读摘要接口和权限，不应让小程序直接消费 Admin 修正审计表格。
