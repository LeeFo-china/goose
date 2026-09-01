# 老板看板项目甘特图筛选 Dev 验证

## 发布证据

- 接口：`GET /tenant-owner/daily-dashboard/projects/gantt`
- 环境：`https://api-dev.goodcms.cn`
- Gooes revision：`1743e2a6e594d7df341b5d17ad534303efd83793`
- 合并记录：PR `#105`，squash merge
- Dev 发布：GitHub Actions `Release Dev` run `33474140899`
- API 发布 job：`99750192036`，结论 `success`
- Migration：`20260901110000_add_tenant_owner_project_gantt_filters.sql`
- Migration history：Local/Remote 均为 `20260901110000`

发布工作流使用不可变 commit SHA 部署，并在 `Deploy dev services` 中校验容器
revision、镜像标签及健康状态。外部 API 代理未透出 `x-gooes-revision`，因此
revision 以发布工作流的 `headSha` 和成功的 API 部署 job 为准。

## 最终请求契约

新增参数均为可选参数，不传时保持原有分页响应：

```http
GET /tenant-owner/daily-dashboard/projects/gantt?page=1&pageSize=20&keyword=项目关键词&window_start=2026-09-01&window_end=2026-09-30&timezone=Asia%2FShanghai&risk=delayed
```

| 参数 | 约束 |
| --- | --- |
| `page` | 默认 `1` |
| `pageSize` | 默认 `20`，最大 `100` |
| `keyword` | trim 后最长 `100`，搜索项目、客户、小区/地址和负责人 |
| `window_start` / `window_end` | `YYYY-MM-DD` 闭区间，必须成对出现且开始日期不晚于结束日期 |
| `timezone` | IANA 时区，默认和 Orange 使用 `Asia/Shanghai` |
| `risk` | `delayed`、`blocked` 或 `unscheduled` |

筛选顺序为租户及项目状态范围、完整数据集筛选、`total` 统计、稳定排序、分页，
然后批量读取当前页工作流。所有筛选条件取交集。

风险口径：

- `delayed`：当前有效排期的业务工序已经超过结束日期。
- `blocked`：要求客户验收的已完成工序尚未完成客户确认。
- `unscheduled`：当前或待开始业务工序缺少开始或结束排期。

## Dev 接口 Smoke

使用脱敏租户 `3eebca47-...` 的租户管理员会话验证。该样本有 17 个接口状态
范围内的项目，未记录 token、完整手机号、客户姓名或详细地址。

| 场景 | HTTP | 结果 |
| --- | --- | --- |
| 无新增筛选，`pageSize=20` | `200` | `total=17`、`list=17`、`partial_errors=[]` |
| 项目关键词 | `200` | `total=1`，返回项全部命中关键词 |
| 单日闭区间 `2026-08-25` | `200` | `total=6`，证明首尾同日可命中 |
| `risk=delayed` | `200` | `total=7`，每项含 `delayed_workflow` |
| `risk=blocked` | `200` | `total=1`，每项含 `blocked_workflow` |
| `risk=unscheduled` | `200` | `total=8`，每项含 `unscheduled_workflow` |
| 关键词与风险交集 | `200` | `total=1` |
| 第 1、2 页连续读取 | `200` | `total` 一致，项目 ID 无重复 |
| 无匹配关键词 | `200` | `list=[]`、`total=0`、`totalPages=0` |
| 缺少一个窗口端点 | `400` | `VALIDATION_ERROR` |
| 开始日期晚于结束日期 | `400` | `VALIDATION_ERROR`，request ID `req-8m` |
| 非法自然日 | `400` | `VALIDATION_ERROR` |
| 非法 IANA 时区 | `400` | `VALIDATION_ERROR` |
| 非法风险枚举 | `400` | `VALIDATION_ERROR`，request ID `req-8l` |
| `pageSize=101` | `400` | `VALIDATION_ERROR` |
| 无 `dashboard.read` 的脱敏员工 | `403` | `FORBIDDEN`，request ID `req-8r` |

外部成功响应沿用既有 `ResponseHandler.success` 契约，不返回 request ID；错误响应
携带可用于日志关联的短 request ID。

## 自动化与本地数据库验证

- 聚焦测试：28 passed，0 failed，102 expects。
- `bun run api:typecheck`：通过。
- `bun run api:build`：通过。
- `bun run api:check-file-size`：通过。
- 本地 migration 单独应用：通过。
- 本地事务 SQL smoke：关键词、闭区间、三种风险、组合筛选、稳定分页及越界空页
  均通过；事务最终回滚，未保留测试数据。
- 带时间或风险筛选时，工作流读取失败会作为请求失败返回；无工作流筛选时继续
  使用既有 `partial_errors` 兼容降级。该边界已由 service 聚焦测试覆盖。

全量 `bun test` 仍受仓库既有 Bun 全局 mock 跨测试污染影响；同一基线也存在大量
失败，因此本次以隔离的契约测试、类型检查、构建、本地 SQL smoke 和真实 Dev API
smoke 作为验收证据。

## Orange 联调说明

Orange 可以基于 `https://api-dev.goodcms.cn` 开始真机和开发者工具联调：

1. 查询变化时重置 `page=1`，保持每页 `20` 条并上拉加载。
2. “全部时间”不传窗口；其它时间选项传明确闭区间及 `Asia/Shanghai`。
3. “全部风险”不传 `risk`；其它选项使用三个稳定枚举。
4. 继续使用现有响应结构和 `partial_errors` 处理方式。
5. 验收关键词切换、窗口边界、三种风险、组合筛选、空状态及连续翻页无重复。

仓库边界：本次仅在 Gooes 中修改后端和验证文档；Orange 仓库只读核查，未产生
文件、Git 或构建状态变化。
