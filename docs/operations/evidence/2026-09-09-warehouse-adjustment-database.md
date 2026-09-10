# D2.2 手工调整数据库命令验证记录

日期：2026-09-09。请求契约基线 `63b14a02`；数据库设计 `fccef07a`，实施计划 `dab21eca`；数据库实现 `4362ec06`。实现恰好 7 个文件、1017 行新增。主线程独立验证、SPEC 和后续质量审查均已通过；本批数据库单元完成，本记录不表示功能已上线。

## 本批边界

新 migration `20260909134749_warehouse_adjustment_atomic_commands.sql` 由 `supabase migration new warehouse_adjustment_atomic_commands` 生成。实现独立调整单、明细、回执、四个原子命令，新增默认关闭开关及两个仅定义的权限，并用真实 SQL 夹具验收。

仅在既有隔离 feature 工作树实施，不改历史 migration、Orange、HTTP/Admin、生成数据库类型或真实租户授权。不执行远端 apply、开发发布、生产操作或 Chrome 业务验收；main、D1 和 D2.1 固定发布分支必须保持不变。

数据库验证复用现有 runner：只从本地 `supabase_db_gooes` 读取 schema 和元数据，在 `--network none` 的临时 PostgreSQL 容器中恢复并应用采购/库存域待执行 migration。只使用合成数据，不写源本地库，不读取真实业务行；结束清理临时容器。该验证不是完整历史数据迁移或 DEV Local/Remote 对齐验收。

## 已执行基线

主线程在实施前独立执行：

```sh
bun test packages/domain/src/warehouse-adjustment.test.ts packages/domain/src/permission.test.ts
bunx tsc --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --types bun scripts/verify-warehouse-stage-b-database.ts
bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/stocktake-contract.sql
```

全部退出 0。Domain 23 pass、280 assertions；SQL 恢复 schema-only 基线 `20260828160000`（527 条 migration 记录），采购/库存域待执行链及既有盘点契约通过。Bun 1.3.2，Supabase CLI 2.99.0；没有更新依赖或 CLI。

实施期间主线程在 `apps/api` 补跑以下原业务回归及完整类型检查，均退出 0（57 pass、689 assertions）。这是原 API 行为基线，不替代新增 SQL 验收：

```sh
bun test src/schema/warehouse-adjustments.test.ts src/schema/warehouse-stocktakes.test.ts src/schema/warehouse-transfers.test.ts src/schema/warehouse-materials.test.ts src/repositories/inventory.test.ts src/services/authorization/system-admin-warehouse-transfer-permissions.test.ts
bunx tsc -p tsconfig.json --noEmit
```

## RED、根因修正与最终静态验证

实施者报告真实 RED：新增两个 Domain 权限断言失败（22 pass、2 fail）；隔离 runner 成功恢复基线并应用原采购/库存域链后，明确报 `Stage D2.2 missing table: warehouse_adjustment_orders`。未将环境恢复或依赖错误当作缺功能 RED。

新实现首次 workflow 对缺失余额报 `cannot call populate_composite on a scalar`，不是预期的成本依据错误。根因是批量左连接的缺失复合行经 JSON 封装成为 JSON null，再转回复合行失败。修正为 JOIN 直接读取 SQL 复合行，保留 SQL NULL 语义；仅在已通过正数量余额预检后封装内部计算结果。原缺失余额用例随后 GREEN，主线程最终独立复跑亦通过。没有吞错、创建占位余额或绕过成本依据检查。夹具自身的员工状态枚举、遗留函数声明、目录 TP/TS 编号及 JSON 显式类型问题另行修正，不把这些夹具错误计为产品缺陷。

固定提交后主线程运行：

```sh
bun test packages/domain/src/permission.test.ts packages/domain/src/warehouse-adjustment.test.ts
bun run --cwd packages/domain build
bun run check:file-size
git diff --check dab21eca..4362ec06
```

Domain 25 pass、284 assertions；构建 150406 字节，external Zod 身份检查通过。新增权限后另复跑前述 API 57 项（689 assertions）及完整类型检查，均退出 0；API `bun run build` 输出 979 模块、5.12 MB，退出 0。API/Admin 文件大小检查通过。Domain/API 共 82 项相关测试包含旧回归，不代表 82 项新增测试，亦不替代 SQL 验收。

## 主线程独立 SQL 复验

在工作树根目录执行 `bun scripts/verify-warehouse-stage-b-database.ts`，依次传入以下 `scripts/fixtures/warehouse-stage-b/` 夹具（均带 `.sql`）：material-contract、material-workflow、material-security、transfer-contract、transfer-workflow、transfer-security、stocktake-contract、stocktake-workflow、stocktake-security、adjustment-contract、adjustment-workflow、adjustment-security、adjustment-concurrency。13 个夹具全部通过，进程退出 0，包含本批原始 migration 字节。

验证四命令状态与版本、保存/提交/取消不写库存、正负混合数量差额、按未舍入的价值/数量计价、清空消耗剩余全部价值、合法零成本、缺失/零库存调增与超量调减拒绝；第二行提交失败无部分快照，完成第二流水及回执故障均恢复全部订单/明细/回执/余额/流水/财务快照。

安全验证涵盖数据库实际权限与显式 deny、system_admin 不自动获权、停用角色/员工/租户、错误用户、跨租户订单/仓库/SKU、开关关闭的冻结回放、撤权后回放拒绝；SQL 独立 UUID/UTF16/trim/数量字符串/100 行/去重/未知字段校验；提交后字段冻结、终态及事实不可变、来源触发器/复合 FK/唯一性/旧来源 CHECK；余额删除重建和版本变化拒绝。数量、成本、金额、余额价值、均价、余额版本和不足库存的提交/完成极限检查均验证失败且全快照恢复。

完成预检中的部分极限在正常 submit 下不可达，夹具明确标注为合成损坏数据探针：仅在一次性库中临时关闭明细 guard 构造后重新启用，再调用真实 complete；外键/CHECK 分层探针也仅在离线库中临时停用来源触发器。所有这些操作均在夹具事务内回滚，不是生产代码绕过校验，也不能当作真实业务可达流程。

7 组业务竞争的本次实际锁证据：

| 场景 | A/B PID | B 等待锁 | B 结果 |
| --- | --- | --- | --- |
| two-outdated | 599/600 | transactionid | 调整 SNAPSHOT_CONFLICT |
| same-key | 601/602 | advisory | 与 A 同一冻结结果，仅一次过账 |
| transfer-first | 603/604 | transactionid | 调整 SNAPSHOT_CONFLICT |
| adjustment-before-transfer | 605/606 | transactionid | 调拨 completed，准确 3 条新流水 |
| stocktake-first | 607/608 | transactionid | 调整 SNAPSHOT_CONFLICT |
| adjustment-before-stocktake | 609/610 | transactionid | 盘点 SNAPSHOT_CONFLICT |
| absent-created | 611/612 | transactionid | 调整 submitted，冻结真实调拨新建余额 |

每组均观察 `wait_event_type=Lock`，且 B 的 blocking_pids 包含 A 后才释放事务。另 2 组负控：提前提交 A 不能冒充锁竞争；B 超时必须保留原错误并回滚 A 未提交业务，全部连接关闭。实际调出/调回使数量价值恢复但余额版本 +2 后，旧调整快照仍被拒绝。最终全租户 FULL JOIN 核对流水/余额/均价，项目成本/应付/付款/现金完整摘要不变。

测试结束后 `docker ps` 无本次 `gooes-stage-b-database-*` 容器。现有 runner 使用 SQL_ASCII 临时库，新实现复用既有 UTF16/trim/UUID helper而未改编码；不能把该结果替代未来 UTF8 DEV 全业务与 HTTP 验收。

## 后续接入与风险边界

独立 SPEC 审查已通过：逐一阅读全部 7 文件与相关既有实现，无违反批准规格的阻断项；审查者另跑 Domain 25 项/284 assertions 和 diff 检查通过，未将主线程的 SQL 验证冒称为自己执行。之后独立质量审查通过，无 Critical/Important/需记录的 Minor；质量审查者核对旧来源约束、纯 helper、实际权限 helper 和跨业务仓锁，也独立复跑 Domain 25 项及 diff 检查通过。两个审查结论都只针对本批数据库单元，不等于开放上线。

按既有授权提交并推送 `feature/warehouse-transfer-admin-mainline`，保留 linked worktree，未 merge/PR 或清理工作区。main 固定 `43cb38bf`，D1 release 固定 `710b3322`，D2.1 release 固定 `daee511b`；本批不移动发布分支。无远端 apply，因此未执行或声称本批 migration 的 Local/Remote 已对齐。

本批独立权限定义不代表任何现有角色已获实际数据库权限；API 的 system_admin 派生 Domain 权限不能取代命令鉴权。默认关闭开关也不代表已具备配置入口。

当前库存来源读取还没有手工调整单据投影；HTTP、分页读取 RPC、Domain 响应、来源兼容和开关配置命令需要下一批接入。兼容完成、审查待执行 migration 后才可进入 DEV apply、migration list、发布及晴天真实租户验收，不能把本批隔离测试称为已上线。

未来回退先关闭调整开关并保留单据、流水、回执及历史读取；通过前向 migration 修正，禁止删除过账事实或直接覆盖余额。

LightRAG 本轮查询返回 502，未获得额外历史规则；本批依据已确认设计和当前仓库实现，未上传资料或声称知识库同步成功。
