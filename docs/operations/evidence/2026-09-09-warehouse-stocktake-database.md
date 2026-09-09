# D2.1 盘点数据库原子命令验证记录

日期：2026-09-09。实施设计/计划初始提交 `3aa3bd33`，请求契约基线 `39d96c8a`。本批完成，最终实现 `d5a526dc`，共7个代码/夹具文件、1121行新增；仅数据库命令层，不表示盘点已在开发环境开放。

初版实现 `8e2937ed`（7文件、1032行新增）由主线程独立跑10个SQL夹具通过。SPEC审查发现UUID/UTF-16长度的严格契约差异，后续提交 `d5a526dc` 修复并经SPEC复审、独立质量审查通过；没有把初版GREEN当成审查通过。

## 边界

本批只有SQL命令、Domain权限定义及隔离SQL夹具。没有HTTP/Admin/读取RPC/库存来源链接接入，没有真实租户权限分配、开关启用、远端apply、开发镜像发布或生产操作。Orange未改。D1固定发布分支保持 `710b332282b2f10b2f561b20db197e5f39a8a6eb`。

CLI `supabase migration new warehouse_stocktake_atomic_commands` 生成 `20260909064815_warehouse_stocktake_atomic_commands.sql`。现有runner只从本地容器读取schema/元数据，在无网络临时PostgreSQL中恢复和应用；临时库仅合成测试数据，结束自行清理。此过程不代表DEV migration已应用，不以本批记录宣称Local/Remote对齐。

## 测试先行

实施代理报告Domain权限RED：20 pass/2 fail，缺少inventory.stocktake.manage/approve定义。真实SQL RED已成功恢复基线后明确报 `Stage D2 missing table: warehouse_stocktake_orders`，退出1，临时库清理完成；非导入/依赖/恢复失败。

## 主线程已独立执行

实施前API盘点/领退料/调拨schema：11 pass、339 assertions；API typecheck退出0。

权限定义改动后：

```sh
bun test packages/domain/src/permission.test.ts packages/domain/src/warehouse-stocktake.test.ts
bun run --cwd packages/domain build
```

23 pass、0 fail、280 assertions。Domain构建149504字节，external Zod身份检查通过，退出0。

在apps/api：

```sh
bun test src/schema/warehouse-stocktakes.test.ts src/schema/warehouse-transfers.test.ts src/schema/warehouse-materials.test.ts src/repositories/inventory.test.ts src/services/authorization/system-admin-warehouse-transfer-permissions.test.ts
bun run typecheck
```

41 pass、0 fail、434 assertions；typecheck退出0。以上是相关回归，不是64个新测试，也不替代SQL行为验收。

## 主线程SQL复验

`bun scripts/verify-warehouse-stage-b-database.ts` 后顺序传入以下 `scripts/fixtures/warehouse-stage-b/` 夹具：material-contract、material-workflow、material-security、transfer-contract、transfer-workflow、transfer-security、stocktake-contract、stocktake-workflow、stocktake-security、stocktake-concurrency（各带.sql后缀）。初版和最终 `d5a526dc` 均独立执行退出0。

恢复schema-only基线 `20260828160000`（527条迁移记录），仅应用runner选择的采购/库存域待执行migration，包含本批新migration。不是全量历史迁移升级验证。5组竞争实际观察到B等待A，blocking_pids包含A PID：

| 用例 | A/B PID（本次临时库） | B锁类型 | B结果 |
|---|---|---|---|
| two-outdated | 545/546 | transactionid | SNAPSHOT_CONFLICT |
| same-key | 547/548 | advisory | 与A同一冻结结果 |
| transfer-first | 549/550 | transactionid | SNAPSHOT_CONFLICT |
| stocktake-first | 551/552 | transactionid | completed |
| absent-created | 553/554 | transactionid | SNAPSHOT_CONFLICT |

另通过提前提交A的P9002串行负控、500ms statement_timeout负控（原57014与连接清理）、正常调出/调回恢复数量价值但版本+2后拒绝旧盘点的串行用例。最终全租户FULL JOIN核对库存流水/余额/均价，以及项目成本/应付/付款/现金完整快照不变。

## 审查复现与编码边界

原离线runner用`initdb --no-locale`生成SQL_ASCII库，而实际本地Supabase `SHOW server_encoding` 为UTF8。实施中trim helper不能使用SQL_ASCII不支持的高码点chr调用；改为显式UTF8字符序列的正则匹配，不调整runner或源库编码。主线程从migration提取实际trim SELECT表达式，只读查询本地UTF8库，以JavaScript.trim为oracle，80项（25种空白字符、前后/内部空白、中英文、引号、500/501字）字符串和长度均一致；未创建函数或修改数据。

SPEC独立审查后主线程再次复现：251个emoji在API为UTF16长度502被拒，旧SQL char_length为251被接受；GUID `abcdef00-0000-0000-0000-000000000001` 被真实Zod拒绝，但旧SQL外形正则接受。修复责任是镜像既有DTO边界，不能放宽API或静默截断。所有这些只读表达式诊断不能冒充完整UTF8业务库验收。

修复前新增夹具先RED：非法UUID进入仓库业务校验而非输入拒绝；SQL_ASCII下合法250个emoji被旧字符计数拒绝。修复增加owner-only UUID精确正则helper和有界UTF16长度helper（最多检查2000 UTF8字节、超过500单位即返回501），同步原因输入、条件校验和表CHECK。真实SQL验收覆盖250/251emoji、500/501中文、混合字符、先trim后计算、超长拒绝、原文不截断、越过命令直接写表也拒绝。

主线程额外在本地UTF8库只读验证：UUID实际SELECT表达式对照已安装Zod4.4.2共149种字符串一致；提取UTF16 helper的原始逻辑，在`BEGIN READ ONLY`匿名DO里仅将RETURN改为外层结果赋值/退出代码块，53组空串、ASCII、BMP、补充平面及1–10000重复长度与`min(501, JavaScript.length)`一致。未安装函数、未改schema或业务数据。完整业务仍由隔离SQL_ASCII库运行，UTF8正式业务/HTTP验收保留给接入阶段。

## 独立审查和收尾

SPEC首次发现上述2项P2，修复后复审无剩余问题；随后独立质量审查无Critical/Important/Minor。主线程实际读取完整变更及关键既有锁序/权限/来源实现，最终再次运行Domain23项/API41项、Domain构建和API typecheck，均通过；最终代码和文档diff检查通过。

保持原feature分支和linked worktree，精确提交文档并推送，不合并main、不建PR、不清理worktree、不移动D1固定release分支。无远端apply，所以没有执行或宣称远端migration list对齐。下一批交付有界查询RPC、响应类型、API/库存来源兼容和设置配置；之后才进入Admin、受控DEV apply/发布与晴天真实验收。D2.2手工调整未开始。

## 已核对的兼容与权限限制

收货、领退料和调拨均按settings→warehouse→document/balance短事务锁顺序写库存；盘点沿用此顺序保护不存在余额竞争，不持有长期锁仓。盘点明细金额非负，库存流水按差额方向带符号。

API现有system_admin上下文会派生Domain全量权限，但数据库有效授权仍需角色/员工权限事实。新增Domain枚举不等于数据库已有盘点授权，本批命令必须独立鉴权；后续API/UI需处理此差异，不能自动复制晴天D1的调拨授权。

Knowledge base查询仍为502，本批依据仓库设计和实际代码，未执行RAG上传或声称同步成功。读取RPC分页性能、来源链接、设置配置入口及API/Admin验收属于后续接入批次。远端应用须等待这些兼容项完成，之后检查待执行migration再apply/list。
