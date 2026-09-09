# 阶段 D2.2：仓库手工调整设计

日期：2026-09-09。承接已验收D2.1，用户“执行”及此前统一常规确认授权用于本任务内的保守设计与分批实施；不扩大到生产、Orange、额外授权或直接修库。基线a09455c0，仍使用既有feature隔离工作树；D1/D2.1固定release分支不移动。

首批进度：请求契约已实现（`19e64460`），Domain/API回归、类型及构建检查通过，详见[契约验证记录](../../operations/evidence/2026-09-09-warehouse-adjustment-contracts.md)。尚无数据库原子命令、HTTP接入、Admin或DEV发布，不代表D2.2完整功能已完成。

## 1. 范围与方案

推荐独立“数量差额调整单”：每行输入带符号非零quantity_delta，提交时冻结账面快照，确认时按差额过账。它不代表重新清点实物，不复用盘点单或实盘数量字段。每单单一仓库，允许不同SKU一增一减，但每个SKU仅一行且行原因必填。

备选“直接填目标库存”会混淆盘点且易覆盖审批期间正常业务；备选“人工数量/金额/成本均可调”需要额外估价、金额调整和财务策略。本阶段均不采用。仓库既有“无需用户选择库存成本”及独立单据约定来自仓库采购MVP与D2.1设计；LightRAG本轮查询502，未取得额外历史依据。

本轮仅交付状态、展示动作、Domain请求DTO和严格API输入schema；不注册HTTP端点、不加数据库对象/权限/开关、不开发Admin、不apply或发布。后续拆为数据库原子命令、API读取/命令接入、Admin与DEV验收三个批次，各有单独计划。当前无视觉布局决策，不开启可视化设计工具。

## 2. 状态与命令

| 状态 | 可展示动作 |
| --- | --- |
| draft（草稿） | save_draft、submit、cancel |
| submitted（待确认） | complete、cancel |
| completed（已完成）/ cancelled（已取消） | 无 |

新草稿expected_version=0；已存在草稿保存与其余命令用当前正整数版本，成功每次版本+1，最大2147483647，耗尽后拒绝。保存确定仓库、1–100个唯一SKU、必填整单原因及每行差额/原因；既有草稿锁定仓库，修改仓库须取消并新建。

submit在短事务内验证身份、权限、开关、启用同租户仓库/可访问启用SKU及全部明细，冻结余额ID（可空）、版本、数量、价值、平均成本和时刻。数量不足、金额/数量溢出或调增无成本依据在提交时拒绝整单，草稿不产生库存变化。提交后不再编辑差额/范围/原因。

complete再次验证授权与开关，并检查每行余额ID/版本/不存在状态和冻结时一致，才在同一事务过账。任何余额变化，即使数值后来恢复，也拒绝整单；不自动刷新快照、不提供force。正常采购/领退料/调拨/盘点在审批期间不被长期锁仓阻断。冲突单取消后重新建单复核。

未完成两种状态可取消且无库存影响；终态不可修改或删除。已完成纠错用新的反向调整单且重新审批、计价、校验，不保证库存已被其他业务使用后仍可原价反向；需人工核对最新事实，不能覆盖或删除原记录。

## 3. 精度与计价（后续数据库实现）

quantity_delta为十进制字符串，绝对值0.0001至99999999999999.9999，最多14位整数/4位小数，原文精度保留。允许负号，不允许正号、零及负零（含0.0000/-0.0000）、数字JSON、空白/换行、指数、前导零多位整数、NaN/Infinity。根原因reason和每行adjustment_reason去首尾空白后1–500个JS UTF-16 code units；数据库长度规则须与既有库存原因helper一致。

调减按冻结的现存平均成本计价，调减量不得超过数量；清空时取剩余全部价值避免分币残留。调增必须有正数量库存作为成本依据，允许正数量合法零成本；零库存或不存在余额时不允许靠人工价格补建账，不支持金额-only调整或期初建账。

后续数据库使用numeric计算，禁止JS Number参与金额/数量计算；确认后数量/价值不得为负、非有限或超出已有numeric(18,4)/(18,2)容量，任何行失败整单回滚。与现有盘点SQL一致，非清空行绝对金额为round(abs(delta)*book_value/book_quantity,2)，不使用已四舍五入的展示单价参与金额计算；过账单价记录round(book_value/book_quantity,4)。清空调减使用全部剩余价值；新平均成本为round(new_value/new_quantity,4)，清空时为0。

每行唯一库存流水：source_type=warehouse_adjustment_item，对应独立明细FK；quantity_delta>0映射adjustment_in、<0映射adjustment_out。金额符号与数量一致（零成本可为零），来源、仓库、SKU、数量和金额在数据库绑定。整单/明细过账金额、余额、流水、版本及成功回执原子提交。不写项目成本、供应商应付、付款或现金台账，不引入总账库存损益模块。

## 4. 后续授权、幂等与性能边界

拟独立inventory.adjustment.manage（保存/提交/取消）和inventory.adjustment.approve（完成）；读取使用inventory.stock.view，展示动作不能替代授权。定义须通过Domain及migration同步，默认不授权；晴天真实验收缺权时另做精确租户/角色migration，不沿用盘点权限作为调整权限。

拟warehouse_adjustments_enabled默认false，以supplier module_enabled为前置，独立于采购/领退料/调拨/盘点；关闭后禁止新业务写入，保留合法历史读取及已成功幂等请求回执。幂等键沿用Idempotency-Key，主体规范化指纹与动作/目标绑定；同键异请求冲突，未知结果只按原路径/body/key重试；身份/租户/显式deny检查不能被重放绕过。

controller只读HTTP并调用service，service编排领域上下文，repository/RPC访问数据库，错误走error-factory。后续列表与明细均分页默认1/20、最大100，选择器也有界；批量验证避免N+1，必要索引/RLS/触发器/函数/初始化数据均用新migration。沿用设置→仓库→单据→排序SKU余额的短事务锁顺序，验证跨业务竞争和空余额创建竞争。

## 5. 本轮请求契约

拟资源/warehouse-adjustments，/:id/items，命令子路径save-draft、submit、complete、cancel；本轮不注册。Domain仅状态/中文标签/展示动作和两类请求DTO，响应模型由后续真实RPC契约确定。

保存草稿：

```json
{
  "expected_version": 0,
  "warehouse_id": "abcdef00-0000-4000-8000-000000000001",
  "reason": "包装损坏账面纠正",
  "items": [{
    "supplier_sku_id": "abcdef00-0000-4000-8000-000000000002",
    "quantity_delta": "-0.5000",
    "adjustment_reason": "复核破损半箱"
  }]
}
```

其他命令仅{"expected_version":1}。仓库/SKU/路径id均合法UUID；SKU去重忽略UUID字母大小写。根/每行/参数/查询均strict，不静默剔除越权字段。拒绝tenant_id、actor、project、status、账面快照、余额版本、unit_cost、amount、force、实盘counted_quantity和覆盖quantity；quantity_delta仅允许在草稿行中。

列表只允许warehouseId、四个合法status、trim后最多100字符keyword、page/pageSize；明细只允许分页；设置查询仅空对象。与既有PaginationQuerySchema保持一致，不修改公共分页的现有coercion语义。

## 6. 验收与回退

本批验收：Domain根出口/状态/标签/动作；正负精确最小/最大数与原文保留，所有零/负零及非法格式拒绝；混合方向不同SKU允许，1/100行合法，0/101、大小写重复拒绝；根/行原因必填与长度；UUID/版本/严格未知字段；独立列表/明细/设置查询白名单；schema输出可赋给Domain DTO；原盘点/调拨及领退料契约回归、Domain build/API typecheck与build，独立SPEC后质量审查。

后续SQL另验：提交冻结、审批期间变更/值恢复仍冲突、零库存调增拒绝、合法零成本调增、调减不足/清空尾差、numeric边界、每行唯一来源/幂等、注入失败全回滚、权限deny/停用/跨租户/开关、财务隔离、分页执行计划。Admin另验精度/未知请求冻结与重试/只读权限/终态/375px。全部交付后才按已授权DEV流程plan/apply→migration list→固定候选发布→晴天Chrome最小正负调整与反向恢复。

远端回退先关调整开关，保留新增事实与历史读取；权限撤回另写前向限定migration，禁止删已过账审计或直接改余额。本轮纯未接入契约没有远端回退操作。

自检：输入差额与实盘数量不混用；快照明确在submit而非save；全部非零行原因必填；首期不处理金额-only和零库存估价；不新增响应/运行时权限/缓存/依赖；实际可用性须以后续SQL/API/Admin/DEV验收为准。
