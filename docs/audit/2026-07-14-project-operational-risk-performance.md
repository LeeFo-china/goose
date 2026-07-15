# 项目运营风险中心性能验证记录

日期：2026-07-14
最近复核：2026-07-15

## 当前状态

已补充只读性能验证工具和 EXPLAIN SQL：

- `apps/api/src/scripts/project-operational-risk-performance-smoke.ts`
- `apps/api/src/scripts/project-operational-risk-release-readiness.ts`
- `supabase/tests/project_operational_risk_explain.sql`

本地已验证的内容：

- release readiness gate 检查本地 RPC migration、SQL fixture、EXPLAIN SQL、dev DB/API 性能 smoke 配置和 dev Admin 浏览器 smoke 配置并输出 JSON，不执行 DDL/DML，不输出密钥值；
- P50/P95 计算使用排序后的向上取整索引；
- RPC smoke 必需配置为 `PROJECT_HEALTH_TENANT_ID`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`；
- API 阶段仅在同时提供 `PROJECT_HEALTH_API_URL` 或兼容既有开发约定的 `GOOES_API_BASE_URL`，
  以及 `PROJECT_HEALTH_ADMIN_TOKEN` 或兼容别名 `ADMIN_TOKEN` 时运行；
- Admin 浏览器 smoke 阶段要求显式提供 `PLAYWRIGHT_BASE_URL` 和 `GOOES_E2E_TENANT_ADMIN_PHONE`，
  避免发布验收误打本机默认地址或默认测试手机号；
- UI 审核阶段要求 `docs/audit/2026-07-14-project-operational-risk-ui-audit.md` 中的
  `project-health-ui-release-evidence` JSON 块达到 `status=ready`、`impeccable_score>=16`、
  `p0_count=0`、`p1_count=0`、真实 dev 截图和 WCAG AA smoke 均已完成；
- 脚本只读调用 `get_project_operational_risk_page` 和 GET `/project-health/risks`，不执行 DDL/DML；
- RPC 阶段校验原始 `ProjectOperationalRiskRpcPageSchema`，API 阶段校验带 `title/description/action` 的 Admin display payload，避免把正常 API 响应误判为格式异常。
- Controller 日志只记录 `hasKeyword`，不记录 keyword 原文、手机号或其他客户输入文本。

## 待 dev 数据库执行

当前未记录 EXPLAIN 和 P95 数值。原因：本地 Supabase/Docker 运行态不可用，2026-07-15 复跑 `supabase status` 仍因 Docker daemon 不可用失败；当前 shell 也未设置 `SUPABASE_DB_DIRECT_URL`、`PROJECT_HEALTH_TENANT_ID`、`PROJECT_HEALTH_ADMIN_TOKEN`、`ADMIN_TOKEN`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`PROJECT_HEALTH_API_URL`、`GOOES_API_BASE_URL`。尚未在本轮拿到可验证的 dev 数据库连接执行结果。禁止手工在远端数据库执行 DDL/DML 或伪造性能数据。

2026-07-15 复跑 `pnpm --dir apps/api run project-health:release-readiness`：

- `status`: `missing_env`；
- `completed_checks`: `local_artifacts_present`；
- 缺失项：`SUPABASE_DB_DIRECT_URL`、`PROJECT_HEALTH_TENANT_ID`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`PROJECT_HEALTH_API_URL or GOOES_API_BASE_URL`、`PROJECT_HEALTH_ADMIN_TOKEN or ADMIN_TOKEN`、`PLAYWRIGHT_BASE_URL`、`GOOES_E2E_TENANT_ADMIN_PHONE`；UI audit evidence 当前仍为 `pending`。

先执行只读 release readiness gate：

```bash
pnpm --dir apps/api run project-health:release-readiness
```

Expected:

- 命令会按 `apps/api` 工作目录尝试加载 `.env` 和 `.env.local`，文件不存在时仍可运行并报告缺失变量；
- 缺少本地 artifact 时退出 1，`status` 为 `missing_artifact`；
- 缺少配置时退出 1，`status` 为 `missing_env` 或 `api_smoke_skipped`；
- 所有发布验证前置条件齐全时退出 0，`status` 为 `ready`；
- 输出只包含变量名和只读命令模板，不包含数据库密码、service role key 或管理员 token 原文。

获取代表 tenant：

```bash
export PROJECT_HEALTH_TENANT_ID="$(
  psql "$SUPABASE_DB_DIRECT_URL" -Atc \
    "select tenant_id from public.projects where tenant_id is not null and coalesce(status, '') <> 'invalid' group by tenant_id order by count(*) desc, tenant_id limit 1"
)"
test -n "$PROJECT_HEALTH_TENANT_ID"
```

执行 EXPLAIN：

```bash
psql "$SUPABASE_DB_DIRECT_URL" \
  --set=project_health_tenant_id="$PROJECT_HEALTH_TENANT_ID" \
  -f supabase/tests/project_operational_risk_explain.sql
```

执行 20 次 RPC smoke；如同时配置 `PROJECT_HEALTH_API_URL` 或 `GOOES_API_BASE_URL`，
以及 `PROJECT_HEALTH_ADMIN_TOKEN` 或 `ADMIN_TOKEN`，同一命令会额外执行 API smoke：

```bash
cd apps/api
bun --env-file=.env --env-file=.env.local \
  src/scripts/project-operational-risk-performance-smoke.ts
```

目标：

- RPC P95 < 500ms；
- API P95 < 1000ms；
- dev API 日志需复验不包含客户电话、地址、工单内容或 keyword 原文。

## EXPLAIN 记录模板

待补充：

- 目标环境：
- tenant_id：
- 该 tenant 项目数：
- 总耗时：
- 主要扫描节点：
- 主要排序节点：
- actual rows / loops：
- shared hit/read blocks：
- 结论：现有索引足够 / 需要新增索引

## 索引决策

当前没有创建 `20260714183000_project_operational_risk_indexes.sql`。

只有当 EXPLAIN 证明主要耗时来自大量无关行扫描、状态/时间筛选或排序，且 20 次 P95 可复现瓶颈时，才允许新增针对性索引 migration。不得无条件创建计划中的三个索引。

## 回滚说明

基础 RPC migration 回滚应使用准确函数签名 `drop function`。如果后续基于证据新增条件索引，回滚仅 drop 本功能新增且无其他消费者依赖的索引。本版本没有风险状态表，不涉及业务数据回写。
