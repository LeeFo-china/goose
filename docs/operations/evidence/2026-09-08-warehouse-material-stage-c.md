# Stage C 仓库项目领退料：本地交付证据

日期：2026-09-08。基线 `ad22e9e7`；分支 `feature/warehouse-project-material-stage-c`。

## 当前边界

阶段 C 本地实现完成：数据库原子命令、API、Admin 领退料页面、独立租户开关及净成本汇总均已实现并验证。本文件是本地交付证据，**不是远端发布或真实租户业务验收证明**。调拨、盘点和手工调整不属于本阶段交付。

本轮只修改 gooes 的独立 worktree。没有向远端应用 migration、启用实际租户、写实际业务单据或部署服务。Orange 仅只读参考，未改动。

## 数据库验证方法

`scripts/verify-warehouse-stage-b-database.ts` 只读取本地 `supabase_db_gooes` 的 migration 元数据、schema 和函数 ACL。当前本地源基线为 `20260828160000`、527 条 migration。脚本将其恢复到随机命名的离线 PostgreSQL 容器，再按顺序应用仓储／采购领域后续 migrations，用完全合成的租户／员工／商品／订单运行验收，最终销毁该容器。

这是领域 schema 升级和合成数据验收，不是完整历史数据迁移验收。脚本未忽略 SQL 错误，不执行依赖真实历史数据的无关修复迁移。源数据库没有被写入。

新增 migration：

- `20260908015230_create_warehouse_project_material_commands.sql`：单据、明细、库存／成本来源、原子命令、权限及分页读取。
- `20260908015649_warehouse_net_project_costs.sql`：四个实际预算／风险函数按方向汇总净成本，保留原函数签名、权限和已有修正。
- `20260908020216_warehouse_material_rollout_command.sql`：独立 C 开关的原子配置命令及兼容重放。
- `20260908023924_read_warehouse_material_settings.sql`：仅返回有效 C 开关的仓库角色读取入口。

## 已验证结果

| 层次 | 实际证据 |
| --- | --- |
| 库存／成本原子性 | 草稿与提交不扣库；确认领料同时生成库存和项目成本事实；注入成本写入失败后余额、单据状态和命令回执均回滚 |
| 分币尾差 | 库存 `0.3 / 0.02` 全部领出，再分三次退 `0.1`，金额依次 `0.01 / 0.00 / 0.01`，库存价值与项目净成本完全回归 |
| 权限和状态 | 跨租户、错误员工、项目范围、manage／approve／stock 权限交集、关闭开关、停用仓库、非法精度、过期版本、同键不同请求及来源冲突 |
| 超领／超退并发 | 两条独立数据库连接，观测到第二连接真实 Lock 等待；只有一个成功，失败方无库存、状态和回执副作用 |
| 采购与领料竞争 | 真实采购批次→审批→履约确认→收货，分别验证收货先持锁和领料先持锁；数量、价值和应付来源均正确，重放不增加事实 |
| 完整采购领退料链路 | 采购收货支持领出 `1`，后续又发生收货，再退原单 `0.4 / 0.6`，退料金额 `0.03 / 0.04`；最终库存 `2.2`、价值 `0.15`、项目净成本 `0.01`；退料未新增应付 |
| 净预算／风险 | 实际风险筛选、采购预算 preflight、提交及审核均使用净成本；新领料 `0.02` 会令 `0.08` 预算下 `0.07` 采购超预算，退料后恢复可用预算 |
| 开关兼容 | C 只依赖 module；独立于新采购开关；省略字段保留现值；真实在 C schema 之前生成的旧回执，在启用 C 后仍按原 JSON 重放，不改变当前设置 |
| 专用开关读取 | 不要求 `supplier.view`；`project.read` 与 stock/manage/approve 任一权限交集；关闭或缺设置返回 false，不泄露其他配置 |
| 老采购回归 | 现有 `receipt-accounting.sql` 验证项目直采、仓库收货和既有应付兼容 |

### 真实 HTTP/API 集成

命令增加 `--material-api-smoke` 后，启动本地 Fastify 控制器及真实 service/repository/Supabase 客户端。HTTP 经仅允许本阶段 RPC 的本地转发器进入离线容器内固定版本 PostgREST，再执行真实数据库命令。

仅有一处测试替身：登录解析替换为受信任的合成员工上下文。控制器校验、service 权限、repository 严格解析、Supabase HTTP、PostgREST 及 SQL 身份／项目授权均为真实代码。**不代表真实登录、订阅中间件或部署环境验收**。转发器只接受本次临时生成的 service JWT，不转发实际凭据，没有向宿主机发布数据库端口。

25 次真实 HTTP 请求覆盖开关、项目选项、缺失幂等键、拒绝成本字段、保存／重放／异载荷冲突、过期版本、审批权限、领料确认、两次退料、精确小数字符串、详情和空页总数、库存来源、伪造用户的 SQL 拒绝。将合成项目名称设为 null，实际验证项目选项和单据摘要均显示“未命名项目”。独立 SQL 前后快照验证：

- 库存数量、库存价值和项目净成本恢复原值。
- 只新增 3 条库存流水、3 条成本事实、7 条命令回执。
- 供应商应付数量不变。

### 分页执行计划

`material-read-performance.sql` 增加 20,000 张领料单和 20,000 张退料单，分布于 10 个仓库和 100 个项目。SQL 从实际 RPC 函数体提取，先与真实 RPC 的完整结果逐值比较，再执行 `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON)`。

两类单据各验证首页、深页、越界空页、仓库、仓库＋状态、项目、仅参与项目、参与项目越界空页，共 16 种情况。断言精确页长、种子行金额／明细数、非空页存在明细扫描、扫描上限及无临时写盘，防止“全返回空页”假通过。参与项目范围还验证总数恰为 200、所有结果均属于授权项目，项目选择器仅返回该项目。

本地该数据量下，每页 20 条时只扫描 20 条对应明细，空页扫描 0 条明细。此结论仅覆盖该合成数据下的列表核心 SQL，**不是完整 RPC 或生产 SLA**。来源读取沿用先分页、后关联的现有查询结构；在应用 C migration 后，既有 `inventory-read-performance.sql` 的 11 项真实嵌套执行计划断言也通过（先执行 `receipt-weighted-cost.sql` 与 `inventory-transactions-legacy-reference.sql` 作为其依赖）。

### 生成类型和审查

固定 `postgres-meta:v0.96.4` 从已迁移的隔离数据库生成真实类型。仅同步本阶段 8 张表和 15 个函数条目，保留无关历史类型内容及顺序；不以手写猜测代替数据库结构。类型同步器包含缺失类型失败、无关条目保护、原有顺序保护及幂等测试。

数据库单元、净成本单元、平台开关、API／Domain、专用设置接口均完成独立规格与代码质量审查。API 审查发现合法空项目名被严格解析器拒绝；已通过 RED→GREEN 修复为“未命名项目”，没有放宽成本或身份字段。

本次变更的 18 个 API 测试文件逐文件启动 Bun 进程运行，全部通过；相关财务单测初始化 Supabase 模块需要环境变量，使用 `http://127.0.0.1:1` 和合成测试 key，实际查询为测试注入的 repository。Domain 单测 1 项、平台开关 Admin 单测 6 项、领退料与库存相关 Admin 单测 29 项、类型同步及执行计划解析测试 12 项通过。Domain build、API check（类型、构建、文件边界）及 Admin check 通过。

Admin 生产构建完整退出 0，包含编译、类型、97 页静态生成、构建追踪和 standalone 资源同步；新增 `/warehouse-issues`、`/warehouse-returns` 已进入构建路由。

### 平台开关浏览器验收

使用真实 Admin 页面和确定性本地 HTTP 夹具，桌面及 375px 共 16 项通过。覆盖 C 独立于采购链、仅 module 依赖、只读权限、完整版本请求、503／408／429 未知结果冻结与重放、刷新恢复、409 后重新确认、成功后读取失败不重复提交。人工查看 `materials-independent.png` 的两个尺寸截图，开关、依赖提示和窄屏布局完整，无整页横向溢出。

审查补充验证旧客户端省略 C 时不能停用 module：先复现夹具错误返回 200，再统一有效 C 值的校验与保存，完整 16 项重新通过。此修正限于测试夹具；真实数据库相同规则已有 SQL 验证。

截图位于 `apps/admin/test-results/supplier-rollout/` 对应测试目录，不纳入版本控制。浏览器 HTTP 夹具只证明前端交互；真实过账证据见上文离线数据库与 API 集成。

### 领退料工作台浏览器验收

`playwright.warehouse-materials.config.ts` 使用真实 Admin 路由和确定性 HTTP 夹具；最终桌面 14 项、375px 14 项，共 28 项全部通过，无自动重试。覆盖创建／保存／提交／确认领料、部分退料、数量及成本只读展示、取消、分页选项、25 行完整草稿编辑、列表及明细分页、权限、关闭／错误配置下历史读取、库存来源和原领料链接、过期搜索响应、版本冲突、未知结果持久化与原请求重放、成功后读取失败。

审查发现并通过 RED→GREEN 修复：同路由原单链接不更新选中单据；HTTP 200 但回执缺失／错单／错状态／错版本时误报成功；合法大写 UUID 深链的回执识别与刷新恢复。当前先核对回执再清除冻结命令，异常回执仍保留原 path/body/key；UUID 仅比较身份时忽略大小写，不改写冻结请求。

读取失败夹具曾因取消的首轮请求消耗一次性故障而出现不确定结果；trace 确认原因后改为持续故障，测试显式恢复，再点击重读，仍断言仅发生一次业务 POST。该修正仅涉及夹具，不改变生产读取逻辑。

人工核验桌面与 375px 退料详情、375px 草稿及底部“保存草稿／关闭编辑”截图：控件可达、无整页横向溢出，宽明细表在自身容器内横向滚动。合成退料展示数量 1、金额 8、累计已退 1、可退 1.0001，并有浏览器字段断言。截图在 `apps/admin/test-results/warehouse-materials/` 对应测试目录，文件名 `material-return-1440.png`、`material-return-375.png`、`material-draft-375-actions.png`，不纳入 Git。专用测试服务已关闭。

Admin 实现提交 `caa2697e`；最终独立规格及跨层代码质量审查通过。主工作区及其他 worktree 未修改，本分支保留待集成。

## 可复现命令

在本 worktree 根目录执行（需要现有本地 Supabase schema 与已安装 Docker 镜像）：

```bash
bun scripts/verify-warehouse-stage-b-database.ts --material-api-smoke \
  scripts/fixtures/warehouse-stage-b/material-contract.sql \
  scripts/fixtures/warehouse-stage-b/material-workflow.sql \
  scripts/fixtures/warehouse-stage-b/material-settings.sql \
  scripts/fixtures/warehouse-stage-b/material-rollout.sql \
  scripts/fixtures/warehouse-stage-b/material-security.sql \
  scripts/fixtures/warehouse-stage-b/material-net-cost.sql

bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/material-workflow.sql \
  scripts/fixtures/warehouse-stage-b/material-read-performance.sql \
  scripts/fixtures/warehouse-stage-b/material-concurrency.sql \
  scripts/fixtures/warehouse-stage-b/material-receipt-race.sql \
  scripts/fixtures/warehouse-stage-b/receipt-accounting.sql

bun test scripts/warehouse-material-type-sync.test.ts scripts/warehouse-inventory-plan-notices.test.ts
bun run --cwd apps/api check
bun run --cwd packages/domain build

# 以下从 apps/admin 执行
bun run check
bun run build
env -u NO_COLOR bunx --no-install playwright test --config=playwright.supplier-rollout.config.ts
env -u NO_COLOR bunx --no-install playwright test --config=playwright.warehouse-materials.config.ts
```

需要更新生成类型时，在第一条命令追加 `--generate-material-types`；这个明确选项会更新当前 worktree 的 `apps/api/src/types/database.ts`。普通验收不写生成类型。

API 单测须从 `apps/api` 执行以解析 `@/*` 别名；React mock 单测须沿用现有逐文件隔离策略。

## 发布前仍需执行

- [x] 完成 Admin 页面及桌面／375px 浏览器验收，记录实际命令和截图。
- [x] 最终相关静态检查、构建和独立审查；下述既有路由清单问题仍保留为集成门禁。
- [ ] 经授权确认目标环境及待执行 migration；应用后运行 `supabase migration list` 核对 Local/Remote 对齐。
- [ ] 阶段 B 实际环境完整采购／收货／付款验收，及 C 实际员工登录、项目权限、业务过账和小程序真机联调。
- [ ] 经授权为测试租户启用独立 C 开关，验证停用／回退流程，再决定部署范围。

已知基线门禁问题：`tenant-service-route-inventory.test.ts` 的全量路由清单对 11 条现有抖音素材路由缺少白名单；相关实现和测试相对 `ad22e9e7` 未变，失败中没有 Stage C 路由。定向仓储路由能力／访问测试通过，不将该基线问题伪报为“全量测试通过”，也未越界修改抖音模块。

回退优先通过平台关闭 C 开关，保留历史单据、成本方向及幂等回执。已有退料事实后不能恢复无方向的成本求和，也不能删除事实表；数据库结构回退需另行设计前向 migration，不能用直接 DDL/DML 修库。
