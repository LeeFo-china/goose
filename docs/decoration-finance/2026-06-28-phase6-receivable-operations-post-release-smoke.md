# 阶段 6：应收运营闭环发布后只读 Smoke

日期：2026-06-28

## 范围

本次只读 smoke 覆盖阶段 6 发布后的应收运营闭环可见性和 RAG 同步收尾。

验证原则：

- 不调用 `POST /finance/receivables`。
- 不调用 `PATCH /finance/receivables/:id`。
- 不调用 `POST /finance/receivables/:id/cancel`。
- 不调用 `POST /finance/receivables/:id/follow-ups`。
- 不调用 `POST /workflow-tasks/:taskId/complete`。
- 不停止 main 工作区 `3000/3010` 服务。

## 临时服务

使用 worktree：

```text
/Users/leefo/Public/work/gooes/.worktrees/finance-followup-2-5
```

临时服务：

- API：`http://127.0.0.1:3120`
- Admin：`http://127.0.0.1:3130`

main 工作区服务保持不动：

- API：`3000`
- Admin：`3010`

## RAG 同步收尾

问题：

- `gooes` RAG dry-run 曾提示仍有 1 个文档需要上传。
- 实际上传时 LightRAG 返回 409：远端已存在同名 processed 文档，但内容为旧版本，manifest hash 也落后。

处理：

1. 通过 LightRAG 文档分页接口定位旧文档：
   - document ID：`doc-3bbebdc26ae9134c758bb0cd660e26a6`
   - file_path：`2026-06-24-phase5-finance-analysis-warning-smoke.md`
   - 旧 content_length：`4326`
2. 调用 `/documents/delete_document` 精确删除旧 document ID。
3. 等待 pipeline `busy=false`。
4. 重新同步当前文档：
   - path：`docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-smoke.md`
   - size：`9402`
   - track_id：`insert_20260628_142214_e0d2c137`
   - uploadedCount：`1`
   - failedCount：`0`
5. 再次执行 gooes force dry-run：
   - 结果：`skip: dry-run found no changed docs to upload`

检索验证：

- RAG 已可检索到 `2026-06-24-phase5-finance-analysis-warning-smoke.md` 中的小程序发布后只读 smoke 新内容：
  - API：`http://192.168.1.3:3000`
  - 账号：`18800005001 / 小龙女`
  - 项目 ID：`00000000-0000-4000-8000-202606160006`
  - `current_node_key=tile_work`
  - 结论：Phase 5 对小程序现有登录、项目 workflow、施工、费用、收款只读入口无破坏影响；当前阶段 orange 无必改。

补充修复：

- `scripts/post-commit-rag-sync.mjs` 已补齐 worktree 下共享 RAG 工具路径解析，避免在 `.worktrees/*` 下误找 `.worktrees/mcp/rag`。

## API 只读 Smoke

执行账号：

- phone：`18800000001`
- 员工：`风清扬`
- employee ID：`d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`
- 租户：`固始晴天装饰工程有限公司`
- tenant ID：`3eebca47-961f-4899-b976-a3d3208d326b`

接口结果：

- `POST /admin/auth/login`：200
- `GET /admin/auth/me`：200
- `GET /finance/receivables?page=1&pageSize=5`：200
  - total：`4`
- `GET /finance/receivables/f55e810c-aacb-44af-817e-3ab1d35699c2/events?page=1&pageSize=5`：200
  - events_count：`0`

样本应收：

- receivable ID：`f55e810c-aacb-44af-817e-3ab1d35699c2`
- project ID：`407537b4-2adc-4a0f-ac83-bdaecf70e559`
- status：`overdue`
- source_type：`manual`
- owner_employee_name：`null`
- latest_follow_up_at：`null`

## Admin 只读 Smoke

页面：

- `http://127.0.0.1:3130/finance/receivables`

可见内容：

- `应收计划`
- `新增应收`
- `负责人 ID`
- `来源`
- `最近跟进`
- `只看逾期`
- `跟进到期`

浏览器检查：

- page_errors_count：`0`
- console_errors_count：`0`
- failed_responses：`[]`

截图：

```text
/tmp/gooes-phase6-post-release-receivables-readonly.png
```

## 小程序影响

本阶段小程序无必改，继续沿用：

- 收款待办来自 `/workflow-tasks?status=pending`。
- 收款按钮来自 `workflow_state.actions`、`timeline_nodes[].actions` 或 `/workflow-tasks.actions`。
- 确认收款只调用 `POST /workflow-tasks/:taskId/complete`。
- 不直接写 `/finance/receivables`。
- 不本地推导逾期、催收状态、负责人或应收运营状态。

## 结论

通过。

阶段 6 发布后只读 smoke 证明：

- 应收运营 API 只读入口正常。
- Admin 应收计划页面和阶段 6 字段/筛选可见。
- 本次未执行任何财务写操作或 workflow 推进。
- RAG 同步缺口已清零，新版本文档可检索。
