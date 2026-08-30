# 抖音量房命令所有者对齐设计

## 背景

生产环境的 `marketing_leads` 表属于 `postgres`，而后续 migration 创建的
抖音量房命令函数属于 `supabase_admin`。量房线索守卫使用
`current_user = table owner` 区分受信命令和直接写入，因此合法的
`SECURITY DEFINER` 命令在生产环境被误拦截。

## 方案

新增 forward-only migration，动态读取 `public.marketing_leads` 的 owner，
并将所有会写入抖音线索的已审查 `SECURITY DEFINER` 命令函数 owner 对齐到
该角色。migration 在改 owner 前逐个确认函数存在且启用了
`SECURITY DEFINER`，任一前置条件不满足即失败关闭。

不修改历史 migration，不改变表 owner，不放宽触发器，不新增
`service_role` 表写权限，也不修改业务数据。函数 owner 对齐后，守卫仍会
拒绝 `service_role` 直接写入，但命令函数执行时的 `current_user` 与表 owner
一致。

表 owner 是该守卫已有的信任锚：它已经拥有表和触发器的管理能力，因此不按
部署环境硬编码为某个角色名。migration 仍显式拒绝 `anon`、`authenticated`
和 `service_role` 这些外部请求角色，避免将 `SECURITY DEFINER` 所有权交给
应用身份。

## 验证

1. migration contract 固定函数清单、动态 owner、失败关闭和无业务 DML。
2. 开发库应用 migration 后验证 migration history、函数 owner 和 ACL。
3. 使用事务回滚 smoke 调用量房 RPC，证明可以创建线索与预约且无残留。
4. 生产应用前备份，应用后重复 catalog 与事务回滚 smoke。

## 回滚

若必须回滚，先停止量房提交，再根据迁移前 catalog 证据恢复各函数 owner。
函数 owner 调整不改变表数据；恢复后生产环境会重新出现本次拦截，因此只能
用于紧急撤回，并应同步回滚调用流量。

生产应用前必须保存以下查询的完整输出；其中 `rollback_sql` 是逐函数反向
操作清单，`proacl` 用于确认 owner 调整没有改变显式授权：

```sql
SELECT
  procedure.oid::regprocedure AS signature,
  pg_get_userbyid(procedure.proowner) AS owner,
  procedure.proacl,
  format(
    'ALTER FUNCTION %s OWNER TO %I;',
    procedure.oid::regprocedure,
    pg_get_userbyid(procedure.proowner)
  ) AS rollback_sql
FROM pg_proc AS procedure
JOIN pg_namespace AS namespace
  ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname = 'public'
  AND procedure.proname IN (
    'submit_douyin_miniapp_lead',
    'submit_douyin_measurement_appointment',
    'assign_douyin_lead',
    'append_douyin_lead_follow_up',
    'convert_douyin_lead_to_customer',
    'mark_douyin_lead_invalid'
  )
ORDER BY signature;
```
