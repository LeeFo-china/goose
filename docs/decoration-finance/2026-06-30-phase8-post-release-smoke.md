# Phase 8 财务报表与月度结账发布后 Smoke

日期：2026-06-30
主分支提交：`004b16dd merge: phase8财务报表与结账基础闭环`

## 范围

本次在 `main` 推送后做发布后只读 smoke，验证 Phase 8 Task 1-5 合入后的核心链路：

1. API 登录和财务报表接口可用。
2. 月度经营总览返回收入、支出、毛利、逾期应收和对账异常。
3. 月度结账列表接口分页可用。
4. Admin 财务报表页可登录、可渲染、无前端 console error。
5. RAG 文档同步完成。

本次未执行任何会改变业务数据的操作：

- 未创建结账草稿。
- 未确认结账。
- 未反结账。
- 未修改 workflow、项目、收款、费用、台账或对账异常。

## Git 和 RAG

推送结果：

```text
git push origin main
c7b6a759..004b16dd  main -> main
```

RAG 同步结果：

```text
[gooes-rag-sync] done: uploaded=1, failed=0, changed=1
[gooes-rag-sync] skip: dry-run found no changed docs to upload
```

## 临时服务

API：

```text
http://127.0.0.1:3101
```

Admin：

```text
http://127.0.0.1:3110
```

Admin 临时服务通过环境变量指向临时 API：

```text
GOOES_API_BASE_URL=http://127.0.0.1:3101
NEXT_PUBLIC_GOOES_API_BASE_URL=http://127.0.0.1:3101
```

未改动已有 launchctl 服务。

## API Smoke

执行账号：

```text
18800005001 / 小龙女
租户：固始晴天装饰工程有限公司
```

接口结果：

```text
POST /admin/auth/login -> 200
GET /admin/auth/me -> 200
GET /finance/reports/monthly-overview?month=2026-06 -> 200
GET /finance/closing-periods?month=2026-06&page=1&pageSize=5 -> 200
```

月度经营总览核心结果：

```json
{
  "income_amount": 446271.35,
  "expense_amount": 1000,
  "gross_profit_amount": 445271.35,
  "gross_profit_rate": 0.9978,
  "overdue_receivable_amount": 3000,
  "reconciliation_exception_count": 12,
  "closing_status": "not_started"
}
```

结账列表结果：

```json
{
  "status": 200,
  "total": 0,
  "count": 0
}
```

## Admin Smoke

访问页面：

```text
http://127.0.0.1:3110/finance/reports
```

页面核验：

- 可登录后台。
- 页面标题显示“财务报表”。
- 可见“财务总览”tab。
- 可见“本月收入”指标，金额 `¥446,271.35`。
- 可见“本月支出”指标，金额 `¥1,000.00`。
- 可见“结账状态”，当前为“未结账”。
- 可见结账操作入口：生成草稿快照、确认结账、反结账。
- 可见原运营报表分组表，包含“分组”“实际利润”等字段。

浏览器核验：

```text
http_errors: []
console_errors: []
```

截图：

```text
/tmp/gooes-phase8-admin-finance-reports-smoke.png
```

## 结论

Phase 8 Task 1-5 合入 main 后，API、Admin 页面和 RAG 同步均通过本轮发布后 smoke。

当前 2026-06 没有结账记录，页面和 API 均按 `not_started / 未结账` 展示，符合预期。

## 后续观察

- 结账草稿、确认结账、反结账仍需在受控样本中做写入 smoke。
- 后续 Task 6-10 需要补结账后锁账、快照明细、导出、专项报表和结账后修正追溯。
- 小程序当前无必改；如后续需要展示月份锁账状态，应只读消费后端字段。
