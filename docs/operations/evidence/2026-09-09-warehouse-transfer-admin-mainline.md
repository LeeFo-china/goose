# 调拨 Admin 主线集成与开发验收

## 范围与根因

- 用户在明确获知覆盖风险后授权继续：基于当前 main 补入调拨 Admin，仅发布 DEV Admin；保留采购工作台改动。
- 之前真实 Chrome 已能读取租户概览，但 `/warehouse-transfers` 返回 404。DEV 后续自动发布了未包含调拨 Admin 的 `43cb38bf`，不是本轮浏览器连接故障。
- 当前基线 `43cb38bf87a544e3f305f413da70a109003eec13`；既有独立工作区分支 `feature/warehouse-transfer-admin-mainline`。旧分支排障记录已保存于 `a8048208`。
- 只移植 `2f20df15`、`e20387a1` 中 33 个 Admin 路径，逐文件与旧候选 blob 一致。采购工作台、API、Domain、迁移、依赖、认证、CI 均未改动。未合并 main，不操作生产或 Orange。

## 静态与独立审查

- 原主线基线：19 项相关单测、Admin check 通过。
- 先恢复测试：5 个缺失功能断言失败、4 个新增模块导入失败，确认 RED；恢复实现后 GREEN。
- 主代理复跑：40 项单测 / 179 assertions / 9 文件通过；Admin check 通过（1500 个 TS/TSX 文件大小检查、路由类型生成、tsc）。采购编辑器额外 9 项测试 / 22 assertions 通过。
- 独立 SPEC PASS 后独立质量 PASS；均自行核对代码及重跑 40 项单测，无未处理审查问题。
- 调拨桌面/375px 本地 E2E：32 通过。首轮与 rollout 并行时 Next 出现 `Unexpected end of JSON input`；rollout 两项相邻开关用例失败，其余16通过。既有测试启动器会每秒还原共享 tsconfig/next-env，已改为串行原样重跑验证环境干扰；不放宽断言或修改业务代码。本段不是最终浏览器门禁通过声明。
- 串行复验：rollout 18/18、inventory 10/10、采购批次工作台5/5、采购申请工作台4/4全部通过，未再出现 JSON 读取错误；结合既有启动器的共享文件还原行为，支持并行测试服务器干扰的判断。本轮有效通过用例合计69项，不把失败尝试计入通过数量。以后同一工作区的这些 Next E2E 串行执行。
- 已查看真实生成的桌面终态、375px 草稿底部截图：保存/关闭操作可达，表格与页面布局正常；全部为本地合成会话，不证明真实 DEV 业务过账。

## 发布前只读基线

- 主机守卫 `VM-0-11-ubuntu`；API/Admin 均 running / healthy，revision `43cb38bf`、build run `34299611617`；自动部署 run `34300896907` 已 success。检查时没有进行中的发布。
- Admin image `sha256:2ca2fd3e57635a532c83221b1217e2ab08ec1d26d2974708d073d010052fc149`；API image `sha256:24652a681fda1dfb5e9709904898fd803f8f2dcfd4daa19113be02cf5986b229`。
- 磁盘84%，剩余9,990,336,512 bytes，未清理数据或镜像。
- 仓库带 DEV 目标守卫的 `supplier:purchasable-sku:migration:list:dev-direct` 成功；604条全量 Local/Remote 对齐、最新 `20260908235954`。清除 CLI 包装器的非表格提示后，仓库 strict verifier 返回 aligned/target present 均 true。完整列表见相邻 `2026-09-09-warehouse-transfer-mainline-migration-list.txt`。本批不执行 apply。
- `2026-09-09T02:22:03Z` 只读业务基线：仓库1、余额1、库存流水4、项目成本7、应付5、付款0、财务台账21、领料1、退料2、供应商设置1；无锁等待或长事务。十组 count/md5 与先前发布后记录一致。
- 真实调拨闭环仍待发布后确认；当前不声称 D1 完成，D2 仍未进入。

## 固定候选与发布跟踪

- 候选 `4e522befa55ed28811a3565955c8a82e23150400`，固定分支 `release/warehouse-transfer-admin-mainline-dev-20260909`；功能分支及固定分支已推送。
- [Release Dev run 34305784359](https://github.com/LeeFo-china/goose/actions/runs/34305784359)，输入 `service=admin`、`operation=release`。本轮发布前最后复核 main/API/Admin 仍为 `43cb38bf`，没有进行中的 workflow。
- 运行期间 `2026-09-09T03:07:23Z` 再采集只读业务摘要，见 `2026-09-09-warehouse-transfer-mainline-before.json`；十组 count/md5 仍与此前一致。
- 回滚方案：以发布前 `43cb38bf87a544e3f305f413da70a109003eec13` 创建唯一固定回滚分支，使用既有 Release Dev 的 `operation=rollback service=admin`；不覆盖 API、不回滚数据库或删除业务记录。
- 发布最终 success（`gh run watch --exit-status` 返回0）；构建、迁移门禁、Admin 部署及汇总均成功，API 部署 skipped。
- 主机独立复核：Admin running / healthy，revision `4e522befa55ed28811a3565955c8a82e23150400`，run `34305784359`，digest `sha256:a611ddf7f774cb899153913b079747b88c1b63d3c81b200fe7ee9965bf46a3da`，与下载的同次 image manifest 完全一致。API 仍为 `43cb38bf` / run `34299611617` / 原 digest，未重发。
- API `/`、Admin `/login` HTTP均200；同次 migration evidence 通过仓库 verifier，aligned/target present 均 true。磁盘83%，剩余10,438,512,640 bytes，本轮未执行清理。
- 发布后 `2026-09-09T03:14:41Z` 再查十组业务 count/md5，全量与本次发布前一致，见 `2026-09-09-warehouse-transfer-mainline-after.json`；历史仍604、无锁等待或长事务。
- Chrome 真实员工会话复验：调拨页正常显示标题、菜单、筛选、空列表及「仓库调拨功能未开启」，不再404；风清扬会话当前显示只读权限。平台租户管理页明确拒绝该账号（不是平台超管），未尝试绕过。
- 用户随后提供现有平台超管账号用于正常登录切换；登录及有权限员工核对进行中，尚未启用开关或创建调拨/仓库记录。

## 真实权限阻塞：共享权限注册缺失

- 已通过正常 UI 退出员工会话并填入用户提供的平台账号；未发送短信、提交登录或修改测试开关。浏览器留在登录表单等待后续处理。
- 只读员工角色查询找到目标租户已有 active `system_admin` 风清扬，员工 ID `d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`。注意：侧栏 `31ae8836-9646-4514-a38b-baf1d989f3c0` 是 `session.user_id`，不是员工 ID；旧排障记录对此字段的称呼不准确，以本次字段映射为准。
- Root Cause：`packages/domain/src/permission.ts` 的 `PERMISSION_CODE_VALUES` 和权限展示配置均未注册 `inventory.transfer.manage` / `inventory.transfer.approve`。直接加载当前常量结果为 `{count:217,manage:false,approve:false}`，与真实会话217项和只读界面一致。
- `apps/api/src/services/authorization/legacy/context-builder.ts` 对既有租户 `system_admin` 从该常量派生全部权限；`warehouse-transfers.ts` 的命令入口又严格要求上述两项。数据库 migration 已有权限字典，但无法弥补常量遗漏；因此不能通过手工员工赋权修复该系统管理员路径。
- 原 API/浏览器 mock 验收自行构造含调拨权限的 auth，未覆盖「真实系统管理员上下文构建 → 调拨命令」集成路径；本次真实验收暴露了该缺口。既有 Admin 移植审查通过不代表原核心权限实现无缺陷。
- 需要新增权限常量/展示配置与上下文衔接回归，并重新验证、发布 DEV API（以及共享配置受影响的 Admin）。这超过本批明确的 Admin-only 发布边界，未擅自修改 Domain/API 或发布 API；待用户确认后继续。数据库权限已通过 migration 注册，本次未新增或执行 migration。
- 调拨业务闭环仍未开始，D1 未完成，不进入 D2。
