# D2.1 盘点 Admin 与 DEV 验收记录

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

## 待完成门禁

Task 2平台开关/来源/菜单实施与独立审核、盘点浏览器回归/构建、晴天限定权限迁移验证、固定DEV plan/apply、完整migration list对齐、API/Admin开发发布及Chrome盘盈/盘亏业务恢复验收尚待完成。D2.2手工调整不在本批。
