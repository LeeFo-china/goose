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
