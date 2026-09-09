# D2.1 盘点 Admin 与 DEV 验收记录

最新结论：Admin实现、双重审核、92项本地页面回归、5项DEV apply、完整610项迁移对齐及API/Admin开发发布已完成。固定发布版本`daee511b`，实际双容器同SHA且healthy，外部入口200。Chrome真实盘盈/盘亏及业务反向恢复验收仍被页面控制超时阻断；最后一次库存/开关复读另遇SSH MaxStartups限制，不能将本记录标为D2.1完整验收。最近成功库存快照是19:30 CST，公司仓1箱/88元、分仓0/0、盘点false/version22。D2.2未开始。

## 进行中：只读预检

用户已授权本批 Admin、apply、DEV发布与晴天租户验收，以及常规确认。2026-09-09 18:19–18:23 CST 预检；此节不表示已apply或已发布。

- 使用既有隔离工作树，基线4f54d15f；原main仍43cb38bf，D1固定候选710b3322不移动。
- 设计03a7655a，计划24a0753f。Admin相关基线37 tests/166 assertions与typecheck退出0。
- DEV SSH实际主机VM-0-11-ubuntu、ubuntu账户；只在进程内使用既有`.env.dev.db`，仓库真实目标守卫同时验证pool/direct URL和fclnkyatvfvmzgzdqlba，排除生产。查询显式BEGIN READ ONLY，返回on，15秒statement/3秒lock超时。
- `supabase migration list`退出0，609个Local版本、605个Remote版本；仅20260909064815、20260909080239、20260909085915、20260909085927待执行，远端独有0。完整表保留于同目录`2026-09-09-warehouse-stocktake-dev-preflight-migrations.txt`（仅去除行尾空白），数据库内605版本逐项保留于preflight.json。
- DEV API/Admin均healthy，仍revision240e7a7835eadc8b8bf38faecdf71f3967fd82f2，磁盘9.6GB可用。尚未重建/部署。
- 平台设置现version22，module/materials/procurement等既有开关true，transferfalse；stocktake列/权限/表尚不存在。与D1记录version20相比有外部后续变更，保留本次新基线，不覆盖历史状态。
- 晴天目标租户/风清扬/既有system_admin角色active且归属一致；盘点SQL helper的manage/approve均false。实际新增权限需使用目标限定migration，不绕过SQL校验或改其他角色/员工覆盖。
- 7个rollout替换锚点各匹配1次，inventory来源锚点匹配1次，现有分页物化及force_custom_plan满足；无stocktake对象冲突，无长事务或锁等待。原始SQL及结果见`2026-09-09-warehouse-stocktake-dev-compatibility.sql/.json`。
- Chrome能打开DEV库存页，已登录晴天风清扬，权限219；公司仓测试SKU1箱/88元、分仓0/0。使用新验收标签页，没有导航/修改用户正在使用的抖音资料页。最初浏览器节点超时，恢复后确认页面已加载，不重复提交任何业务操作。

## 本地后端复验

完整命令与顺序复用`2026-09-09-warehouse-stocktake-integration.md`最终验证节，针对本批基线fresh执行：244 API tests/1485 assertions/28 files，API typecheck与build退出0（978 modules、5.12MB）；Domain 28 tests/302 assertions/6 files。SQL runner先用已安装TypeScript最小静态检查退出0，然后17夹具完整链退出0；真实并发5组、串行/超时负控、全量余额/流水及财务摘要检查通过。

SQL只在本机schema-only基线527条后的采购领域、随机无网络PostgreSQL17临时容器中运行；不是DEV升级或Chrome业务验收。SSH普通shell没有node命令；只读诊断发现既有runner的node24，改为显式绝对路径执行同一目标守卫后成功，未安装软件或修改PATH/服务器配置。

## Task 1：盘点工作台

实现提交ab0de645，损坏存储路径校验修复a285dc1。独立SPEC与质量审核通过，无Critical/Important；质量审核发现的非空路径前缀恢复问题已独立复现、RED/GREEN修复并复核关闭。主代理fresh运行37 tests/229 assertions通过，类型及文件大小检查退出0。共享请求生命周期提取后的原调拨桌面/375px浏览器回归32项全部通过，375px完成态截图已人工检查。

数量保持十进制字符串、零与未录入分离；完整编辑最多100行，详情每页20。未知请求原路径/body/key冻结，存储异常锁写。未保存保护覆盖编辑关闭、刷新/离站及普通同窗链接；不覆盖浏览器同文档历史和外部程序化router.push，编辑界面自身无分页入口。真实React交互、盘点截图和平台集成留待Task 2，不将Bun规则测试当作浏览器验收。

Chrome恢复后可列出原验收标签页，但页面读取再次超时；尚未提交任何盘点业务操作，发布后需重新确认真实交互连接。

## 开发发布编排静态预检

`bun test scripts/release-orchestration-contract.test.ts --test-name-pattern 'development migration transaction orchestration|development orchestrator'`：17 pass、265 assertions，其他138项按范围未执行。另从本仓库`migrate-dev-database.yml`提取真实`scan_top_level_transaction_controls`与`emit_explicit_transaction_migration`函数，对四份待执行盘点SQL逐一离线渲染：退出0，模拟history语句仅出现一次且紧邻最终COMMIT之前。只执行本地Bash/awk解析，不连接数据库或执行渲染SQL。

GitHub只读检查时无本批进行中的发布任务；远端main43cb38bf、feature4f54d15f与D1固定候选710b3322未变化。计划沿用开发专用plan/apply工作流及`release-dev.yml`的`service=api,admin`，迁移对齐门禁后先API再Admin，另建不可移动候选分支。

## Task 2：平台开关、来源与浏览器回归

实现5da8d98a，独立SPEC与质量均通过，无待修问题。相关Bun 74 tests/405 assertions通过；实施者完整执行盘点38、平台22、调拨32项桌面/375px E2E，全92项通过，Admin typecheck、check:file-size、build退出0。主代理fresh复跑74项Bun及typecheck→38项盘点E2E，退出0。SPEC独立50 tests/317 assertions、质量独立37 tests/176 assertions通过。

初始5项RED暴露缺失能力后实现GREEN。覆盖六动作、精确零/空白、25行分页及分次录入、只读/管理/审批隔离、开关异常锁写、未知请求字节级恢复、真实AppRouter开发StrictMode卸载后的迟到成功保护、盘点来源和平台旧字段省略/显式false/独立开关。fixture的25份summary与49行item另经真实API schema验证；fixture回执状态、非负行金额、错误码及nullable字段与当前契约核对，不将HTTP模拟当数据库验证。

截图位于ignored的`apps/admin/test-results/warehouse-stocktakes/`和`supplier-rollout/`。主代理检查桌面/375px完成态及375px平台开关，实施者检查实盘/草稿；页面未溢出，表格局部横向滚动，确认操作可达。测试调整限于异步完成等待、真实分页label及移动端main作用域断言，没有跳过产品校验。

19:15 CST再次只读核实：远端最新migration仍20260909045512，晴天角色无两项盘点授权，设置version22、公司仓1箱/88元/版本6、分仓0/0/版本3均未变。未运行任何远端写入。

## 待完成门禁

限定授权实现`eb657a65`，migration `20260909111954_grant_qingtian_warehouse_stocktake_permissions.sql`，独立SPEC→质量均通过，无待修问题。先真实缺权RED，再两项授权GREEN；D1/D2各11项守卫/注入失败回滚、无目标no-op、精确重放和权限/身份拒绝均通过。runner仅按批准时序封闭参数化，不改变生产迁移字节。

主代理fresh最小TS检查后执行17组完整业务SQL链，再单独执行stocktake-tenant-grant.sql，全部退出0；实施者另行D1独立夹具和互斥负控通过。五份SQL全部经实际DEV workflow atomic history renderer离线检查通过。精确命令：

```sh
bunx tsc --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --types bun scripts/verify-warehouse-stage-b-database.ts
bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/stocktake-tenant-grant.sql
bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/transfer-tenant-grant.sql
```

最新只读preapply.json记录Local610/Remote605、五项pending及库存/财务/授权基线；仍无任何远端写入。新固定候选分支计划为`release/warehouse-stocktake-admin-dev-20260909`，不移动D1分支。

固定DEV plan/apply、完整migration list对齐、API/Admin开发发布及Chrome盘盈/盘亏业务恢复验收尚待完成。Chrome标签可列出，但DOM读取及claim均超时，已向用户请求将验收页切到前台并确认扩展提示；尚未因此进行业务写入。D2.2手工调整不在本批。

## 19:31 CST：DEV迁移已应用，发布进行中

固定候选`release/warehouse-stocktake-admin-dev-20260909` → `daee511b352d8bead83327ca286a538ebc97322e`，已连同feature推送；main与D1固定分支未移动。

- [DEV plan 34345780164](https://github.com/LeeFo-china/goose/actions/runs/34345780164)成功，605→605，恰好五项pending、applied0。
- [DEV apply 34345868138](https://github.com/LeeFo-china/goose/actions/runs/34345868138)成功，605→610，应用且仅应用`20260909064815 / 20260909080239 / 20260909085915 / 20260909085927 / 20260909111954`。
- fresh `supabase migration list`退出0，完整610行保存于`2026-09-09-warehouse-stocktake-admin-migration-list.txt`；`node scripts/verify-migration-history.mjs <该文件> supabase/migrations 20260909111954`退出0，两个校验字段true。
- guarded只读postapply.json：3个盘点表、2项权限定义；目标角色仅manage/approve all，目标员工SQL helper均true。非目标1595行授权、34行员工角色、6行override及晴天9类业务/财务摘要逐项count/md5不变。库存仍公司仓1箱/88元/version6、分仓0/0/version3；配置version22，所有旧字段未变，新盘点flag=false。
- [DEV release 34345983716](https://github.com/LeeFo-china/goose/actions/runs/34345983716)已提交`service=api,admin`、`operation=release`，同一固定SHA；本节写入时仍进行中，尚不宣称服务部署完成。

以上完成了apply和历史对齐门禁，取代前文对应“待完成”状态；真实Chrome业务验收仍未执行。

## 发布最终结论与保留门禁

[Release Dev 34345983716](https://github.com/LeeFo-china/goose/actions/runs/34345983716)最终completed/success，19:38 CST完成API/Admin部署、迁移证据门禁、顺序就绪门禁及发布摘要。独立SSH inspect核对两容器均running/healthy、revision均`daee511b352d8bead83327ca286a538ebc97322e`、run_id均34345983716；实际镜像digest分别API `8ed2ea5fe1aa7c2966d126631c0c10bce34e509c0412409ccde5db7921f96a32`、Admin `74eb583b8a5a9491bbffc393365aa9ac4e49c13e80bac7a25c85dbeae7e80555`。DEV磁盘9.2GB可用。curl的Admin登录200、API根200、盘点分页接口无登录401/TOKEN_MISSING，无业务写入。结构化结果见`2026-09-09-warehouse-stocktake-admin-release.json`。

19:39:50 CST成功完成发布后只读财务/授权摘要复核：9类业务表count/md5、非目标role_permissions、employee_roles、employee_overrides与preapply完全一致。库存/配置的最后复读在SSH认证前被关闭，`ssh -v ... true`明确返回`Exceeded MaxStartups`；单独连接和等待后仍未取得该快照。未调整sshd、防火墙或安全上限，也未把连接失败当作数据库错误。库存/开关最新成功证据仍为19:30:46 postapply，不声称取得了19:39之后的余额快照。

Chrome技能要求的session finalize已成功，将`盘点开发验收`组原库存标签作为handoff保留，未导航用户的抖音资料页。此前页面读取/claim多次超时，尚无新的页面控制成功证据，本轮Chrome发送业务命令0；没有创建真实盘点单，也没有需要反向恢复的本轮库存操作。等用户将验收页切前台、确认扩展控制并恢复连接后，重新读取最新设置/库存，再进行已授权的最小盘盈、盘亏、来源追溯与反向恢复。不得依据本地HTTP fixture通过而跳过该门禁或进入D2.2。

本地最终相关74 tests/405 assertions再次通过，git diff/JSON/完整history验证通过。按已授权DEV发布方式保留feature及worktree，不合并main、不建PR、不移动固定release分支；只有发布后的证据文档继续落在feature。
