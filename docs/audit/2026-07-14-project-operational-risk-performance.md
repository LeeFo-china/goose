# 项目运营风险中心性能验证记录

日期：2026-07-14

## 当前状态

已补充只读性能验证工具和 EXPLAIN SQL：

- `apps/api/src/scripts/project-operational-risk-performance-smoke.ts`
- `supabase/tests/project_operational_risk_explain.sql`

本地已验证的内容：

- P50/P95 计算使用排序后的向上取整索引；
- smoke 配置只读取 `PROJECT_HEALTH_TENANT_ID`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`；
- API 阶段仅在同时提供 `PROJECT_HEALTH_API_URL` 和 `PROJECT_HEALTH_ADMIN_TOKEN` 时运行；
- 脚本只读调用 `get_project_operational_risk_page` 和 GET `/project-health/risks`，不执行 DDL/DML；
- RPC 阶段校验原始 `ProjectOperationalRiskRpcPageSchema`，API 阶段校验带 `title/description/action` 的 Admin display payload，避免把正常 API 响应误判为格式异常。

## 待 dev 数据库执行

当前未记录 EXPLAIN 和 P95 数值。原因：本地 Supabase/Docker 运行态不可用，且尚未在本轮拿到可验证的 dev 数据库连接执行结果。禁止手工在远端数据库执行 DDL/DML 或伪造性能数据。

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

执行 20 次 RPC smoke：

```bash
cd apps/api
PROJECT_HEALTH_TENANT_ID="$PROJECT_HEALTH_TENANT_ID" \
  bun --env-file=.env src/scripts/project-operational-risk-performance-smoke.ts
```

如 API 已启动且有合法管理员 token，再执行完整 API smoke：

```bash
cd apps/api
PROJECT_HEALTH_TENANT_ID="$PROJECT_HEALTH_TENANT_ID" \
PROJECT_HEALTH_API_URL="https://api-dev.goodcms.cn" \
PROJECT_HEALTH_ADMIN_TOKEN="$ADMIN_TOKEN" \
  bun --env-file=.env src/scripts/project-operational-risk-performance-smoke.ts
```

目标：

- RPC P95 < 500ms；
- API P95 < 1000ms；
- API 日志不包含客户电话、地址、工单内容或 keyword 原文。

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
