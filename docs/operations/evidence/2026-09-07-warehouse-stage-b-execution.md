# 库存 Stage B：执行 1–4 进度与验收边界

本记录接续 [第一批阻断修复](./2026-09-07-warehouse-stage-b-blockers.md)。
工作区：`feature/warehouse-procurement-inventory-stage-b`，起点 `951d1686`。

已提交：目录/草稿/订单读取 `5d4f7bd1`；采购 API 和冻结历史权限 `958dced3`。

## 总目标与状态

用户授权执行采购收货、财务、Admin、完整验收后合并清理四步。
**四步尚未全部完成，禁止合并 main、开放补货开关或发布。**

- [ ] 1. 采购、收货双目的地闭环：API 规格和质量复核通过；目录、草稿、订单列表及审批拆单会计核心已有真实 PostgreSQL 测试；工作流权限和完整收货仍需贯通。
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

3. `20260907055503_enable_warehouse_purchase_batch_accounting_commands.sql`
   - 复用有效 submit/review 实现，仓库预算为 `not_applicable`、快照为空，不写项目预算占用；子申请单和采购订单传递相同目的地。
   - 保留供应商、价格、财务分类、商业条款、版本号和禁止自审的校验；原项目提交/审批仍创建并转换预算占用。
   - 仓库会计核心禁止业务角色直接调用；原公开 submit/review 保留项目签名，仓库首次执行与重复请求均不能绕过工作流。
   - 修改工作流内部调用目标，但仓库工作流上下文、候选人、权限和审批终结仍待下一单元适配。目前不能通过真实工作流完成仓库采购。
   - 隔离 PostgreSQL 下仓库提交、驳回、审批转订单及旧项目采购通过；本单元独立规格和质量审查通过。
   - 质量复核发现 review wrapper 已持 batch 锁再进入新核心锁 settings，与 submit 的顺序相反。双会话真实项目工作流复现 `deadlock detected` 后，修复外层和内部两个 wrapper，统一 settings → warehouse → batch 顺序；同一测试重跑通过。

以上不表示完整工作流、收货或付款 RPC 已验收。

## 隔离 PostgreSQL 证据

运行：

```bash
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/draft-destination.sql \
  scripts/fixtures/warehouse-stage-b/save-draft.sql \
  scripts/fixtures/warehouse-stage-b/order-list.sql \
  scripts/fixtures/warehouse-stage-b/batch-accounting.sql \
  scripts/fixtures/warehouse-stage-b/workflow-lock-order.sql
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
- 新增会计核心 fixture：真实商品/价格下保存→提交→审批→已提交采购订单，检查仓库目的地、空项目预算占用、旧项目预算占用转换。
- 同组覆盖开关关闭、仓库停用、禁止自审、驳回、提交/审批重试不重复拆单、legacy 入口不能执行或重放仓库命令、内部函数 ACL、项目不能使用仓库预算状态。
- `workflow-lock-order.sql` 只在一次性容器提交合成数据，使用 dblink 经容器内 `/tmp` Unix socket 打开两个本地会话（无外网连接）。实际观察 review 进入 Lock wait 后并发调用真实 submit；重复提交按预期拒绝，review 完成且仅有一张已提交订单和一条已转换项目占用。额外检查两个有效 wrapper 的锁顺序。
- 五组 fixture 最新同一 runner 重跑全部通过，独立质量复核也重跑双会话 fixture 通过。这个测试只覆盖项目 review/submit 锁序，不代表收货、库存或付款的所有并发场景已验收。

## API 复核进度

- API 规格复核通过；独立复核者运行 8 个针对性文件、70 项测试并通过类型检查、文件大小检查。
- 已修复通用审批幂等重放使用冻结目的地、历史任务列表/卡片使用冻结目的地、state/timeline 同时校验当前批次和实际返回实例、仓库工作流关闭后禁止退回 legacy 提交/审批。
- 主代理另行重跑 7 个针对性文件、41 项测试、API 类型检查和文件大小检查，全部通过。
- 提交前主代理按文件独立重跑全部 21 个变更测试文件，共 155 项通过；API 类型检查、构建（972 个模块）及文件大小检查通过。需环境初始化的测试使用指向 `127.0.0.1:1` 的虚拟配置，不使用真实服务凭据；首次未提供虚拟配置时的缺少环境变量失败不作为业务失败或通过证据。
- 质量复核发现历史卡片仍泄露当前批次的金额/数量/申请人。修复后历史卡片保留冻结目的地，只用冻结申请人 ID，缺失的历史金额/数量/提交时间不再从当前批次补齐；待办卡片维持现有展示。项目→仓库、仓库→项目、项目 A→隐藏项目 B 均有回归测试。独立质量复核重跑 16 项测试并重新执行泄露复现，通过。
- PostgreSQL fallback 任务列表的冻结上下文和权限适配尚未完成；这些 API 测试不能替代真实 RPC 联调。

## 后续数据库适配清单

- 批次 submit/review、子申请单转订单和订单提交的会计核心：已完成隔离测试和双阶段审查；仍需用真实仓库工作流贯通验证。
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
