# D2.1 盘点后端接入验证记录

日期：2026-09-09；实施前基线 a43f5349，设计 620f53a8，计划 aeb9a23d。当前记录随实施更新，以下仅列已执行结果，不代表全部完成或已发布。

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

## 验证边界

本批 SQL runner 仅从本地源容器读取 schema/元数据，在无网络临时 PostgreSQL 测试库应用采购域 migration 和合成数据。已有 runner 使用 SQL_ASCII；不是完整历史升级、真实 DEV 或浏览器登录验收。没有 apply 远端 migration、开启晴天盘点、增授员工/角色权限或发布服务。Admin 盘点页面、来源展示/跳转及平台开关控件仍属于后续批次；真实开放前必须一起接入验证，不能把后端 source_document 扩展单独作为 UI 已完成的证据。
