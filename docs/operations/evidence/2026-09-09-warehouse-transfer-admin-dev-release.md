# D1 调拨 Admin 开发发布与验收

> 历史检查点：本文记录 2026-09-09 首次 DEV Admin 发布 `e20387a1` 的当时状态。随后 DEV 被不含调拨页面的版本覆盖；恢复主线、权限修复及真实业务验收分别见[主线集成](2026-09-09-warehouse-transfer-admin-mainline.md)、[权限发布](2026-09-09-warehouse-transfer-permissions-release.md)和[最终调拨验收](2026-09-09-warehouse-transfer-granted-live-acceptance.md)。本文的发布版本、迁移数量和“待验收”结论均不代表当前状态。

## 范围

- 已接入分页列表/详情、完整草稿编辑、提交/完成/取消、冻结命令重试、库存双向来源链接、侧栏入口和平台独立开关。
- 本批只有 Admin 与文档变更，无新增 migration、无 API 修改；仅发布 DEV Admin，不发布生产，不修改 Orange。
- 用户批准使用固始晴天装饰工程有限公司和已有权限员工测试；不据此新增权限。
- 功能分支 `feature/warehouse-project-material-stage-c`，既有独立 worktree 保留。

## 审查及本地证据

- Task 2：SPEC 与质量审查均 PASS。
- Task 1：SPEC 最终 PASS，质量最终 PASS，无剩余 Critical / Important / Minor。
- 审查修复：已保存草稿不能更换仓库；完整命令身份与实例生命周期共同防止旧响应清掉新请求/同一请求当前重放；历史筛选允许停用仓库，新建仅允许启用仓库。
- `bun run check` 通过，未引入依赖。
- 调拨组件/API 单测 16 项 / 62 assertions，通过请求级及生命周期状态序列回归。
- 开关浏览器回归：18 项通过（桌面/375px）。库存既有回归：10 项通过。
- 调拨浏览器最终回归：32 项通过（桌面/375px，各16项，1.2m）。受影响单测：40 项 / 179 assertions 通过（9文件）；三组浏览器回归合计60项，均无失败。
- 截图已检查桌面终态、375px 草稿与底部保存操作，无页面横向溢出；宽表格在自己的容器内滚动。
- 本地 Playwright 使用合成登录/数据与 HTTP fixture，证明前端交互和请求契约，不能证明真实数据库过账、权限配置或价值守恒。

## 发布前门禁

- DEV 主机身份 `VM-0-11-ubuntu`；API/Admin 健康，原 revision `0f350b0175feb84d0e69d1cdb7eab49f9e8f133f`，run `34294327062`。
- 磁盘 82%，剩余 11,352,723,456 bytes；未清理用户或服务数据。
- 显式 DEV URL 执行 `supabase migration list`：604 条 Local/Remote 全量对齐，最新 `20260908235954`；仓库 verifier 返回 aligned/target present 均 true。
- 完整历史见相邻 `2026-09-09-warehouse-transfer-admin-predeploy-migration-list.txt`。
- 只读事实见 `2026-09-09-warehouse-transfer-admin-predeploy.json` 和 `2026-09-09-warehouse-transfer-admin-business-predeploy.json`。
- 调拨订单/明细/命令均 0，开启调拨的租户 0，调拨角色/员工显式授权均 0，仓库总数 1。本次供应商命令事件基线为 132（前一批记录为 130，不将两批间外部变化归因于本批）。

## 发布结果

- 固定分支 `release/warehouse-transfer-admin-dev-20260909`，SHA `e20387a1298a29eb5cb1c1bc8642a92aae66e92e`；功能分支和发布分支均已推送。
- [Release Dev run 34298832069](https://github.com/LeeFo-china/goose/actions/runs/34298832069) 最终 success；构建、迁移门禁和 Admin 部署全部成功。
- Admin 容器 healthy，revision 与固定 SHA 一致，run `34298832069`，image `sha256:36c430cb33e2f58ded50d2b082ffdb929d8bf87218bc55fef2e1efc2216c8201`。
- API 未重发：healthy，revision `0f350b0175feb84d0e69d1cdb7eab49f9e8f133f`，image `sha256:0e64e389d54f4709f2f03436eb7a386f8ebceb86f8ab0172c7d3fac007f16896`。
- HTTP：API `/` 200，Admin `/login` 200，未登录 Admin `/warehouse-transfers` 307 到登录，未登录 API 调拨列表 401。这些仅证明服务及认证边界可达，不等于业务验收。
- 发布后再次 `supabase migration list`：604 条与发布前逐行相同。10组业务 count/md5、集成函数元数据、供应商命令事件132条及调拨0记录均与本批发布前完全相同；无锁等待/长事务。见 `2026-09-09-warehouse-transfer-admin-postrelease.json`。
- 发布后磁盘84%，剩余10,030,329,856 bytes，未清理旧镜像或其他数据。
- 如需回滚，只用既有发布流程 `operation=rollback service=admin` 选择上一固定分支 `release/warehouse-transfer-integration-dev-20260909`；本批无DB变更，不执行数据回滚。

## 真实验收门禁

Chrome 可以列出 DEV 标签并新建标签，但现有标签接管两次超时，新标签导航也超时。已按 Chrome skill 排障并请求用户恢复控制；没有绕过扩展使用 CDP/凭据提取，也没有用 mock 冒充真实测试。

收尾已调用 Chrome 会话 finalize，释放控制；未关闭用户原有标签。GoodCMS RAG 本轮查询502不可用，使用仓库现行设计与代码核对，未声称完成远端知识库同步。

尚未开启真实租户调拨开关、创建真实调拨或授予权限。待 Chrome 恢复，先核对目标租户与已有权限员工、双仓及明确测试库存条件；满足后执行正常调拨/反向调拨，验证库存数量/价值守恒、无项目成本/应付/付款变化，最后关闭测试开关。缺权限时保持阻塞，不自动赋权。

当时 D1 代码、本地验收与 DEV Admin 发布完成，真实 DEV 业务验收未完成；当时不得标记 D1 全完成或进入 D2。原先关于 `system_admin` 自动具备调拨权限的推断后来被真实权限检查证伪，根因与修复见[权限发布](2026-09-09-warehouse-transfer-permissions-release.md)及[真实权限阻塞记录](2026-09-09-warehouse-transfer-live-acceptance.md)。

## Chrome 重装后复核：开发版本已变化

- 2026-09-09 用户重装后，Chrome 接管、导航和 DOM 读取成功；租户概览显示「固始晴天装饰工程有限公司 · 风清扬」、员工 `31ae8836-9646-4514-a38b-baf1d989f3c0`、权限数量 217。该数量不代表已核实调拨动作权限。
- 同一真实会话访问 `https://admin-dev.goodcms.cn/warehouse-transfers`，页面显示 `404 / This page could not be found.`；当前阻塞不再是无法读取浏览器页面。
- 通过主机守卫 `VM-0-11-ubuntu` 只读核对：API/Admin 都已运行 `43cb38bf87a544e3f305f413da70a109003eec13`，run `34299611617`，均 running / healthy。API 启动于 `2026-09-09T01:53:40.721021276Z`，Admin 启动于 `2026-09-09T01:54:23.466418064Z`。此前发布证据是历史检查点，不代表当前部署。
- Root Cause：后续发布替换了 D1 Admin 候选。`43cb38bf` 的提交说明明确排除调拨 Admin，`git ls-tree` 确认该提交没有 `apps/admin/app/(console)/warehouse-transfers/page.tsx`，与真实页面 404 一致。它还包含新的采购工作台改动，不能直接重发旧候选覆盖这些改动。
- 重跑现有只读集成 SQL：migration 历史 604 / 最新 `20260908235954`；调拨订单、明细、命令均 0；开启调拨租户 0；供应商命令事件仍 132，md5 `acd9a914eba20cc0da52626989eaa8e8`。这里只核对数据库历史，不声称本轮重跑 CLI Local/Remote 对齐或全部业务基线。
- 本轮没有修改代码、发布服务、应用 migration、切换业务开关或创建业务单据。下一步需基于当前主线补入调拨 Admin 并保留采购工作台改动，再验证并仅发布 DEV Admin；合并/发布协调确认前暂停真实业务验收，D1 门禁及 D2 暂停状态不变。
