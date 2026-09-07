# 库存 Stage B：执行 1–4 进度与验收边界

本记录接续 [第一批阻断修复](./2026-09-07-warehouse-stage-b-blockers.md)。
工作区：`feature/warehouse-procurement-inventory-stage-b`，起点 `951d1686`。

## 总目标与状态

用户授权执行采购收货、财务、Admin、完整验收后合并清理四步。
**四步尚未全部完成，禁止合并 main、开放补货开关或发布。**

- [ ] 1. 采购、收货双目的地闭环：API 适配实施中；目录、草稿及订单列表 SQL 已有真实 PostgreSQL 测试；审批拆单、工作流权限和完整收货仍需贯通。
- [ ] 2. 仓库应付、付款申请、审批、付款记录；仓库采购不写项目成本/占用；原项目财务回归。
- [ ] 3. Admin 库存余额、流水、菜单、补货入口及目的地展示；后端未验收不开放入口。
- [ ] 4. 开发库目标及 migration 清单确认、完整历史升级与 Local/Remote 对齐、并发/幂等/尾差/租户隔离/性能/原项目回归、最终审查、合并和安全清理。

生产发布不包含在本次授权内。未修改 orange、main 工作区或生产配置。

## 本轮 SQL 进展

新增 migration 由 `supabase migration new` 创建，未应用到任何已有数据库：

1. `20260907052559_enable_warehouse_purchase_batch_drafts.sql`
   - 目录、草稿 RPC 末尾追加目的地与仓库参数，保留旧项目参数默认值和历史请求指纹。
   - 仓库校验租户开关、所属租户、启用状态；草稿按 settings → warehouse → batch 加锁，保留驳回后编辑分支。
   - 仓库幂等指纹包含仓库目的地；撤销内部 helper 的业务角色调用权，公开入口只授权 service_role。
   - 使用有匹配数量校验的 `pg_get_functiondef` 更新有效实现，遇到定义漂移则整份 migration 失败，不覆盖后续历史修复。
2. `20260907053628_list_warehouse_purchase_orders.sql`
   - 修复订单 scope trigger 强制查项目导致仓库订单被拒绝的问题；仓库按 tenant + warehouse 校验。
   - 将目的地和仓库 ID 纳入订单不可变保护，不放宽原供应商、状态、版本及项目保护。
   - 订单列表明确授权后才包含仓库；空项目范围仍可返回有权查看的仓库，但不能因此泄露隐藏项目。
   - 默认旧调用只返回项目采购；仓库订单返回 `project=null` 和仓库展示对象；保留分页及履约筛选。

以上不表示提交审批/拆单/付款 RPC 已适配。

## 隔离 PostgreSQL 证据

运行：

```bash
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/draft-destination.sql \
  scripts/fixtures/warehouse-stage-b/save-draft.sql \
  scripts/fixtures/warehouse-stage-b/order-list.sql
```

- 已只读核对本地 `supabase_db_gooes`：迁移基线 `20260828160000`，527 条记录。
- 脚本仅从该本地容器读取 schema/角色/函数授权和迁移版本，不读取业务行或凭据，不写原库。
- 新建随机 UUID 名称的一次性 PostgreSQL 容器，`--network none`、不发布端口、不挂载卷；使用合成数据，退出时只停止并自动删除该测试容器。
- 从基线回放后续采购领域 migration（文件名 supplier/warehouse/inventory/procurement）；保留函数授权，未跳过失败 SQL。
- 完整历史中的定向业务数据修复依赖真实租户数据，不能在仅结构快照上执行。因此此脚本明确**不是完整历史升级、开发库 migration 对齐或 API 验收**。
- 已复现并消除的失败：仓库目录参数不存在、仓库草稿参数不存在、仓库订单触发器要求项目、仓库订单列表参数不存在。
- 三组 SQL fixture 已通过：目录开关/互斥/停用/租户边界；真实商品价格下草稿/幂等/旧项目兼容；订单可见性/分页/目的地对象。
- 草稿扩展检查还覆盖原项目指纹公式、驳回后编辑、仅更换仓库的幂等冲突、公开及内部函数权限、RPC 无歧义重载。
- 订单不可变专项增加“仅更换同租户仓库并正常递增版本”的断言，避免由其他旧约束误判通过。
- 验证脚本 TypeScript 检查通过；未将这些局部证据等同于完整 Stage B 验收。

## 后续数据库适配清单

- 批次 submit/review：保留价格、供应商、分类校验；仓库预算状态明确 `not_applicable`，不产生项目预算占用；子申请单和订单复制相同目的地。
- `convert_supplier_purchase_requisition_for_batch`、`submit_supplier_purchase_order`：移除仅项目假设，保留冻结商业条款及身份校验。
- 工作流 submit/preflight/review/withdraw/task-list：仓库上下文冻结 `destination_type/warehouse_id/project_id=null`；仓库审批保留节点权限并要求仓库管理权限；不调用项目数据范围。
- 默认采购审批图的预算分支是 `budget_status != over_budget`，可承接 `not_applicable`；仍需扩展上下文校验、审批终结判断和权限候选检查，并用真实工作流验证。
- 收货 wrapper、历史项目收货、完整库存/应付事务、并发与回滚验证。
- 付款各查询和命令仍有项目非空/项目 JOIN 假设，须单独完成第二步。
- 库存列表 RPC 的扫描/排序边界及 EXPLAIN 尚待验证。

## 合并门槛

各 API/SQL/Admin 单元的双阶段审查不能替代最终验收；本文件是执行记录，不是放行单。
开发库应用前另行确认确切目标及全部待执行 migration，应用后必须核对 Local/Remote。
发现本地草稿版本已在目标库应用时，只能新增修正 migration，不改已应用历史。
账务事实问题通过前向修正/冲正处理，不能删账或直接远端修库。
