# D2.1 盘点后端接入验证记录

日期：2026-09-09；实施前基线 a43f5349，设计 620f53a8，计划 aeb9a23d。D2.1后端接入本批完成，最终代码 e3766666；下文保留初审问题和实际验证过程，不代表Admin、远端apply或发布完成。

## 实施前检查

复用隔离工作树 `warehouse-project-material-stage-c` / `feature/warehouse-transfer-admin-mainline`，起点干净。固定 D1 release 分支仍为 `710b332282b2f10b2f561b20db197e5f39a8a6eb`。根工作区已有 `.artifacts/`、`docs/marketing/` 未跟踪内容，未修改。Orange 未访问或修改。

GoodCMS RAG 查询失败：login/server 502。依据本仓库 D1 已验收代码与 D2 命令设计。

父代理基线验证：

- Domain permission/warehouse-stocktake：23 pass，280 assertions；Domain build 退出0，149504 bytes，外部 Zod identity 检查通过。
- API stocktake schema + inventory repository：27 pass，257 assertions；API typecheck 退出0。
- 扩展 C/D1/平台开关/路由回归：97 pass、1 fail、464 assertions。失败为 `supplier-rollout-settings.test.ts` 的 `normalizes invalid tenant-visible combinations fail closed`：实际输出含 `warehouse_transfers_enabled:false`，旧 disabled 期望对象遗漏该字段。已用 `git show a43f5349` 核实生产和测试均在本批之前如此。根因为 D1 开关扩展未同步该旧测试期望；不删除正确的生产关闭字段。本批 Task 3 添加盘点开关时同步维护完整关闭期望和独立开关依赖断言，再重新验证。

## Task 1：有界读取

实现提交 `cb910dce`，测试补充 `69451baf`，CLI 新建 `20260909080239_warehouse_stocktake_read_models.sql`，四个读取 RPC 及两个 SQL 夹具。实施代理先验证缺少 settings RPC 的预期 RED，再实现。

父代理独立执行：

```bash
bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/material-workflow.sql scripts/fixtures/warehouse-stage-b/transfer-workflow.sql scripts/fixtures/warehouse-stage-b/stocktake-workflow.sql scripts/fixtures/warehouse-stage-b/stocktake-reads.sql scripts/fixtures/warehouse-stage-b/stocktake-read-performance.sql
```

初版及 `69451baf` 父代理独立运行均退出0，基线20260828160000/527项；所有采购域待迁移及五个夹具通过。实际 RPC 查询 EXPLAIN 在10,000新增单据/20,000明细下，无筛选、warehouse、warehouse+status、缓存计划四种场景均访问20单据、40明细（2行×20次索引查询）；未新增索引，复用已有索引，函数固定custom plan。SQL输出包含真实草稿NULL明细和完成单据字符串字段，留待 Task 2 严格响应解析联合验证。

SPEC初审提出P2测试缺口（不是生产SQL缺陷）：精确正负/零数量、零侧金额、单项角色、模块关闭后全部历史读、跨租户明细和UTF16关键词边界。`69451baf`补齐并获独立SPEC复审通过；混合单真实返回 gain_amount="15.00"、loss_amount="0.01"，三行 difference_quantity="-0.1000"/"1.0000"/"0.0000"，草稿对应字段保持NULL。

独立质量审查未发现Critical/Important。提出Minor：SQL测试中 `<>` 遇缺字段会返回NULL，应使用 `IS DISTINCT FROM` 防止断言漏检；同时建议列表Summary和详情Summary按ID比较。`fd8f5dbb` 补齐，实施侧五夹具重新通过；独立质量复审关闭全部问题。Task 1 已完成。

## Task 2：API 接入

首版实现 `48c148d0`。父代理检查发现 HTTP 测试仅覆盖注册，完整 HTTP请求、权限组合、system_admin实际SQL拒绝、精度/分页等要求尚未充分覆盖，已退回补充，未以该提交宣称 Task 2 完成。

父代理将真实隔离SQL的混合完成单和草稿输出送入新严格响应解析器，正向保持全部字段及数值；112项字段删除/未知字段/数字型numeric/NaN/Infinity/指数变异均被拒绝。这是 SQL 输出→解析器联合验证，不是 PostgREST传输/登录E2E。

另在无预先注入Supabase变量的普通测试命令下，首版出现43 pass/4 fail/2 errors：repo/service测试顶层静态import提前初始化Supabase，而测试环境值只在后加载的controller文件设置。首先报缺 SUPABASE_URL，后续模块未初始化是连锁错误。根因在测试初始化顺序，要求各测试文件独立设置合成环境再动态import，不能给生产客户端加假值或依赖测试顺序。

`a770d55b`补充验收测试，并由各文件显式导入的共享测试fixture先初始化合成环境；未改生产Supabase配置。父代理普通Bun命令组合运行58 pass、415 assertions，API typecheck退出0；仓储6项、服务5项、HTTP2项、system_admin1项分别独立启动进程也全部通过。Domain2项/6 assertions及构建通过，149504 bytes、Zod identity检查通过。当前解析器再次通过真实SQL正向和112项负向变异检查。

流程说明：实施侧有Domain响应类型缺失、状态/审计时间不一致的RED记录；部分HTTP/service/repository验收用例在复核后才补入，不能称为每项行为均已完成测试先行。验证结论依据最终实际运行及独立审查。

独立SPEC复现两个P2：POST有效命令带 `?force=true` 仍200（runCommand漏校验query）；Summary parser接受draft非NULL金额和completed的NULL金额（只检查nullable字段类型，漏状态关联）。实际SQL金额正确。要求先加入失败用例，再复用空query schema及Summary状态关联校验修复，不更改计价和原始命令回执。

`23703fa2`按上述两个复现先RED后GREEN修复。父代理重新运行六文件59 pass、443 assertions，API typecheck退出0；真实SQL正向及112项负向再次通过。独立SPEC复审通过，并自行运行相关repository/controller测试9 pass、115 assertions。

独立质量审查无Critical/Important，两个Minor：actor fixture的租户/用户/员工应使用不同UUID以检出接线错误；record_counts模拟回执的order应为counting而非draft。生产映射正确，要求收尾补齐测试再关闭本项。

`809a3f14`完成两处fixture修正。父代理在 apps/api 重跑六文件59 pass、444 assertions，API typecheck退出0。独立质量复审相关三文件13 pass、115 assertions，确认两个Minor均关闭。Task 2完成，开始Task 3；本项独立SPEC与质量审查全部通过。

## Task 3：库存来源和平台开关

首版 `563c4a75` 包含CLI新建的 `20260909085915_warehouse_stocktake_inventory_sources.sql`、`20260909085927_warehouse_stocktake_rollout_command.sql`、来源严格DTO、设置输入/两处读模型/有效值/同版本合并/JSON命令参数和平台审计状态投影。省略新字段仍走原typed参数；旧回执字段可缺失而不default。前置真实回执夹具在已有 `20260909064815` 新增列之前运行，显式断言当时列和回执字段都不存在。

实施侧TS首组RED为31 pass/5 fail（缺盘点来源与开关），实现后36 pass；补充设置repo/service/audit后五文件58 pass、210 assertions。SQL初次失败为夹具调用不存在的 `jsonb_object_length`，不是业务预期RED；改用真实PostgreSQL函数后通过，不能将此记为业务测试先行。

父代理在 `563c4a75` 独立组合28个API相关文件：244 pass、1478 assertions；typecheck及API build退出0（978 modules、5.12 MB）。独立17夹具完整链退出0：material-contract/workflow/security/rollout；transfer-contract/workflow/security/inventory-sources/rollout；stocktake-contract/workflow/security/reads/read-performance/inventory-sources/rollout/concurrency。五组实际锁等待、负控、最终全租户余额/流水和财务隔离仍通过；临时容器已清理。此次输出再次送入严格解析器，草稿NULL、混合差异与金额正向保持，112项负向变异全部拒绝。

独立SPEC仍拒绝验收首版，原因是测试证据不足：来源性能只有110个真实完成单，缺明确的10000额外单据/明细干扰，且没有计划节点证据就将预算放宽为2×page；来源真实RPC仅检查至少两行和对象键，不足以证明两个方向及逐条精确单号、筛选/稳定分页/确切total。生产来源绑定和设置链路静态未发现缺陷。已要求补齐这些验收、输出计划节点，并补直接的false/null/number/旧回执缺字段TS断言后重新审查；不以首版所有测试GREEN宣称Task 3完成。

`e3cafc8c`仅补充测试/夹具，未修改首版生产语义。独立SPEC复审关闭两项阻断（另独立TS两文件9 pass、60 assertions）。父代理再次运行28个API文件244 pass、1484 assertions，Domain六文件28 pass、302 assertions，API typecheck/API build/Domain build全部退出0。17个SQL夹具完整链再次退出0，恢复基线527项，新增三份本批migration和既有盘点命令migration均在临时库成功应用；容器清理完成。

最终来源EXPLAIN实际有10000额外draft单据及10000明细干扰，110个真实命令生成完成流水。每个场景仅各一个盘点明细/单据Index Scan节点，索引分别 `warehouse_stocktake_order_items_pkey`、`warehouse_stocktake_orders_id_tenant_id_warehouse_id_key`；removed/recheck均0，预算恢复每relation≤实际page，没有2倍放宽：

| 实际页行数 | 明细loops×rows | 单据loops×rows |
|---|---|---|
| 1 | 1×1 | 1×1 |
| 20 | 20×1 | 20×1 |
| 100 | 100×1 | 100×1 |
| 0（空页） | 0×0 | 0×0 |

父代理新联合检查：真实SQL新设置、pre-column typed/JSON旧设置分别送入平台和租户两个SettingsSchema，全部deepEqual；新盘点true保持，旧回执缺字段仍不补写。实际SQL六条盘盈/盘亏库存row通过InventoryRepository的严格解析后逐字段一致（分页外壳由验证代码构造，本项仅证明真实row契约，不冒充HTTP分页验收）。盘点summary/items正向及112项异常变异再次通过。这些是隔离SQL输出与API解析器联测，不是PostgREST传输或浏览器登录测试。

最终并发五组仍实际观察到B等A：two-outdated 640/641 transactionid→SNAPSHOT_CONFLICT；same-key 642/643 advisory→同一完成回执；transfer-first 644/645 transactionid→SNAPSHOT_CONFLICT；stocktake-first 646/647 transactionid→completed；absent-created 648/649 transactionid→SNAPSHOT_CONFLICT。blocking_pids均包含A，串行/超时负控与最终全租户余额/流水/财务快照检查通过。整批独立质量审查进行中。

整批独立质量审查（覆盖a43f5349..e3cafc8c）无Critical/Important，审查者亲跑8文件72 pass、397 assertions。仅一处Minor为盘点错误仍使用“调拨”来源诊断文案。`e3766666`先加入DB_ERROR.details精确断言得到24 pass/1 fail，再泛化为“库存流水类型与来源单据不一致”，25 pass/64 assertions；独立质量复审亲跑相同25项并关闭唯一Minor。父代理最终再次运行完整API28文件244 pass、1485 assertions、typecheck和API build退出0。最后提交仅改文案及断言，无SQL/校验逻辑变化，SQL结论采用上述e3cafc8c最后完整17夹具运行。Task 3和整批质量门禁已通过，无未解决审查项。

## 跨模块静态回归

Task 2收尾后，父代理额外执行API `bun run build`，退出0，978 modules，5.12 MB。Domain permission/stocktake/transfer/material/warehouse/inventory六文件28 pass、302 assertions，构建退出0（149504 bytes，external Zod identity通过）。领退料/调拨schema、repository、service、HTTP及调拨system_admin九文件76 pass、541 assertions。Task 3会修改来源及设置，最终仍须刷新受影响测试，不能用本次中间结果替代其验收。

## 最终复验命令

API命令在 `apps/api` 执行，SQL命令在本隔离工作树根目录执行；不运行会写源本地库的旧 database.test 文件。

```sh
bun test \
  src/schema/warehouse-stocktakes.test.ts \
  src/repositories/warehouse-stocktakes.test.ts \
  src/services/warehouse-stocktakes.test.ts \
  src/controllers/warehouse-stocktake-routes.test.ts \
  src/services/authorization/system-admin-warehouse-stocktake-permissions.test.ts \
  src/services/tenant-service-capability-map.test.ts \
  src/schema/warehouse-materials.test.ts \
  src/schema/warehouse-transfers.test.ts \
  src/repositories/warehouse-materials.test.ts \
  src/repositories/warehouse-transfers.test.ts \
  src/services/warehouse-materials.test.ts \
  src/services/warehouse-transfers.test.ts \
  src/controllers/warehouse-material-routes.test.ts \
  src/controllers/warehouse-transfer-routes.test.ts \
  src/services/authorization/system-admin-warehouse-transfer-permissions.test.ts \
  src/repositories/inventory.test.ts \
  src/services/supplier-rollout-settings.test.ts \
  src/services/warehouse-transfer-settings.test.ts \
  src/repositories/platform-supplier-settings.regression.test.ts \
  src/services/platform-suppliers.regression.test.ts \
  src/schema/supplier-settings-command.regression.test.ts \
  src/schema/tenant-suppliers.test.ts \
  src/schema/inventory.test.ts \
  src/repositories/platform-suppliers.test.ts \
  src/services/platform-suppliers.test.ts \
  src/services/inventory.test.ts \
  src/controllers/platform-suppliers/routes.test.ts \
  src/controllers/inventory/routes.test.ts
bun run typecheck
bun run build
```

```sh
bun test packages/domain/src/permission.test.ts packages/domain/src/warehouse-stocktake.test.ts packages/domain/src/warehouse-transfer.test.ts packages/domain/src/warehouse-material.test.ts packages/domain/src/warehouse.test.ts packages/domain/src/inventory.test.ts
bun run --cwd packages/domain build
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/material-contract.sql \
  scripts/fixtures/warehouse-stage-b/material-workflow.sql \
  scripts/fixtures/warehouse-stage-b/material-security.sql \
  scripts/fixtures/warehouse-stage-b/material-rollout.sql \
  scripts/fixtures/warehouse-stage-b/transfer-contract.sql \
  scripts/fixtures/warehouse-stage-b/transfer-workflow.sql \
  scripts/fixtures/warehouse-stage-b/transfer-security.sql \
  scripts/fixtures/warehouse-stage-b/transfer-inventory-sources.sql \
  scripts/fixtures/warehouse-stage-b/transfer-rollout.sql \
  scripts/fixtures/warehouse-stage-b/stocktake-contract.sql \
  scripts/fixtures/warehouse-stage-b/stocktake-workflow.sql \
  scripts/fixtures/warehouse-stage-b/stocktake-security.sql \
  scripts/fixtures/warehouse-stage-b/stocktake-reads.sql \
  scripts/fixtures/warehouse-stage-b/stocktake-read-performance.sql \
  scripts/fixtures/warehouse-stage-b/stocktake-inventory-sources.sql \
  scripts/fixtures/warehouse-stage-b/stocktake-rollout.sql \
  scripts/fixtures/warehouse-stage-b/stocktake-concurrency.sql
```

## 分支交付

代码 `e3766666` 已推送 `origin/feature/warehouse-transfer-admin-mainline`（原远端a43f5349）。沿用现有linked worktree并保留分支；总体D2设计和本批计划同步进度，本证据作为最终文档归档。固定D1 release指针复核仍为 `710b332282b2f10b2f561b20db197e5f39a8a6eb`；没有PR、merge或workflow dispatch。交付前最后检查文档推送后的HEAD/origin一致和工作树clean，未将正常feature push当作DEV发布。

独立分项SPEC→quality及最终整批审查，实际促成了严格POST query、完成金额状态关联、身份fixture区分、万行来源性能和精确历史回执等补强；复用隔离工作树与完成前验证，未扩展到真实数据操作。

## 验证边界

本批 SQL runner 仅从本地源容器读取 schema/元数据，在无网络临时 PostgreSQL 测试库应用采购域 migration 和合成数据。已有 runner 使用 SQL_ASCII；不是完整历史升级、真实 DEV 或浏览器登录验收。没有 apply 远端 migration、开启晴天盘点、增授员工/角色权限或发布服务。Admin 盘点页面、来源展示/跳转及平台开关控件仍属于后续批次；真实开放前必须一起接入验证，不能把后端 source_document 扩展单独作为 UI 已完成的证据。

下一批已只读核对的Admin接入点：`components/inventory/inventory-types.ts` 和 `inventory-table.tsx` 尚无盘点来源分支；平台 `components/suppliers/supplier-types.ts`、`supplier-settings-api.ts` 以及 `components/platform-tenants/tenant-supplier-settings-rules.ts`、`tenant-supplier-settings-card.tsx` 尚无盘点字段/控件。尤其现有来源组件在调拨、领退料之外按收货来源渲染，不能先开放真实盘点再补UI。后续需一并加入页面、权限/开关交互、来源跳转与浏览器回归，再安排受控DEV apply/发布和晴天定向验收。本次未修改这些Admin文件。
