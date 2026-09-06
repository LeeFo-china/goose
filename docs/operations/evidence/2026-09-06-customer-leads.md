# 客户线索通用后端验证记录

日期：2026-09-06。分支 `feature/customer-leads-foundation`，基线 HEAD `28d1ae3761766093d3cffe2c8547c743e5e7c202`。当前工作未提交、未推送。

后续 Task 6–7 的 Admin、domain 1.20.0 本地制品和浏览器验收已完成，见 [Admin 与交接验证记录](./2026-09-06-customer-leads-admin-handoff.md)。开发 API/Admin 也已发布，见 [开发发布记录](./2026-09-06-customer-leads-dev-release.md)。下文“未提交”和“发布与剩余边界”保留后端阶段当时状态，不代表当前发布状态。

## 本次实现

- `/tenant/customer-leads` 十条 HTTP 路由：分页列表、两类员工选项、详情、预约、跟进和四类命令。
- 新入口固定 customer_lead 权限；共享服务以内部固定模式复用现有业务，不复制或伪造 authContext。命令以 read/action 范围交集校验同一份线索，并将交集用于转换 preflight。
- 独立客户访问投影，列表按页计算一次 customer.read 范围；命令成功不隐式暴露客户 ID。
- 普通无预约跟进、同租户同手机号转客户、不覆盖已有客户负责人、无预约客户来源事实去重。
- 旧 HTTP 路径、旧权限、严格返回字段及 DOUYIN 错误保留；旧普通跟进输入仍要求预约。物理表、版本、操作账本不复制。
- SQL 复用最新命令定义，通过重命名与兼容包装共享核心。只读新旧列表使用 STABLE，保持 count/page 的同一语句快照。

## 静态与 API 验证

已执行并通过：

| 检查 | 结果 |
|---|---|
| `bun run api:typecheck` | 退出 0 |
| `bun run api:build` | 退出 0，957 modules |
| `bun scripts/check-api-file-size.ts` | 通过，非生成 API 文件不超过 500 行 |
| `bun scripts/check-customer-lead-foundation.ts` | 77 项离线断言通过 |
| 新旧线索 controller/service/repository/public/access 定向测试 | 60 pass / 0 fail（10 文件） |
| 两类员工选项 service/repository 与 system-admin 权限回归 | 22 pass / 0 fail（5 文件） |
| `bun test packages/domain/src/permission.test.ts` | 18 pass / 0 fail |
| `git diff --check` | 退出 0 |

定向测试执行方式为 `bun test --cwd apps/api src/...`。相关新增文件：`services/tenant-customer-leads.test.ts`、`tenant-customer-leads-core.test.ts`、`repositories/tenant-customer-leads.test.ts`、`controllers/tenant-customer-leads/index.test.ts`。

HTTP smoke 使用真实 Fastify.inject、JWT 验证、认证 hook、controller、service、access policy；数据库身份绑定/权限上下文与线索行使用测试替身。Admin auth 与微信员工 auth 为 200，微信客户为 403，访客/Douyin session/非法或缺失 token 为 401，超限分页为 400。此项不是实际微信账号或部署服务端到端验收。

本轮先失败后修复的关键回归：

1. 通用入口最初仍走 douyin_lead.read；内部固定权限模式改为 customer_lead.read，保持原身份对象。
2. 转客户首次创建后，重试时 preflight 已找到客户。旧摘要绑定了首次的创建条件，导致合法原请求重试冲突。SQL 仅接受能重建并匹配原摘要且关联同一已记录客户的重放，不重写旧账本；服务允许幂等成功回执保留 created_customer=true。
3. 分别校验 read/action 时可能在两次读取间改派，转换 preflight 只复核 action 范围而漏掉 read。现在先求交集、只读一次 access，转换再次校验交集。新增 preflight 改派回归先红后绿。
4. SQL 无预约 INSERT 被原 result_payload CHECK 拒绝；migration 同步扩展为预约三字段全部为 null 或全部有效，保留旧记录完整性。
5. SQL 审查发现 count/page 两个查询的 VOLATILE 快照差异；新旧查询均标记 STABLE，保留相同过滤谓词。

API spec 复核及 code quality review 通过。SQL spec/code quality 复核通过（含 STABLE 与结果 CHECK 修复）。

## 开发库预检

目标通过现有严格 helper 校验：`api-dev.goodcms.cn` / `postgres` / TLS require。没有使用根脚本中固定云项目 ID，也没有手工执行远端 DDL/DML。

- 12 个相关远端函数体与仓库最新 migration 一致，包括废弃 convert(5) 的 `20260821105300` 定义。
- 活跃旧命令 owner=postgres、SECURITY DEFINER、仅 owner/service_role EXECUTE；旧废弃重载 owner-only。
- 原来源 guard 与五项快照校验函数匹配 `20260821105650`，SECURITY INVOKER、owner-only。
- marketing_leads、customer_sources、follow_ups、appointments 四个表 owner 均为 postgres。
- 无预约客户来源现有 0 条、重复组 0，不会被新增 partial unique index 阻挡。
- `db push --include-all --dry-run` 退出 0，只列出：
  - `20260906040943_tenant_customer_lead_permissions.sql`
  - `20260906043943_tenant_customer_lead_commands.sql`
- `20260906100000_fix_supplier_purchase_order_cancel_timestamp.sql` 已在远端应用，不属于本次待执行内容。由于本次时间戳早于远端末项，必须使用 include-all；不是为了顺带应用其他 migration。

## 数据库与查询验证

本地 Supabase 为 `supabase_db_gooes` 容器，端口 127.0.0.1:54322。其 migration history 落后于开发库，因此不能 blanket db push。SQL 测试将本次 migration 与合成 fixture 放在同一个本地事务中并 ROLLBACK，禁止禁用 guard，未持久化测试数据或 schema。

SQL smoke 文件：`scripts/smoke-customer-lead-commands.sql`。主代理独立执行两项 migration + 普通/预约跟进、旧新重放、来源不可变、跨租户与直接写入保护断言，退出 0 并 ROLLBACK；SQL 实施代理在最终脚本额外加入 5000 条合成线索和 EXPLAIN，再次退出 0 并 ROLLBACK。原 guard 未禁用。

本地复跑方式：用 Bun 读取这两项 migration，去掉各自外层 BEGIN/COMMIT，依次拼在单一 BEGIN 后；设置 `customer_lead_smoke.local_endpoint=127.0.0.1:54322`，再拼入 smoke（去掉其首个 BEGIN，保留末尾 ROLLBACK）。只通过固定 `docker exec -i supabase_db_gooes psql -U postgres -d postgres -X -v ON_ERROR_STOP=1` 的 stdin 执行。此设置只是二次防误用，不能拿来证明任意远端连接属于本地。

5000 条合成记录（同一租户，连同原 fixture 共 5004 条）：

| 场景 | 执行时间 | 计划 |
|---|---|---|
| 列表 20 条 | 0.031 ms | Index Scan idx_marketing_leads_created_at + Incremental Sort |
| 负责人过滤 20 条 | 0.023 ms | 相同已有索引 + Incremental Sort |
| 关键词 1 条 | 7.362 ms | Seq Scan，过滤 5003 条 |
| count 5004 条 | 0.804 ms | Seq Scan |

未选用 GIN，不能据此声称更大或多租户分布已经验收。没有新增缓存、队列或依赖，也没有为了小样本强制索引；唯一新增索引用于普通来源事实去重。

开发库真实样本只读 EXPLAIN（READ ONLY 事务，每条超时 10 秒）：

| 场景 | 返回行数 | 执行时间 | 计划 |
|---|---|---|---|
| 列表 | 2 | 0.063 ms | Limit → Sort → Seq Scan |
| 负责人过滤 | 1 | 0.055 ms | Limit → Sort → Seq Scan |
| 三字段关键词 | 1 | 5.055 ms | Limit → Sort → Seq Scan |

现有 Douyin 线索只有 2 条、1 个租户，底表共 4 行；shared hit=1/read=0。小表顺序扫描合理，但该样本不能证明大数据量性能，不能据此宣称压力验收充分。未输出真实姓名、手机号或过滤值。

## 开发库应用结果

通过严格 api-dev target helper 执行固定版本 Supabase CLI `db push --yes --include-all --db-url <validated-development-url>`，仅应用本次两项 migration，退出 0。未连接生产目标，未手工更改远端 migration history。

应用后实际执行 `supabase migration list` 并逐行比较：**579 条版本，0 项 Local/Remote 差异**，两项本次版本均双侧存在。

只读 catalog 与 service_role 实际 RPC 验收（READ ONLY 事务，退出 0）：

- 4 条新权限均 active；13 个有效租户 system_admin 共 52 条 all 授权，普通角色没有被补授权。
- 5 个新 RPC 的 owner/SECURITY DEFINER/ACL 正确，新旧列表均 STABLE。
- 预约关联列 nullable、payload CHECK 已 validated；来源 partial unique index 有效且唯一。
- 对相同租户调用新旧列表，完整业务 JSON 相等，total/list count 均为 2。
- 空 visible scope 返回标准空结果；pageSize=100 成功，101 与未知 source 返回 SQLSTATE 22023。
- 没有远端写命令 smoke 或持久测试 fixture；写操作证明来自上述本地回滚事务。

数据库类型已从此开发库实际生成结果中定向同步到 `apps/api/src/types/database.ts`：follow_ups 的 Row/Insert/Update 预约字段 nullable、五个通用 RPC 及私有 source metadata helper。未覆盖其他领域类型。Postgres 生成器不会将函数参数的“允许显式 null”反映成 nullable 类型，因此 HTTP/业务输入的空值语义仍由 domain schema 和现有 JSON RPC gateway 表达，不手工篡改生成结果。

标准 gen-types 首次因 Docker DNS EAI_AGAIN 失败；使用已安装官方 `postgres-meta:v0.96.4` 镜像，按主机 DNS 解析结果仅给临时容器添加目标主机映射，保持原开发库域名与 TLS，且默认事务设为只读。随后发现生成器单连接队列的默认 15 秒等待上限不足；仅在本次临时容器将 PG_CONN_TIMEOUT_SECS 设为 120（每查询仍限制 60 秒），生成退出 0。未修改系统 DNS、数据库配置或业务超时；临时容器自动删除。镜像实际代码确认了所有使用的参数。

## 发布与剩余边界

- 未改 Admin 现有抖音工作台及菜单；新 Admin 客户线索入口下一阶段实施。
- orange 仅只读核对工作台、services、权限与路由，未编辑、构建、生成或执行 Git 写操作；小程序页面和真机双端验收由小程序团队完成。
- 当前没有部署新 API 进程或发布新 domain 包，不能把本地 HTTP smoke 当成远端 API 已上线。
- 实际双账号、双会话并发和真机操作仍需联调；本次版本/幂等/事务边界以定向回归及本地 SQL 断言证明。
- 回滚采用停用新入口与前向 migration；不得删除新跟进/来源事实，不得在已有空预约跟进后恢复 NOT NULL。
- 第一阶段 Admin inventory 分组既有失败仍属无关问题，本轮未修改；详见 foundation evidence。
- GoodCMS RAG 本轮查询返回 502，使用本地代码为准，未上传知识库。按小程序交接技能产出交接文档并守住 orange 只读边界。
