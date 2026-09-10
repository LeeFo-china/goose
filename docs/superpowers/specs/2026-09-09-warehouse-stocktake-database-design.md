# D2.1 盘点数据库命令设计

承接 `2026-09-09-warehouse-stocktake-stage-d2-design.md` 第2–4节。用户“执行”及本任务统一常规确认授权覆盖本批；不扩大到开发/生产数据库操作、真实授权、Orange或手工调整。

本批完成（`8e2937ed`、`d5a526dc`）：六个数据库原子命令、Domain权限定义和真实SQL夹具；主线程10个SQL夹具含5组真实锁竞争、Domain23项/API41项、构建及类型检查通过，SPEC复审和独立质量审查通过。详见 `../../operations/evidence/2026-09-09-warehouse-stocktake-database.md`。未远端apply或开放盘点入口。

## 方案与范围

继续采用开始冻结快照、确认检查版本的乐观盘点；长期锁仓影响收货和领退料，按最新库存直接覆盖会吞掉期间业务，均不采用。本批实现一个紧耦合数据库命令单元及真实SQL测试；有界查询RPC、响应类型、API/Admin和开发发布在后续接入批次交付。本批不新增列表接口。

新增盘点单、明细、不可变命令回执，使用既有库存流水和余额。不改已发布migration。通过CLI生成 `20260909064815_warehouse_stocktake_atomic_commands.sql`，事务化应用；只在无网络临时PostgreSQL内验证，不在源本地库或远端运行DDL/DML。

## 具体契约

`command_warehouse_stocktake_order(uuid,uuid,text,integer,jsonb,uuid,uuid,text)` 与调拨参数顺序一致：order/tenant/command/expected_version/payload/user/employee/key。命令为save_draft/start/record_counts/submit/complete/cancel。payload不含expected_version，严格复用已交付请求契约。返回 `{status,order}`：save_draft为saved，start和record_counts为counting，其余为目标状态。成功结果冻结在回执，重放不再读取当前业务状态。

严格复用包括已安装Zod的UUID版本/variant规则（nil/max例外），以及JavaScript UTF-16长度上限：原因在trim后最多500个UTF-16单位，不把PostgreSQL code-point字符数误当API长度。不得截断输入，也不放宽API契约。

首次保存后仓库归属不可变，草稿可重选1–100个SKU、修改原因；改仓需取消重建。start冻结每行snapshot_at、book_balance_id/version（不存在时两者空）、book_quantity/value/unit_cost；不得补建零余额。counted_quantity空表示未盘，record_counts只更新所选子集，非零差异必须有行原因；submit要求全部已盘。开始后范围、账面快照不可修改；终态单据/明细不可变。record_counts即使实盘为0也不影响库存。

complete锁住仓库和现有余额后，逐行检验存在性、余额ID、版本以及冻结数值。数量恢复但版本变化也拒绝；任一行冲突全单不落地，无force。计价使用未变化余额的value/quantity，盘亏清零使用全部剩余价值，其余差额按均价算金额并round到2位；金额/数量/成本溢出提前稳定报错。零库存正盘盈阻止，无差异不存在余额可完成且不造余额行。完成冻结difference_quantity、unit_cost、amount；无差异冻结0但不写零流水。

明细amount为非负绝对金额，difference_quantity保留正负方向；流水value_delta按方向取正负amount。后续净额汇总须按difference_quantity的符号计算，不能直接把所有明细amount相加当净损益。

新增流水列warehouse_stocktake_item_id，复合FK绑定明细/租户/仓库/SKU；source_type=warehouse_stocktake_item、source_id等于该列、adjustment_in/out符号与冻结差额及金额一致，既有来源新列必须为空，新来源原四个来源列必须为空，project/cost_category为空。唯一来源约束、库存事实不可变规则继续有效。SQL触发器验证来源明细冻结值，防止错误方向/数量/金额插入。

## 安全和锁顺序

新表强制RLS，PUBLIC/anon/authenticated/service_role无直接表写权限；命令只有service_role可执行，helper仅owner。每次调用（含回放）验证active租户、active员工与user绑定、当前权限（显式deny生效）。新增inventory.stocktake.manage/approve定义并同步Domain，但不分配到任何角色/员工。

现有API `authorization/legacy/context-builder.ts` 会为system_admin派生Domain全量权限，这不等于数据库已有授权；本批不修改通用认证，也没有盘点路由。后续API/UI接入须以数据库有效权限为最终判据，不能因派生权限宣称任意管理员可盘点，不能沿用D1晴天授权扩大D2权限。

warehouse_stocktakes_enabled默认false，CHECK要求module_enabled。设置→仓库→单据→按SKU排序余额锁，幂等key锁在最前，兼容收货/领退料/调拨。先认证和权限，再幂等回放；新业务才检查开关和仓库可用状态。成功回放在开关关闭后保留，但身份停用/权限撤销后拒绝。

## 验证与发布边界

真实SQL覆盖契约/ACL、全流程、未盘与0、条件原因、计价/尾差/无成本依据、异常全回滚、幂等/版本/越权/关闭开关、不可变/来源约束、不存在及版本变化。独立连接需实际观察Lock等待，验证两单冲突、同key一次过账、与真实调拨竞争及缺失余额被创建竞争。验证项目成本/应付/付款/现金完整事实不变，既有领退料和调拨回归。

这不是兼容发布：新的库存来源尚未接入API读取，且开关配置命令未扩展，因此不得远端apply/启用。未来回退采用关闭独立开关、保留单据/流水/回执、前向migration修正；已经过账的数据不删表或覆盖库存。

自检：命令输入与上批DTO一致，无自动授权/猜价/重抓快照/跨项目财务影响；并发锁只是短事务，不是持续锁仓。查询分页验收明确留在新增查询RPC的接入批次。
