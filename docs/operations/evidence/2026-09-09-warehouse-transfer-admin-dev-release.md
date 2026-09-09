# D1 调拨 Admin 开发发布与验收

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

当前 D1 代码、本地验收与 DEV Admin 发布完成，真实 DEV 业务验收未完成；不得标记 D1 全完成或进入 D2。显式授权数为0不等同于没有有效权限员工：既有租户 `system_admin` 会由服务端派生完整权限，仍须通过真实会话确认，而不能直接自行赋权。
