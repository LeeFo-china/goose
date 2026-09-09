# D2.2 手工调整数据库原子命令设计

日期：2026-09-09。承接已确认的[手工调整设计](2026-09-09-warehouse-adjustment-stage-d22-design.md)和首批契约。用户“执行”及此前统一常规确认授权覆盖本批；不扩大到远端apply、开发发布、真实租户加权或Orange。基线 `63b14a02`，既有feature隔离工作树。

## 范围和方案

沿用独立数量差额调整单、submit冻结快照、complete检查版本的方案。持续锁仓会阻塞正常收发，使用最新余额无条件过账则跳过审批快照，本批不采用。这是单个紧耦合数据库命令单元；HTTP/读取RPC/响应类型/Admin/开关配置命令/库存来源读取兼容另批实施，本批没有列表接口。

新migration `20260909134749_warehouse_adjustment_atomic_commands.sql` 由CLI生成，包含BEGIN/COMMIT及短锁超时，不修改历史migration。测试只读本地schema，在无网络一次性PostgreSQL容器内执行新migration与合成夹具；不写源本地库或远端数据库。

## 数据与命令

三表：warehouse_adjustment_orders、warehouse_adjustment_order_items、warehouse_adjustment_command_events；独立WA序号。orders保存tenant/warehouse/id/order_no/status/version/reason/创建更新员工与时间、submitted/completed/cancelled时间；状态draft/submitted/completed/cancelled。items包含adjustment_order_id、tenant、warehouse、line_no、SKU、非零quantity_delta、必填adjustment_reason，提交冻结snapshot_at/book_balance_id/version/quantity/value/unit_cost；完成冻结unit_cost/amount。amount为非负绝对金额，净额按quantity_delta符号计算。成功前unit_cost/amount为空。

所有外键保证租户/仓库/单据/SKU一致；每单1–100行、SKU唯一由命令与约束共同保证；有限numeric及UTF16原因约束；冻结余额身份不是FK，删除重建应被识别为冲突。保存可替换草稿明细，已保存仓库不能改；提交后范围、差额、原因和快照不可改；终态单据/明细及成功回执不可变。

唯一service_role命令：
`command_warehouse_adjustment_order(uuid,uuid,text,integer,jsonb,uuid,uuid,text)`，
参数依次order_id/tenant_id/command/expected_version/payload/actor_user_id/actor_employee_id/idempotency_key。
命令save_draft/submit/complete/cancel；payload不含expected_version，保存仅warehouse_id/reason/items，其他命令严格空对象。返回`{status,order}`，保存status=saved，其余submitted/completed/cancelled；每次成功version+1，新单0→1，已有单据和余额版本耗尽稳定拒绝。

SQL独立匹配首批输入契约，拒绝未知字段、JSON数值、零/负零、正号、指数、前导零、空白换行、超14整数4小数、重复SKU及无效UUID。复用既有只读`__gooes_stocktake_trim`、`__gooes_stocktake_reason_length`、`__gooes_stocktake_uuid_valid`，保持JavaScript trim、UTF16和真实Zod4.4.2语义；不复制通用helper或改变既有语义。

## 冻结和计价

save_draft不读写库存快照或余额。submit检查全部SKU、现存余额和预期数量/金额边界，全部合法后冻结；不写流水、余额或已过账金额。缺失/零余额调增拒绝COST_BASIS_REQUIRED，调减超过现存量拒绝INSUFFICIENT_STOCK，因此本阶段成功提交必有正数量余额，不为缺失余额创建占位行。

complete重新检查身份、权限、开关、SKU和每行余额存在性/ID/version/数量/价值/均价；变化后数值恢复仍冲突，不重抓、不force。两个阶段均用numeric计算：
`new_quantity=book_quantity+quantity_delta`；
`unit_cost=round(book_value/book_quantity,4)`；
清空调减`amount=book_value`，其他`amount=round(abs(quantity_delta)*book_value/book_quantity,2)`；
`new_value=book_value+sign(quantity_delta)*amount`；
新均价为数量为0时0，否则`round(new_value/new_quantity,4)`。
正数量合法零成本允许；数量/价值/成本均需有限、非负且不超numeric(18,4)/(18,2)容量。先验证所有行，再在同一事务冻结最终金额、写每行唯一库存流水、更新余额及其version、单据和回执；任一插入或回执失败全回滚。

新增inventory_transactions.warehouse_adjustment_item_id及复合FK；source_type=warehouse_adjustment_item、source_id=明细ID，adjustment_in/out与数量正负对应，value_delta为signed amount。包装原material_source_check完整表达式，旧分支要求新列NULL；新分支其余五个来源列全NULL且project/cost_category=NULL。来源触发器核对单据状态和冻结数量/成本/金额；不改已有流水/余额或写项目成本、供应商应付、付款、现金台账。

## 安全、幂等和锁

定义inventory.adjustment.manage（保存/提交/取消）与approve（完成），同步Domain；不分配到任何角色或员工。独立warehouse_adjustments_enabled默认false，CHECK要求supplier module_enabled，与采购/领退料/调拨/盘点独立；本批不扩展开关配置命令。

三表强制RLS且撤销PUBLIC/anon/authenticated/service_role直接表权限；序列/helper仅owner，命令仅service_role可执行。每次调用含回放检查active租户、active员工、user绑定、实际数据库权限及显式deny。system_admin的Domain派生权限不是数据库授权，不调整通用认证。

身份权限→严格payload→基于jsonb规范文本的请求指纹（tenant/order/command/version/payload/employee）→actor/key事务锁与已成功回执重放→新业务settings FOR SHARE→warehouse FOR UPDATE→order事务锁/行锁→按SKU排序余额锁。成功回放返回冻结result，在开关关闭后可读；撤权、停用、跨租户或同key异请求仍拒绝。不把等值但不同十进制原文视为同请求。仓库短事务锁保护空余额创建与跨业务竞争；不新增缓存/队列/依赖。

## 验证与回退

真实SQL验证表/ACL/默认关闭/无授权、严格payload、UTF16/UUID/数量边界、全状态、提交失败无部分快照、完成第二行及回执失败全回滚、幂等、来源唯一/不可变、冻结冲突/删除重建/值恢复、缺失及零库存、零成本、清空尾差、数量/金额/成本/版本上限、财务全事实摘要与库存账实一致。两个独立连接实际观察Lock后释放，覆盖两调整冲突、同key仅一次过账、与真实调拨双向竞争、与真实盘点竞争及缺失余额创建期间submit串行化；串行或超时负控不能冒充真竞争。

本批无读取接口，分页与执行计划在读取RPC批次完成。Domain/API契约回归、Domain构建、API完整类型检查、file-size、独立SPEC后质量审查通过后提交推送feature。尚不兼容新来源HTTP读取，不得远端apply或启用；未来回退先关调整开关，保留不可变事实和历史读取，通过前向migration修正，禁止删过账数据或直接覆盖余额。

自检：四命令与首批一致；submit冻结而非save；非零差额均需行原因；无价格输入/期初建账/金额-only；复用只读helper而非通用引擎重写；无自动授权或远端操作。LightRAG本轮仍502，设计依据是当前仓库和已确认方案。
