# Phase 7.6 财务对账运营统计发布后 smoke

日期：2026-06-30

## 范围

本次只读 smoke 验证 main 基线 `ec4bc1f3` 合入后的财务对账运营统计能力。

验证内容：

- 员工登录。
- `GET /finance/reconciliation/operating-stats`。
- Admin `/finance/reconciliation` 页面渲染。

未执行：

- 未调用任何财务修正写接口。
- 未调用对账异常处理动作。
- 未修改 workflow。
- 未修改数据库。
- 未修改 orange 仓库。

## 临时服务

在隔离 worktree 中临时启动：

- API：`http://127.0.0.1:3103`
- Admin：`http://127.0.0.1:3111`

环境：

- `NODE_ENV=production`
- `JWT_SECRET=local-smoke-secret`
- `--env-file=/Users/leefo/Public/work/gooes/.env.local`

smoke 后已停止临时服务。

## 登录

```text
POST /admin/auth/login
phone=18800005001
```

结果：

- HTTP 200
- message：`登录成功`
- employee：`小龙女`

## API 验证

请求：

```text
GET /finance/reconciliation/operating-stats?date_from=2026-06-01&date_to=2026-06-30
```

结果：

- HTTP 200
- message：`success`
- `summary.total = 11`
- `summary.open = 10`
- `summary.stale_open_over_7_days = 8`
- `by_exception_code.length = 2`
- `by_status = open:10,acknowledged:1,ignored:0,resolved:0`
- `recent_actions.length = 1`

## Admin 验证

请求：

```text
GET /finance/reconciliation?date_from=2026-06-01&date_to=2026-06-30
```

结果：

- HTTP 200
- 页面包含：
  - `对账异常`
  - `状态分布`
  - `异常类型`
  - `最近处理`
  - `超 7 天未处理`

## 结论

Phase 7.6 发布后只读 smoke 通过。

Admin 财务对账页可以正常展示运营统计区，API 可以返回统计结构。当前未发现 403/409/500，未执行任何写操作。
