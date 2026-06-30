# Phase 8.3 月结差异处理闭环 smoke

日期：2026-06-30
工作区：`.worktrees/phase8-3-difference-resolution`

## 变更范围

本轮在 Phase 8.2 差异来源追溯基础上，补齐“差异来源处理状态”闭环：

- 新增 `finance_monthly_difference_resolutions` 表，记录某月某来源的处理状态。
- `GET /finance/reports/monthly-overview/difference-sources` 返回每条来源的 `resolution`。
- 差异来源列表支持 `resolution_status=pending|confirmed|ignored|resolved`。
- 新增 `PUT /finance/reports/monthly-overview/difference-resolutions` 保存处理状态。
- Admin 差异来源页新增处理状态筛选、待处理/已处理指标、处理状态列和行内处理入口。

## Migration

新增 migration：

```text
20260630213000_finance_monthly_difference_resolutions.sql
```

应用前：

```text
20260630213000 |                | 2026-06-30 21:30:00
```

已执行：

```bash
PGSSLMODE=disable supabase db push --db-url "${SUPABASE_DB_DIRECT_URL}?sslmode=disable"
```

应用后：

```text
20260630213000 | 20260630213000 | 2026-06-30 21:30:00
```

说明：首次建表时 `DROP TRIGGER IF EXISTS` 输出 trigger 不存在的 notice，属于预期。

## 验证命令

后端：

```bash
cd apps/api
bun test \
  src/services/finance-monthly-overview.test.ts \
  src/services/finance-closing-periods.test.ts \
  src/services/finance-correction-audits.test.ts \
  src/services/finance-specialized-reports.test.ts \
  src/services/finance-monthly-difference-sources.test.ts \
  src/schema/finance-reports.test.ts
pnpm check
```

结果：

```text
33 pass
pnpm check passed
```

Admin：

```bash
cd apps/admin
bun test \
  components/finance/finance-difference-sources-utils.test.ts \
  components/finance/finance-operating-report-utils.test.ts \
  components/finance/finance-correction-audit-utils.test.ts
pnpm check
```

结果：

```text
14 pass
pnpm check passed
```

## 临时服务 smoke

本轮没有动 main 工作区服务。临时服务端口：

- API：`http://127.0.0.1:3020`
- Admin：`http://localhost:3030`

登录账号：

```text
18800005001 / 小龙女
租户：固始晴天装饰工程有限公司
```

API smoke：

```http
GET /finance/reports/monthly-overview/difference-sources?month=2026-06&page=1&pageSize=5
```

结果：

```json
{
  "pagination": { "total": 0 },
  "summary": {
    "resolution": {
      "pending": 0,
      "confirmed": 0,
      "ignored": 0,
      "resolved": 0
    }
  }
}
```

`resolution_status=pending` 筛选返回 200，结果同样为 0 条。

无副作用 PUT 校验 smoke：

```http
PUT /finance/reports/monthly-overview/difference-resolutions
```

提交 `status=pending` 返回：

```text
400 VALIDATION_ERROR
字段 [status] 校验失败: Invalid option: expected one of "confirmed"|"ignored"|"resolved"
```

说明：当前 2026-01 至 2026-06 均无真实差异来源样本，因此本轮没有对不存在的来源写入成功处理记录，避免产生孤儿处理数据。成功写入动作需等后续出现真实差异来源后复测。

Admin smoke：

- URL：`/finance/reports/difference-sources?month=2026-06`
- 页面标题：差异来源
- 已出现处理状态筛选
- 已出现待处理、已处理指标
- 空状态正常：当前筛选条件下暂无差异来源
- 未发现前端 console error / page error
- 截图：`/tmp/phase83-difference-sources-admin.png`

## 小程序边界

本轮是 Admin 财务月结差异处理闭环，不改变小程序契约：

- 小程序无需新增字段或改代码。
- 小程序仍不消费月结差异来源处理状态。
- 如后续员工端需要展示月结差异处理结果，再单独出 handoff。

## 提交记录

```text
2781825d docs(finance): 规划phase8-3差异处理闭环
46ee2d36 feat(api): 增加月结差异处理记录
7e2414b9 feat(admin): 增加月结差异处理入口
```
