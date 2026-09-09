# 调拨共享权限注册修复与 DEV 发布

## 授权、根因与变更

- 用户已授权补齐共享权限、发布 DEV API/Admin、继续指定租户真实验收；不操作生产、Orange，不手工赋权或绕过登录。后续任务范围内不重复请求确认，但短信验证码等缺失输入仍需用户提供。
- 根因见前一批 `2026-09-09-warehouse-transfer-admin-mainline.md`：数据库权限字典已存在，Domain 枚举遗漏两项，真实 system_admin 登录上下文派生后无法通过服务权限门禁。
- 修复提交 `7f7e0fabd9df5d8900121fed58afe24a90126007`：仅 Domain 的两项值/配置与两处回归测试，共3文件。未改变鉴权判断、角色授权、采购工作台、migration、依赖或发布流程。
- 不新增 migration、不执行 apply；604条 Local/Remote 对齐，最新 `20260908235954`，strict verifier aligned/target present 均 true。完整列表见 `2026-09-09-warehouse-transfer-permissions-migration-list.txt`。

## 验证

- TDD RED（实现代理执行）：Domain 18 pass / 2 fail，缺少权限注册；API新增集成回归7 pass / 2 fail，active system_admin 保存/确认均403。先重建当时源码的 Domain dist，排除过期产物；仅注入 RPC 边界，没有构造正向 auth.permissions，也没有 mock.module。
- GREEN（主代理复跑）：Domain全量180 tests / 945 assertions；API授权/调拨相关47 tests / 210 assertions；Admin相关40 tests / 179 assertions，均0失败。新增API回归另由独立规格审查单独运行9项通过。
- API `bun run check` 通过：typecheck、build（977 modules）、文件大小检查。Admin `bun run check` 通过：1500文件大小检查、路由类型生成、tsc。Domain build由实现代理执行成功，两个Docker构建也均显式重新构建Domain。
- 串行调拨E2E32项（desktop/375px）通过，运行1.2分钟；不并行启动共享Next配置的多套E2E。
- 独立 SPEC PASS 后质量 PASS；没有 Critical/Important/Minor 待处理问题。质量审查另独立运行新增API9项、43 assertions通过。自动化通过不代表真实 DEV 单据已验收。

## 发布前状态与回滚

- main仍 `43cb38bf87a544e3f305f413da70a109003eec13`；未合并main，保留旧固定分支。
- 主机守卫 `VM-0-11-ubuntu`。API healthy：`43cb38bf` / run `34299611617` / digest `sha256:24652a681fda1dfb5e9709904898fd803f8f2dcfd4daa19113be02cf5986b229`。
- Admin healthy：`4e522bef` / run `34305784359` / digest `sha256:a611ddf7f774cb899153913b079747b88c1b63d3c81b200fe7ee9965bf46a3da`。
- 磁盘83%，可用10,435,723,264 bytes；无进行中/排队 workflow；未清理镜像或数据。
- `2026-09-09T03:36:33Z` 只读基线见 `2026-09-09-warehouse-transfer-permissions-before.json`：十组业务count/md5与上次一致、无锁等待/长事务，调拨权限字典2、手工角色/员工grant0。
- 回滚通过既有 Release Dev 分别重发发布前固定API SHA和Admin SHA，输入 `operation=rollback`，不回滚数据库或删除业务记录。无需恢复旧缺失权限的业务数据。

## 真实浏览器验收门禁

- Chrome已正常连接，DEV平台登录页已向用户提供的账号发送一次验证码，页面明确提示「验证码已发送」。未提交验证码或登录，未启用调拨开关、创建仓库或调拨单。
- 等待用户验证码或正常登录后，继续指定租户既有员工的正向/反向调拨、数量价值守恒及财务隔离验证，结束关闭测试开关。
- D1真实闭环尚未通过，不标记D1完成，不进入D2。
