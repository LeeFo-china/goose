# H5 客户线索生产发布记录

日期：2026-09-06。范围：统一客户线索、租户 H5 接入、当前候选包含的抖音采集配置及城市合伙人审核交互。

## 发布依据与边界

- 用户要求生产发布，并确认“小程序生产版已经发布”。本记录没有独立验证微信发布后台的包版本。
- 小程序此前报告 39 项本地测试、类型检查及构建通过；真实接口联调、完整权限矩阵和微信真机验收仍未完成，不计为本次发布成功依据或自动标为通过。
- 只发布 `api,admin`，不发布 H5 前端、Web、worker 或 npm domain 包；不修改 orange。
- 当前工作区的共享包、锁文件及其他未提交改动不进入此次不可变候选，也未被覆盖、提交或清理。

## 不可变候选

- Tag：`v2026.09.06.2`。
- Commit：`18de9a170123a9f73edd1c61b060df359d27ee39`。
- [候选构建 34035422027](https://github.com/LeeFo-china/goose/actions/runs/34035422027)：成功。
- 已下载并使用仓库 `verify-production-release-candidate.mjs` 校验 candidate、build-plan 和 API/Admin manifests，服务范围及 SHA 一致。

| 服务 | 候选 digest |
| --- | --- |
| API | `sha256:29776296e6f6d52b333eaa2f0d41f31d99a3d8678f232bff539818b64b25ef82` |
| Admin | `sha256:46f13f5e0e82ee7ee3fd72e81a79f771f7384536ee47b825df3a76aaf9c6719d` |

发布前实际容器：API revision `28d1ae3761766093d3cffe2c8547c743e5e7c202`，digest `sha256:89cae61f10446cc653f3bc8a54ddcad90eacde272affc25386147fe4dbe6efaf`；Admin revision `6342a3a06e2f17d0e4d2c05fa53fd8cb8a2184cd`，digest `sha256:38ab7555166ca371ac647573031a2c6fcc98f6f63235f2fc32b93f399d11f3fa`。

## 生产数据库：已完成

正式流程：[迁移 34042662686](https://github.com/LeeFo-china/goose/actions/runs/34042662686)。使用同一 Tag 的不可变 migration 归档，运行成功。

应用前通过 `supabase migration list` 确认 Local 581 / Remote 577，仅缺少以下 4 项；无额外 Remote 版本：

1. `20260906040943_tenant_customer_lead_permissions.sql`
2. `20260906043943_tenant_customer_lead_commands.sql`
3. `20260906101000_add_tenant_douyin_clue_component_config.sql`
4. `20260906121818_tenant_h5_customer_leads.sql`

应用后再次实际执行 `supabase migration list`：**Local 581 / Remote 581，差异 0**。工作流回执同样确认 4 项全部应用，最新版本 `20260906121818`；checked_at 为 `2026-09-06T15:35:09Z`。

工作流备份：`/opt/supabase/docker/backups/prod-migrate-34042662686-20260906233506.sql`，实际检查文件大小 14,454,296 bytes；范围 `public` 和 `supabase_migrations`。本轮未执行备份恢复演练，不称为全实例备份。

额外 SQL 均在只读事务和 10 秒超时内执行，仅输出汇总：

- 普通来源事实重复分组：0；抖音采集配置非法回填：0。
- 迁移前后抖音线索均为 7 条，H5 均为 19 条；数量一致不等于逐字段业务验收。
- 新统一线索有效权限：4 项。
- 在已有 H5 租户上只读调用列表 RPC：总数 17、首屏 17、来源全部为 H5。未输出线索 ID、手机号、客户对象或原始表单。
- 未执行分配、跟进、转客户、判无效等验收写操作。

### CLI 连接检查说明

初次 CLI 使用 Docker 内网数据库地址及 URL `sslmode=disable`，报服务端拒绝 TLS。核对 Supabase CLI 连接处理及[官方问题记录](https://github.com/supabase/cli/issues/4839)后，使用进程级 `PGSSLMODE=disable` 重试，迁移前后列表均通过。

该参数仅用于 SSH 登录生产主机后到同机 Docker 内网数据库的只读 CLI 检查；不改数据库、代理或公网 TLS 配置。凭证从现有容器环境在进程内读取，不输出或落盘。正式迁移仍由既有工作流执行，没有手工 SQL 修库。

## API/Admin 部署：已完成

[发布 34042844945](https://github.com/LeeFo-china/goose/actions/runs/34042844945) 状态 `completed / success`，固定使用构建 `34035422027`，不重新构建当前工作区。候选授权、容器切换、运行时版本和外网检查全部通过。

已下载核对 `production-deployment-receipt-34035422027`：Tag、完整 SHA、build/deploy run ID、`api,admin` 服务集合一致，完成时间 `2026-09-06T15:40:11Z`（北京时间 23:40:11）。

另行通过 SSH 只读核对两个实际容器，均为 `running / healthy`，revision 为 `18de9a170123a9f73edd1c61b060df359d27ee39`，build run 为 `34035422027`，配置镜像 digest 与上表逐项一致。

独立外网 HTTP 检查：

| 地址/请求 | 结果 | 边界 |
| --- | --- | --- |
| `https://api.goodcms.cn/` | 200 | API 入口可用 |
| `https://admin.goodcms.cn/login` | 200 | Admin 登录页可用 |
| 无 Bearer 请求 `/tenant/customer-leads?source=h5&page=1&pageSize=20` | 401 / `TOKEN_MISSING` | 鉴权拦截有效，不代表登录后的业务验收 |

本轮没有生产租户员工会话的完整业务 HTTP 验收，也没有真机写操作。生产部署完成与业务验收完成是不同结论。

## 恢复与验收边界

- 应用异常时先停止相关写入并评估已发生的业务变更；不得直接恢复旧数据库备份覆盖发布后的业务数据。
- 数据库恢复采用审查后的前向 migration，保留普通跟进、来源事实、客户关联和递增版本；已有普通跟进后不能恢复预约字段 NOT NULL。
- 不删除保留的抖音组件配置；该配置若需撤回，按原 migration 的说明先切换 SMS、停止配置流量并保留组件 ID。
- API/Admin 现有流程没有 Web 那样的自动回滚步骤；此前镜像在上文留档，不能把只回退 API 等同于完整恢复旧 H5 写入口。
- 完整业务与真机验收仍需指定账号、可变更测试线索及操作人，不以 401、容器健康或管理员数据库 RPC 检查替代。
