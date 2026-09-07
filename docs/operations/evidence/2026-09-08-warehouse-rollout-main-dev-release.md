# 仓库采购平台开关：main 合并、开发迁移与发布

日期：2026-09-08（Asia/Shanghai）。

状态：已合并并推送 main，开发 migration 与开发部署成功；相关本地/远端分支及 worktree 已安全清理。
仓库采购开关仍关闭，不代表业务闭环或生产验收放行。

## 授权与范围

用户明确要求合回 main、执行数据库 migration、开发部署，并安全清理已合并分支和 worktree。
仅操作开发目标 `api-dev.goodcms.cn` / `gooes-dev`（`43.165.126.30`），不触及生产或 Orange，
不自动开启任何租户，不创建采购/财务单据或修改员工权限。

本次是技术发布，不代表完整 Stage B 业务验收。已知仓库/采购批次越界分页 500、
合法采购审批身份及完整采购→收货→应付/付款、真机验收仍按原记录跟踪。

## Git 与合并后验证

- 原本地 main：`ce2c67fb`；fetch 后远端 main：`d424be4c`。
- 功能分支已包含远端 main，领先 51 个提交；只保留原有未跟踪 `.artifacts/`。
- main 使用 `git merge --ff-only feature/warehouse-procurement-inventory-stage-b` 到
  `65d1ed282bcfbbf608b6b8f6d49c288e1fa032e8`，无冲突，源码与受审功能分支逐字一致。
- `git push origin main` 成功，远端 main 精确为该 SHA；没有强推或重写历史。
- 合并后 API 定向回归 46 项、Admin 定向回归 18 项通过。
- Domain build、API check（类型/打包/行数）、Admin check/build 均 exit 0。
- 合并后 Admin 桌面/375px Playwright：14/14 通过，44.7 秒；为本地确定性后端，不冒充真实环境业务验收。

等待构建时追加库存、应付、付款申请、采购批次及采购单五个组件目录回归：首次同进程运行
245 pass / 4 fail / 4 errors，错误为 React `forwardRef/createContext` 缺失。定位到
`use-payment-request-command.test.ts` 的局部 React 模块 mock，该文件注明必须独立 Bun 进程；
串扰了后续实际 React/Next/Radix 渲染测试。按原有隔离要求逐文件运行同一清单：
**37 个文件、262 项通过、0 失败文件**，包括全部此前失败文件，没有跳过测试、修改业务代码或替换依赖。
同进程混跑仍不可视为通过，测试统一隔离是独立基础设施改进项。

## 开发库备份与迁移

使用既有目标守卫同时核对连接池、5432 直连、明确 project ref `fclnkyatvfvmzgzdqlba`，
拒绝生产 host/project ref。凭据仅进程内使用，不输出、不写 Git、不改项目链接。
Supabase CLI 为已安装 `2.99.0`。

升级前 `migration list`：594 个位置，593 对齐，唯一仅 Local：`20260908010000`。
`db push --dry-run` 精确列出：

```text
20260908010000_extend_warehouse_procurement_rollout_command.sql
SHA-256 914ec61bf3d3f0ee3142127761bb43a76bf06160ae978989ef453874deb87eb5
```

服务器侧 `public` + `supabase_migrations` custom-format 备份：

- `/var/tmp/gooes-rollout-dev-backup.09wscW/public-and-migrations.dump`
- 8,036,593 bytes；目录 0700、文件 0600。
- SHA-256：`a61fb6061ba6ab1533dc1fc4613f9d307b4426b252a95977b97589a6e9ddf76c`。
- `pg_restore --list` 可读：5,691 项、275 项 TABLE DATA、1 项迁移历史表。
- 不是 auth/storage/全局角色的全实例备份，也未执行恢复演练；归档保留在开发服务器，不纳入 Git。

应用前再次执行 dry-run，并断言唯一文件与上述清单完全相同。
随后 `supabase db push --yes --db-url <已校验开发直连>` exit 0，仅应用该版本。
紧接 `supabase migration list`：**594/594 全量对齐，0 差异**；再次 dry-run：
`Remote database is up to date`，无待执行项。未手工 DDL/DML 修库、改写历史或使用 repair。

UTC 2026-09-07 17:28:55 应用前及 17:30:21 应用后，开发服务器数据库只读事务核验：

| 检查 | 前后结果 |
| --- | --- |
| 配置记录数 | 1 → 1 |
| 仓库采购启用数 | 0 → 0 |
| 配置完整对象 MD5 | `55876be64a156ff3c7762766763200ab`，不变 |
| rollout 历史事件完整对象 MD5 | `a5eb10ad63c22e265bab7b4abe374dc5`，不变 |
| migration 记录数 | 593 → 594 |

三个新旧公开 RPC 均 SECURITY DEFINER、固定 `search_path=pg_catalog, public`，
service_role 有 EXECUTE，anon/authenticated 无；私有核心三个应用角色均无 EXECUTE。
本轮未在真实数据库调用变更设置的命令；历史回放、锁竞争与迁移失败回滚证据来自
[隔离验证记录](./2026-09-08-warehouse-procurement-rollout-entry.md)。

## 开发发布状态

main 推送触发既有自动开发流水线，构建 run
[34147912954](https://github.com/LeeFo-china/goose/actions/runs/34147912954)。
共享领域包及 API 变更按现有规则触发 API、Admin、H5、Web、social-video-worker、
cos-reconcile-worker、billing-reconcile-worker 的开发发布，不触发生产发布。

构建 run `34147912954` 已 completed/success，五个镜像全部成功，生产镜像验证步骤按范围跳过。
初始化期间曾遇到 checkout action 下载 100 秒超时，自动重试后继续；没有修改 runner 配置、
重跑不可变构建或绕过验证。一次本机 GitHub 状态查询 TLS 超时也在只读重试后恢复。

自动部署 run [34149680956](https://github.com/LeeFo-china/goose/actions/runs/34149680956)
于 UTC 17:57:13 启动，源码仍为 `65d1ed28`，最终 completed/success。
全部部署步骤、两次迁移历史校验、Web 发布门禁、就绪屏障及最终汇总均 success。

主代理独立 SSH 核验 API、Admin、H5、Web、social-video-worker、cos-reconcile-worker、
billing-reconcile-worker 共 7 个容器全部 healthy，源码均为完整 `65d1ed28` SHA，
构建 run 标签均为 `34147912954`；没有将单个 API 成功当作整轮发布成功。
除下方 API/Admin 镜像外，其余镜像 digest 为：

- H5：`sha256:6f8b4eea27f66955aa76c4fd0f91854c7368f55810b4f308bdc295ad8ef8cb91`
- Web：`sha256:28fdb105c50767f56bbb186c1f6096730c2091eac32bfe375af55f1e335d2440`
- social-video-worker：`sha256:8a8f3065a3645aec4e56bbcc3fd42efc25bee78a75feb622a1f76036c1c8a26d`
- 两个对账 worker 复用下方 API digest。

API/Admin 部署步骤已成功。主代理 SSH 独立确认两个容器均 healthy，源码 SHA 均为
`65d1ed282bcfbbf608b6b8f6d49c288e1fa032e8`，构建 run 标签均 `34147912954`：

- API：`useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:75ceabd9585b0593f2bf6d61c833deb4efca97646ff0d3162ae6d7693c73f43e`
- Admin：`useccr.ccs.tencentyun.com/america_goose/goose-admin@sha256:aab2f8aee9608408f04e9f6e8ef7619125ae693004abf79751723571cc439098`

主代理只读 smoke exit 0：使用此前指定的 `132****5725` 经开发正式登录入口，核对租户为
「固始晴天装饰工程有限公司」，API/Admin 两端 `/auth/me` 身份精确一致。
token/cookie 仅保存在进程内，没有输出或落盘；未发送短信、改认证配置、操作其他员工。

| 真实 GET | API 直连及 Admin 代理结果 |
| --- | --- |
| `/warehouses?page=1&pageSize=20` | 200，1 条，total=1 |
| `/inventory/balances?page=1&pageSize=20` | 200，0 条，total=0 |
| `/inventory/transactions?page=1&pageSize=20` | 200，0 条，total=0 |
| `/supplier-purchase-batches?page=1&pageSize=20` | 200，16 条，total=16 |
| `/supplier-purchase-orders?page=1&pageSize=20` | 200，14 条，total=14 |

以上均校验分页、最多 20 条和返回行租户范围。
API `/supplier-settings` 为 200，实际 `warehouse_procurement_enabled=false`；
租户身份请求平台设置返回 403，匿名仓库请求返回 401。
Admin 登录后的仓库、库存、采购批次 SSR 页面均 200；这是 HTTP/SSR 可达检查，
不等同于真实平台超管点击开关或小程序真机验收。
除正式登录入口的身份同步外，未发送配置、采购、收货或财务写命令。

UTC 18:05:18 最后只读数据库核对仍为 594 个 migration、最新 `20260908010000`，
配置与历史事件 MD5 与应用前一致，仓库采购启用数仍为 0。

发布前 API/Admin 均 healthy，源码 `b3d25ce3dde5533a256659007697fa6846c6d2ed`，
构建 run `34128116804`。恢复参考镜像：

- API：`useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:1a8643294d7f5b43c5147d150359e5b15858ace3d0af919d0d1e5bf537a2b18e`
- Admin：`useccr.ccs.tencentyun.com/america_goose/goose-admin@sha256:2a3dae3bdd4678ee9c212eb0e47d4418f45d7930886a93b7c477f609fd81742c`

数据库保留兼容重载，不回删存量事件；异常时保持仓库采购关闭，应用恢复通过既有受控发布流程，
数据库修正使用受审前向 migration。此处仅记录恢复准备，不宣称已经回滚成功。

## 安全清理

部署与 smoke 成功后，检查本地分支尖端 `65d1ed28`、远端分支尖端 `a7fef0cc` 均已包含于 main。
先归档原 worktree 的 `.artifacts`、Admin 测试结果和本地 Supabase 元数据：

- 保留目录：`.artifacts/warehouse-stage-b-retained-20260908.gySgM7/`（不纳入 Git）。
- 归档：`worktree-evidence.tgz`，1,772,226 bytes，目录 0700、归档 0600。
- SHA-256：`a4c122cc135af4cbcd017a57a551e1d85809325e905789d1fef56b702c6d8fd9`。
- 29 个文件与原 worktree 逐字节比对一致；原 `.artifacts` 另移到该目录的 `original-artifacts/`，没有删除。

随后确认 worktree 无未提交/未跟踪项，使用不带 force 的 `git worktree remove` 删除
`.worktrees/warehouse-procurement-inventory-stage-b`，`git branch -d` 删除本地分支，
`git push origin --delete` 删除同名远端分支；执行 worktree prune 后，仅剩根 main 工作树。
再次 ls-remote 确认远端分支不存在；主仓库三处共享 node_modules 均仍存在。
其他 archive 分支和根目录原有 `.artifacts` 未清理。源码已在 main，验收材料可从上述保留目录恢复；
被移除的构建缓存可重新生成。
