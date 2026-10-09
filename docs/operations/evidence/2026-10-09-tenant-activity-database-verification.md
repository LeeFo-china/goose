# 租户活跃数据库隔离验证

未连接或写入生产数据库。验证目标为自建容器 `gooes-tenant-activity-verify` 中的 `tenant_activity_full` 数据库，PostgreSQL 17.6，复制现有完整结构并应用本次 migration，关闭预加载扩展。该隔离环境已由执行代理创建；下列命令要求其存在，不会创建数据库或自动加载任何环境凭证。

```bash
# 仓库根目录：SQL中的测试数据及变更最终ROLLBACK
docker exec -i gooes-tenant-activity-verify \
  psql -X -q -U supabase_admin -d tenant_activity_full \
  < supabase/tests/tenant_activity_metrics.sql

# apps/api目录：显式开启，固定容器名和数据库名
TENANT_ACTIVITY_POSTGRES_TEST=1 bun test src/repositories/tenant-activity-postgres.test.ts
```

实际结果：两项集成测试通过；主代理独立复跑同样通过。测试不使用仓库远端DB环境变量。并发测试需跨连接提交合成数据，finally仅清理自己生成的UUID，并重置专用空库采集标记；不能指向业务数据库。

覆盖首次采集前null值、原子写入失败回滚、登录不等于活跃、同租户员工校验、平台/停用员工排除、跨端员工去重、五类业务计数、北京时间日界、近7日范围、新租户创建时间、全期last_active、最多100租户、RLS/函数执行权限。

24个同键并发调用：1个true、23个false；另24个不同键均成功，汇总25次，未丢增量。10,000条历史汇总数据的窗口扫描使用 `tenant_activity_daily_pkey`，命中2条窗口记录；该次执行约0.062ms，摘要RPC约0.813ms。此为合成规模的索引验证，不是生产容量承诺。

## 环境限制

初始共享容器 `gooes-manual-trial-db` 在权限验证DO块发生PostgreSQL进程段错误。具体预加载扩展/运行环境原因未定位；不能据此断言是本次SQL缺陷或某一扩展的已知缺陷。最终采用同版本、完整结构、无预加载扩展的独立容器验证通过。共享实例临时验证库已由执行代理清理。

这证明隔离PostgreSQL上的SQL语义和并发结果，不替代目标环境扩展兼容性验证。生产发布前仍需核对migration清单，发布后验证服务角色RPC、租户隔离、日志及Local/Remote migration对齐。未以手工生产DML补造统计历史。
