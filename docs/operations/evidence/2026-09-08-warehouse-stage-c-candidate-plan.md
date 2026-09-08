# 阶段 C 固定候选与开发迁移 plan 验收

后续检查点（2026-09-08 16:27 后）：用户另行确认后，原四条 C migration 已 apply，开发库 599 / 599 对齐；同候选 API / Admin 开发发布成功。开关及真实业务验收仍未执行。详见[开发 apply 与发布证据](2026-09-08-warehouse-stage-c-dev-release.md)。下文保留本次 plan 阶段的历史范围。

2026-09-08。执行用户确认的下一步第 1、2 项，**到数据库 apply 前停止**。用户指定测试租户为“固始晴天装饰工程有限公司”，允许选择已有权限的员工。本轮不部署 C、不启用开关、不写业务单据、不修改员工授权、账号或登录配置。

## 固定候选

- 发布候选 SHA：`983b775ef67bdc3ccd1ee223ace00351dc2fa552`。
- 固定候选分支：`release/warehouse-stage-c-dev-20260908`，指向上述 SHA，后续证据提交不移动此分支。它是操作约定冻结的 Git 分支，不是服务器强制不可修改的引用；每次执行前仍必须核对 SHA。
- 工作分支：`feature/warehouse-project-material-stage-c`。已同步 `fix/warehouse-orphan-remediation` 的独立发布证据；仅文档末尾新增检查点发生冲突，两段历史都完整保留。
- 与此前 C 候选 `0ce24f2a` 相比，变化仅为两份发布证据文档，生产代码、SQL 和依赖均无变更。
- 使用既有隔离 worktree，主工作区及其他 worktree 不变；没有改动 Orange。

## main 集成检查：保留待合并

独立只读审查确认：fix `bdba5a49` 合入 main `ad22e9e7` 会触发自动构建 API、Admin、H5、Web、social-video-worker，并部署上述服务及 cos / billing worker。原因是 fixtures 和辅助验证脚本落入 `scripts/resolve-dev-change-plan.mjs` 的 unknown-runtime 分类；即使只有 API 改动，既有分类也包括 worker。

因此本轮完成的是集成影响核查和候选准备，**不是 main 合并完成**。没有修改分类规则、跳过 CI、依赖迁移门禁故意失败或用特殊提交消息绕过发布。扩大服务发布范围需另行确认；当前 C 开发验收可使用独立固定候选，不依赖 main 合并。修复发布证据仍见[独立开发 API 发布](2026-09-08-warehouse-orphan-cleanup-dev-release.md)。

## 迁移 plan：PASS，不代表 apply

[Migrate Dev Database #34200708293](https://github.com/LeeFo-china/goose/actions/runs/34200708293)：`completed / success`，07:42:49–07:42:59 UTC，headSha 精确为上述候选。dispatch 使用当时指向该 SHA 的 `feature/warehouse-project-material-stage-c`，参数 `mode=plan`、`confirm_dev_project_ref=fclnkyatvfvmzgzdqlba`。

- 开发目标：`api-dev.goodcms.cn`，SSH 主机核对为 `VM-0-11-ubuntu`；未使用生产目标。
- before / after 均 595 条，latest 均 `20260908062915`。
- pending_count=4，applied_count=0，applied_versions 为空。
- 同一候选的 CLI `migration list` 完整比较：Local 599 / Remote 595，remote-only 0，pending 与 workflow 完全相同，见[完整历史](2026-09-08-warehouse-stage-c-candidate-history.txt)。归档只去除 CLI 表格行尾空格以通过 Git 空白检查，599 行和三列内容均与原输出逐值一致。

| 文件（supabase/migrations/） | SHA-256 |
| --- | --- |
| `20260908015230_create_warehouse_project_material_commands.sql` | `819af66da060dd9a950f3c7c00fd7ab880a237b8f1a26d7b9789a912aadd42f0` |
| `20260908015649_warehouse_net_project_costs.sql` | `9ec3083f10eb20c689e8ea03089adc327dbbd3842bd8940d45185e9712e8ec5a` |
| `20260908020216_warehouse_material_rollout_command.sql` | `da40dce9ac76456a80bcce35db63f9dce196678fc84a5443ccbc1918e040fa74` |
| `20260908023924_read_warehouse_material_settings.sql` | `5e126226f9d7dd567f9537ee3f75f776b7f5ad44014d0466c4f7c58d4f66ff8b` |

已审查现有工作流：读取完整已执行版本集合后求差，而不是只检查大于 max(version) 的编号，因此不会遗漏这四条较早迁移。不需要改编号、repair 历史或修改工作流。plan 的目标数据库路径只有 SELECT，迁移 SQL 和历史 INSERT 均受 apply 分支保护；它仍会写 runner checkout / 临时归档 / 报告，而且没有数据库级 READ ONLY 事务，不能把它描述为权限层强制只读。plan 不校验 remote-only、文件 hash 或 SQL 语义，因此另行保留完整 CLI 差集与文件 hash。

## 测试租户与现有员工

- 租户：固始晴天装饰工程有限公司，`3eebca47-961f-4899-b976-a3d3208d326b`，active；精确名称查询返回 1 条。
- 选择员工：风清扬，`d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`，active，已有 system_admin 角色。
- 数据库真实权限 helper 确认 `project.read`、`inventory.warehouse.view`、`inventory.stock.view`、`inventory.issue.manage`、`inventory.issue.approve` 全部有效；真实权限上下文 RPC 对这五项均返回 scope=all，相关 overrides 为空。
- 绑定的 auth.users 记录存在、未删除、没有正在生效的封禁；项目范围 helper 计算可访问项目 17 个。本轮未输出手机号、凭据或其他员工明细到版本化证据。
- 租户既有 module、ownership reads、snapshot v1、purchase batch workflow、warehouse procurement 均为 true，设置 version=15；C schema 尚未应用，不能把现有 B 开关视为 C 已开启。

这些只证明现有身份与数据库授权适合作为后续验收候选，不证明实际登录、验证码通道、订阅中间件或浏览器会话已验证。本轮未登录、未伪造 token、未绕过权限，后续真实验收必须走正常登录流程。

## 本轮新鲜验证

- API `bun run check`，Domain `bun run build`，Admin `bun run check && bun run build` 全部 exit 0；Admin 完整生成 97 页并同步 standalone 资源。
- 相对 origin/main 的 21 个变更相关 API 测试文件，从 apps/api 逐文件独立 Bun 进程运行，全部 exit 0；包括真实路由清单的 1,646 断言。涉及 Supabase 初始化的测试使用本地不可达端点和合成 key，不连接真实库。
- 5 个变更相关 Admin 单测文件逐文件隔离：21 pass / 0 fail；Domain 与类型同步、计划解析三文件：13 pass / 0 fail。
- 权限边界及 `git diff --check` 通过。
- 隔离 PostgreSQL 的契约、领退料、设置、旧回执、权限、净成本六组 SQL 及 25 次真实 Fastify→PostgREST→SQL 请求通过，库存和净成本恢复，新增事实数量精确且没有新增应付。
- 另一次隔离运行通过 16 项分页核心 SQL 执行计划、独立连接超领 / 超退并发、采购收货与领料竞争及原采购记账回归。临时容器由现有 runner 清理。
- 没有重跑浏览器回归；此前 28 项领退料及 16 项开关浏览器证据仍是历史合成 HTTP 夹具结果，不宣称本轮真实租户已过账。

上述命令和数据库隔离边界沿用[本地交付证据](2026-09-08-warehouse-material-stage-c.md)，没有生成类型或改业务代码。知识库查询返回 502，本轮以当前仓库和开发库只读证据为准，未同步知识库。

## 备份、容量及服务状态

07:42:28 UTC 只读采样：migration 595、warehouse 1、缺父租户孤儿 0、inventory_transactions 0、project_cost_events 4；没有超过一分钟的其他事务或等待锁。该锁结果是采样，不保证后续 apply 时仍无竞争。

已完整恢复验证的备份 `/var/tmp/gooes-orphan-postapply-backup.f8aNydta` 仍保留：database.dump 8,447,768 bytes，SHA-256 `d797c256f15096411260afcfde5700af81b73ebb7236f10c14fe9d696e0b9c45`；roles.sql 6,846 bytes，SHA-256 `c83a0457f62deaeb40b3565291906b36bed667c377a2c341316825ba370aafe4`，与[原恢复记录](2026-09-08-warehouse-orphan-dev-apply.md)一致，均 mode 0600。本轮核验的是既有备份完整性，未重新执行完整恢复。备份时点仍为 14:55:58（Asia/Shanghai），不能视为未来 apply 时点快照。

开发机可用空间采样为 3,797,200,896 bytes（94% 已用）；未删除备份、镜像或日志。后续 apply / 构建前需重新核对余量，并刷新获准变更前的备份；容量不满足时先停下单独处理。

API 仍运行已发布修复 `678dd4a3`，Admin 仍为 `ad22e9e7`，均 running / healthy。本轮没有部署任何服务。

## 独立审查

规格审查和后续质量 / 安全证据审查均无阻塞问题。规格审查独立核对 GitHub run、refs、完整迁移集合和 hash；质量审查核对文档链接、范围边界、候选可追溯性及无凭据泄露。真实数据库权限、服务状态和当前备份存在性由本轮主代理只读采样验证，审查代理未声称重复访问数据库。这些审查只批准提交准备证据，不批准 main 合并或 C apply / 部署。

## 下一确认点

仅在用户确认后，对固定候选执行上述四条 C migration 的开发 apply。执行前重核远端 ref SHA、完整历史、四文件 hash、函数 / 约束兼容、锁风险与新鲜备份；任一漂移停止重审。应用后必须 CLI migration list 验证 599 / 599 完整对齐（latest 仍可为较晚修复编号），再做权限及默认关闭核对。

API / Admin 发布、测试租户 C 开关和真实业务验收仍是后续步骤；main 全服务自动发布不包含在上述四条数据库 apply 的确认中。尚未选定实际业务项目、SKU、数量或付款金额，不因员工有权限就擅自写入现有业务数据。
