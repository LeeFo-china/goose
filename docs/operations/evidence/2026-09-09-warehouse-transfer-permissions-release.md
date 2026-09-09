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

## 发布结果

- 固定候选 `240e7a7835eadc8b8bf38faecdf71f3967fd82f2`（含修复及发布前证据），唯一固定分支 `release/warehouse-transfer-permissions-dev-20260909`；旧固定分支未移动。
- [Release Dev 34307897288](https://github.com/LeeFo-china/goose/actions/runs/34307897288)，输入 `service=api,admin operation=release`。`gh run watch --exit-status` 返回0；构建、迁移校验、API部署、Admin部署及最终汇总均success。其他服务未部署。
- 同次 migration evidence 下载后通过 `verify-dev-migration-evidence.mjs`；API/Admin 镜像 manifest 中 SHA、run id、digest 与守卫主机实际容器完全一致。
- API running/healthy，revision `240e7a78`，run `34307897288`，digest `sha256:ab6ce01208c050bbe1f382d82e645823d6ce45401b5ab07e514e924cc3d4e985`。
- Admin running/healthy，同 revision/run，digest `sha256:895935fcc35b7a477f786e545e70d645be04621a76e9bac4776f86f7bb349449`。
- API容器内只读导入 `@gooes/domain`，两项调拨权限 registered 均 true、配置与修复一致。API根路径、Admin登录页均 HTTP200；这不替代有身份的业务验收。
- `2026-09-09T03:47:19Z` 发布后只读检查：十组业务count/md5与发布前完全一致（`business_facts_identical=true`），历史仍604、最新 `20260908235954`、无锁等待/长事务。见 `2026-09-09-warehouse-transfer-permissions-after.json`。
- 磁盘84%，可用10,208,403,456 bytes；未清理数据或镜像。远端main仍43cb38bf，功能分支未合并main，后续main自动发布存在覆盖风险，需在新批次发布前重查。
- Chrome最后复核仍为平台登录页、验证码为空。仅发送一次验证码，不反复发送，不读取任何凭证或绕过短信。需用户正常完成登录后继续真实验收；这不是待批准的权限请求。
- 已增加并成功执行只读 `2026-09-09-warehouse-transfer-acceptance-readonly.sql`：限定测试租户/SKU、详情最多20条，包含两种合法调拨来源及成对数量/价值守恒检查。旧发布基线查询的 `invalid_existing_sources` 不含调拨类型，真实调拨后不能误用该旧字段判失败。

## 后续纠正：DEV 已支持免验证码登录

- 用户指出开发环境无需验证码。核对 `apps/api/src/utils/auth/test-login.ts` 和 `services/admin-auth.ts:227`，已有仅对开发环境生效的 `AUTH_PHONE_LOGIN_WITHOUT_CODE` 登录分支；Admin表单验证码也无required。页面提示使用构建时NODE_ENV，不能据此认定DEV必须短信校验。
- 前一轮将空验证码视为阻塞、要求用户提供验证码，判断不准确。无需修改登录代码或配置，也无需读取验证码；今后用正常表单留空提交。
- 本轮在既有Chrome登录表单以用户提供的平台账号、空验证码点击一次「登录」；调用等待超时后未重复提交。新鲜openTabs及tabs.list均显示原标签页已从 `/login` 转到 `https://admin-dev.goodcms.cn/dashboard`，导航发生于 `2026-09-09T03:54:57Z`。登录表单仅成功后跳转dashboard，支持已正常登录的结论；尚未读取登录后身份详情，不能声称已经核验平台/租户操作权限。
- 随后接管页面45秒及120秒等待均超时，改用tabs.list返回的已有Tab再读取页面也超时；列表/会话收尾正常。已按Chrome技能检查文档，没有改用其他脚本控制浏览器，也没有读取token。原dashboard标签页最终以handoff保留并成功释放控制。
- `2026-09-09T04:00:42Z` 独立只读验收检查仍为开关false/version16、仓库1、测试SKU数量1.0000/价值88.00、调拨单/命令/流水均0。未开启测试或写库存。当前阻塞是Chrome页面控制超时，不是缺验证码；D1真实闭环仍未通过，不进入D2。
