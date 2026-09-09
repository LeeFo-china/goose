# 仓库孤儿记录根因追查与修复建议

日期：2026-09-08；最后只读身份／白名单核对时间 13:45:36（Asia/Shanghai）。分支候选 `5585923ee22b25800a5e3808411f3dab44be9fb5`。

## 结论

本轮找到并在本机隔离库复现了**开发 SKU smoke 清理遗漏默认仓库**的代码缺陷；现有 4 条孤儿仓库与该机制吻合。**尚无逐笔历史运行记录证明这四条全部出自该脚本，不能将推断写成已确证的执行来源。**

这也不是“员工 ID 填错”这么简单：四条仓库的原租户、创建／更新员工均不存在，不能替换为当前真实员工。建议先修清理和残留检查，再通过审计留痕、精确白名单 migration 删除这 4 条没有父实体或业务引用的孤儿仓库。**本轮仅制定方案，未改代码、生成活动 migration 或执行任何远端修复。**

[完整脱敏证据](2026-09-08-warehouse-orphan-root-cause.json)；[实施计划与未执行 migration 草案](../../superpowers/plans/2026-09-08-warehouse-orphan-remediation.md)。

## 1. 真实开发库情况

仅使用 gooes-dev／VM-0-11-ubuntu 的现有 supabase-db，只读事务设置 statement_timeout=15s、lock_timeout=3s（适用的查询），身份结果 read_only=on；未连接生产或读取密钥内容。

- 仓库共 5 条。正常 `WH-000001` 所属租户存在、设置存在，审计员工原本为 NULL，不属于异常。
- 异常为 `WH-000004 / WH-000024 / WH-000026 / WH-000032`，各自租户均不存在、供应商设置均不存在、被引用的员工 ID 在任何租户均不存在。
- 四条均为名称“公司仓库”、active、is_default=true、version=1，created_at=updated_at，创建／更新人为相同 ID。创建时间分别为 UTC 2026-09-05 15:49:05、17:20:20、17:40:08，以及 2026-09-06 01:27:26。
- 全库 warehouse_command_events=0；自动建默认仓库的 trigger 不写该命令表，故这些属性与自动创建机制吻合，但仅凭默认名称／无命令记录不能唯一确定创建来源。
- warehouses→tenants／employees 的相关外键 trigger 均 enabled=O（普通模式启用）；不是目前关闭 FK 造成读取异常。
- 9 张直接关联表全部没有引用四个目标：inventory_balances、inventory_transactions、supplier_payable_events、supplier_payment_requests、supplier_payments、supplier_purchase_batches、supplier_purchase_orders、supplier_purchase_requisitions、warehouse_command_events。
- 没有发现 public 普通／分区表中未受 warehouses 外键约束的 warehouse_id 列。此检查不声称扫描了任意 JSON、文本或外部系统中的软引用。
- 迁移历史仍 594 条、最新 `20260908010000`，本轮未应用任何版本。

## 2. 代码数据流

1. [seed](../../../apps/api/src/scripts/supplier-purchasable-sku-smoke-fixture.ts) 165 行向 tenant_supplier_settings 写 module_enabled=true，并设置本次随机生成的 actorEmployeeId。
2. [Stage A migration](../../../supabase/migrations/20260905210000_create_warehouse_foundation.sql) 的 ensure_default_tenant_warehouse 在模块启用时创建“公司仓库”，将该员工写入 created_by／updated_by。
3. [smoke gateway](../../../apps/api/src/scripts/supplier-purchasable-sku-smoke-database.ts) 32 行起先运行 seed 和场景，不包在一个最终 ROLLBACK 的总事务里；cleanup 是单独事务。
4. 同 fixture 文件 226 行起的 cleanup 切 session_replication_role=replica，删除 settings、employees、tenants 等测试对象，却没有删除 warehouses。普通 FK trigger 被临时跳过，父实体可以消失，仓库留下。
5. 275 行起 countSupplierPurchasableSkuSmokeResiduals 同样没有 warehouses 或 warehouse_command_events；gateway 将它的 0 当作 cleanup=true，因此这类遗漏不会被报告。

该 fixture 实现源自 `f38590fc` 等早于仓库基础的提交，仓库自动创建逻辑是后来新增的副作用。问题在清理覆盖面和清理成功判断，不应通过放宽仓库真实业务约束解决。

EXPLAIN gateway 使用 reserve→BEGIN→seed→ROLLBACK，整体回滚能撤销默认仓库；它与独立提交的 smoke cleanup 路径不同。其他使用 replica 的清理工具只能作为相似模式检查，不能未经证据认定它们制造了这四条记录。

## 3. 本地复现证据

复用本机已有 PostgreSQL 17.6 镜像，在 network=none、无映射端口、只读根文件系统、tmpfs 数据目录的临时容器中执行：

- 构造最小 tenants／employees／settings 依赖。
- 从原 Stage A migration 提取**实际 warehouses DDL 与默认仓库 trigger 函数**，没有换成模拟的默认创建行为。
- 启用模块后实际生成 1 条仓库；普通模式删除员工被 FK 拒绝。
- 复现原 cleanup 的相关顺序：replica→删除 settings／employees／tenants→origin。此步骤是相同关键 SQL 的最小复现，不冒充完整 Bun smoke 已运行。
- 得到仓库=1、租户=0、员工=0、孤儿=1，而 FK 目录仍 validated=true。
- 重新添加相同员工外键，触发 foreign_key_violation，重现完整恢复时的失败机制。
- 事务回滚、临时容器自动移除，exit 0；未改本机现有 supabase_db_gooes 或远端数据库。

```text
default_warehouse_rows=1
parent_tenant_rows=0
parent_employee_rows=0
orphan_warehouses=1
fk_catalog_validated=true
REPRO_CONFIRMED: omitted warehouse cleanup leaves orphan; restore FK rejects it
```

## 4. 历史归因的边界

- 在当前仓库、主工作区已有相关 artifacts 中查目标 UUID，未命中。
- 对开发数据库容器 UTC 2026-09-05 14:00 至 2026-09-06 04:00 的现存日志按目标 UUID 过滤，匹配 0；没有输出原始 SQL 或其他业务内容。
- 当前 log_statement=ddl、logging_collector=off，不能据“没有 DML 日志”断言没有执行过清理，也无法凭当前设置还原历史日志策略。
- 仓库基础发布证据原只读计数为 1，而当前为 5；支持后来新增的判断，但不是特定脚本／执行人的审计证明。

因此，已确证的是数据孤儿状态、清理代码缺陷及其可复现机制；四条记录各自的历史命令来源仍未知。方案不要求编造这一来源，删除审计应明确写“经核查无引用的孤儿”，不能伪称“已确认测试记录”。

## 5. 修复建议与执行门禁

详见实施计划，核心顺序：

1. smoke 清理先恢复 origin，在父实体删除前定向清理本次 fixture 的未改动默认仓库；有业务引用时让 FK 拒绝并回滚，不清理事实。残留计数同时包含仓库和仓库命令。
2. 独立修复 migration 使用 4 个明确 ID、原 tenant／employee ID、整行 MD5；有目标缺失、行变化、父实体恢复、新依赖或业务引用即停止。
3. 删除前将完整原行和修复上下文写入现有 platform_audit_logs，target_tenant_id 保持 NULL、原失效 ID 放 metadata，避免新审计再次引用不存在租户；不伪造业务操作员工。
4. 用户需明确确认“审计归档并删除这 4 条孤儿仓库”及开发 apply。此前只有追查和方案授权，本轮没有删除授权。
5. 修复候选不得夹带 C 的 4 条迁移；新修复时间戳晚于原 C，后续合并 C 时重新审查执行顺序和完整差集，不改已应用编号。
6. 修复后重新备份并完整恢复，保留旧失败归档；恢复成功并逐表核对之前，C 发布继续停止。

这是定向删除，不能把孤儿重新插回当作“回滚成功”；若后续确认需恢复原实体，须先制定父实体恢复方案，再通过前向 migration 实施。原行审计和原备份均须保留。

后续实施检查点：用户随后确认“执行”，本地修复及 migration 已完成，见 [2026-09-08 实施证据](2026-09-08-warehouse-orphan-remediation.md)。以上为原诊断时状态；截至新检查点仍未执行真实数据删除／migration apply，等待固定文件和 hash 的最终确认。
