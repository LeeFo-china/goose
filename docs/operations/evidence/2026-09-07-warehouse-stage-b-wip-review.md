# 仓库库存 Stage B：WIP 保存与审查清单

日期：2026-09-07。状态：**仅保存半成品，禁止合并 main、应用本 migration 或发布。**

## 1. 本次范围与基线

- 用户本次只确认第 1 步：审查现有 15 项改动，整理已完成、缺失、风险，并提交到原分支保存。
- 分支：`feature/warehouse-procurement-inventory-stage-b`。
- 原 HEAD：`28d1ae3761766093d3cffe2c8547c743e5e7c202`；审查时 main：`ce2c67fb`，本分支尚缺 main 的 7 个提交。
- 原计划：[Stage B 实施计划](../../superpowers/plans/2026-09-06-warehouse-procurement-inventory-stage-b.md)。计划的未勾选项不能作为验收通过证据。
- 本次不修改业务实现，不同步 main，不访问数据库，不执行 migration，不推送、不发布、不修改 orange，不清理此 worktree。
- 本次提交是 WIP 检查点，不是功能完成提交；新增本清单后共保存 16 个文件。

## 2. 已有实现与缺失

“已有”表示存在可继续使用的源码，不表示数据库行为或完整业务已通过验收。

| 计划部分 | 已有内容 | 缺失或限制 |
| --- | --- | --- |
| Task 1：Domain | 库存流水枚举、中文标签、根导出和测试 | 仅类型常量，不代表领料、退料等操作已实现 |
| Task 2：数据库 | 库存流水/余额表、约束、索引、RLS、收货包装函数、分页 RPC、财务目的地字段 | 存在下述 P1 阻断；未应用、未做真实账务验证 |
| Task 3：读取 API | balances/transactions 两接口；controller/service/repository 分层；权限和分页；7 项 API 测试 | 服务能力映射缺失；缺真实鉴权、跨租户及非空数据集成测试 |
| Task 4：采购双目的地 | 未提交对应修改 | 批次 schema 仍要求 project_id，未完成仓库开关、启用状态和目的地传递 |
| Task 5：履约与财务 | migration 有仓库分支草稿 | 服务仍调用项目权限；财务读取和付款命令仍依赖项目 |
| Task 6–7：Admin | 未新增库存页面及相关改动 | 库存余额/流水页、菜单、仓库补货入口及回归均缺失 |
| Task 8：开发库验收 | 仅静态契约测试 | 缺 migration 对齐、历史数据迁移、真实收货/幂等/并发/财务 smoke 和 EXPLAIN |
| Task 9：集成 | 本次只做 WIP 保存 | 未满足功能提交、合并及发布门槛 |

## 3. 必须修复的风险

以下为源码审查及本地测试证据，不是线上故障复现。行号对应本次 WIP。

### P1：历史数据回填被现有保护触发器拒绝

`supabase/migrations/20260906110000_create_inventory_ledger_stage_b.sql:158/197/236` 对应付、付款申请、付款事实执行 UPDATE，但没有处理已有不可变触发器或命令上下文限制：

- `20260731100000_create_supplier_cost_payable_facts.sql:714/739`：应付更新抛出 `SUPPLIER_ACCOUNTING_EVENT_IMMUTABLE`。
- `20260731110000_create_supplier_payment_requests.sql:820/840`：付款申请更新要求命令上下文。
- 同文件 `:805/852`：付款事实更新抛出 `SUPPLIER_PAYMENT_FACT_IMMUTABLE`。

对应历史表非空时会中断事务，空库测试不能证明可升级。后续须设计受控 migration，验证历史数据及保护机制保留，禁止手工远端改表或关闭保护止血。

### P1：分次收货会重复累计库存价值和应付

新 migration `:624–663` 按历史收货明细 source_id 汇总已记金额，再用本次新收货明细 ID 关联，无法扣除同一采购明细以前的记账金额。`:675` 又按累计合格数量计算，导致重复确认累计金额。

按当前公式推演：采购 10 件共 100 元，分两次收 4 件和 6 件，将分别确认 40 元和 100 元，合计 140 元，而非 100 元。后续应按采购单明细归集历史金额，补充分次、尾差、重复提交和并发测试；本次没有执行真实数据库复现。

### P1：内部履约函数仍可绕过记账入口

新 migration `:271–283` 将原 RPC 重命名为 `create_supplier_purchase_order_receipt_fulfillment_v2`，没有撤销原 service_role EXECUTE 授权。原授权见 `20260905130000_align_supplier_purchase_order_awaiting_receipt.sql:1007`。

这不是匿名用户越权：风险在于持有 service_role 的调用方可直接使用内部履约入口，只创建收货和幂等事件而不记库存/成本/应付；随后正式入口又会在 `:322–325` 因幂等返回，无法补账。后续必须收敛可调用入口并验证原子性。

已核对原函数是纯履约实现，不将此次包装误报为“调用旧账务函数导致项目重复记账”。

### P1：库存路由缺少租户服务能力分类

`apps/api/src/controllers/inventory/index.ts:18/27` 新增路由，`apps/api/src/services/tenant-service-capability-map.ts` 未分类 `inventory`。

真实路由清单测试列出 GET/HEAD `/inventory/balances`、`/inventory/transactions` 未映射。现有 controller 测试替换了 `getRequiredTenantContext`（`routes.test.ts:64` 附近），因此其通过不能证明真实入口可用。

本旧分支还包含 6 条 warehouses 路由未映射；main 的 `9e7b08ea` 已解决 warehouses，尚未同步。同步 main 后仍须单独处理 inventory，保留服务状态、`inventory.stock.view` 及租户隔离检查。

### P1：仓库采购与付款闭环未完成

- `apps/api/src/schema/supplier-purchase-batches.ts:78`：project_id 必填，尚未开放仓库目的地。
- `apps/api/src/services/supplier-purchase-fulfillments.ts:144/151`：仍直接调用项目权限检查。
- `apps/api/src/repositories/supplier-payment-records.ts:128/147/166/208`：project_id 仍按非空 UUID 解析。
- `20260731110000_create_supplier_payment_requests.sql:2114`：付款保存拒绝空 project_id；既有读取 SQL 的项目 INNER JOIN 也须逐一适配。

不能只靠新增 warehouse_id 和可空 project_id 宣称财务兼容。后续须覆盖仓库应付、付款申请、付款记录与项目采购回归。

### P2：分页返回有界，但数据库工作量仍需优化验证

新 migration `:921/1036` 先 MATERIALIZED 全部匹配记录及 JOIN 资料，再 COUNT、排序分页。当前默认 20、最大 100 只限制返回量，不能限制扫描量。无仓库/SKU 筛选时的租户时间排序索引及关键词查询需要评估，用代表性数据做 EXPLAIN ANALYZE；本次未观察或声称线上慢查询。

## 4. 本地验证与边界

运行环境：Bun 1.3.2；API 测试分别在本 worktree 的 `apps/api` 下运行，避免 mock.module 污染及加载错误的根配置。

| 检查 | 结果 |
| --- | --- |
| Domain inventory.test.ts | 1 通过 |
| warehouse-inventory-migration-contract.test.ts | 4 通过，仅 SQL 文本断言 |
| schema/repository/service/controller 库存测试 | 2 + 2 + 1 + 2 = 7 通过 |
| 定向测试合计 | 12 通过；不是完整业务验收 |
| API `bun run typecheck` | 补齐本地依赖链接后通过 |
| API `bun run build` | 通过 |
| Domain `bun run build` | 通过，dist 及外部 Zod 身份检查通过 |
| 权限边界、API 文件大小、git diff --check | 通过 |
| tenant-service-capability-map.test.ts | 27 通过、1 失败，列出 6 条仓库及 4 条库存未映射路由 |
| 数据库应用、迁移状态、收货/并发/财务 smoke、Admin 验收 | 未执行 |

环境核查：最初从仓库根运行 API 测试误加载 main 的共享包；进入本 worktree 的 apps/api 后定向测试通过。类型检查最初混用 API 的 Zod 4.4.2 与祖先目录中的 Zod 4.1.8；已增加被忽略的 `packages/domain/node_modules` 链接复用 gooes 现有依赖，随后标准类型检查通过。未改源码、依赖版本或锁文件。单次 `--tsconfig-override` 尝试触发 Bun directory mismatch 提示，最终验证使用标准命令，不依赖该选项。

知识库查询返回 502；未上传本 WIP 清单，结论以本地代码、原计划和验证输出为准。数据库审查经独立只读 reviewer 复核。

## 5. 保存清单与后续门槛

原始 15 个文件完整保留：

```text
apps/api/src/routes/index.ts
packages/domain/src/index.ts
apps/api/src/controllers/inventory/index.ts
apps/api/src/controllers/inventory/routes.test.ts
apps/api/src/repositories/inventory.ts
apps/api/src/repositories/inventory.test.ts
apps/api/src/schema/inventory.ts
apps/api/src/schema/inventory.test.ts
apps/api/src/services/inventory.ts
apps/api/src/services/inventory.test.ts
apps/api/src/services/warehouse-inventory-migration-contract.test.ts
packages/domain/src/inventory.ts
packages/domain/src/inventory.test.ts
supabase/migrations/20260906110000_create_inventory_ledger_stage_b.sql
docs/superpowers/plans/2026-09-06-warehouse-procurement-inventory-stage-b.md
```

建议下一次独立授权的实施顺序：

1. 在保留此快照的前提下同步最新 main，核对迁移顺序和分支依赖；本次未核对远端 migration 历史，不得直接运行旧计划中的 db push。
2. 先为回填失败、分次收货金额、内部入口权限和库存路由补充可失败的回归测试，再修根因。
3. 补齐采购/收货/付款双目的地流程和 Admin 页面，不开放未验证的仓库补货开关。
4. 在获准的开发环境核对待应用 migration、做历史数据升级及业务回归，应用后检查 Local/Remote 对齐；验证事务失败整体回滚和后续纠正方案。
5. 所有阻断关闭、测试和审查通过后，另行确认 squash merge、worktree 清理及生产发布。

安全保存不等于允许部署。不得直接应用此快照中的 migration；涉及账务事实的后续纠正只能通过审查后的 migration，不能删除事实或手动修库。
