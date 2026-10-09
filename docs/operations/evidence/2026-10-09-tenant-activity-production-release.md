# 租户活跃概览生产发布

用户在首期实现交付后要求“继续推进”，继续执行已说明的 migration → API → Admin 发布步骤。orange 未修改，不发布小程序。

源码 `009ce69ed085190e98eb5f0a7ec12476210e8ec8`，Tag `v2026.10.09.3`，范围 `api,admin`。

## 数据库

- [迁移预检 37942176447](https://github.com/LeeFo-china/goose/actions/runs/37942176447)：仅待执行 `20261009190000`。
- [迁移应用 37942375545](https://github.com/LeeFo-china/goose/actions/runs/37942375545)：成功，658 → 659，仅应用上述 migration。
- 应用前真实 Supabase CLI migration list：658 条匹配、1 条待应用、无远端独有版本。应用后再次执行，`verify-migration-history.mjs` 确认全部659条 Local/Remote 对齐。
- 迁移备份 `/opt/supabase/docker/backups/prod-migrate-37942375545-20261009221328.sql`，18,559,929 bytes。
- 生产实际 PostgreSQL 15.8。四张统计表 RLS 开启；anon/authenticated/service_role 均不能直接写表；两个 SECURITY DEFINER RPC 仅 service_role 可执行，anon/authenticated 不可执行，owner=supabase_admin。
- 迁移后只读事务内以服务角色调用摘要RPC，返回9个租户。此时事件和每日汇总均0，采集起点null；未补造历史或制造员工活跃。
- 在生产现有扩展环境中，另以 `BEGIN` / service_role / `ROLLBACK` 验证RPC完整写入路径，statement_timeout=5s、lock_timeout=2s。首次登录true、同键重试false；同一员工后台和小程序各1人，总人数1、活跃1天、登录1次。事务全部回滚，测试凭据0条、全表事件0条、采集起点仍null。未更改真实业务数据，未提交合成活跃事件。这补充了此前PG17.6隔离环境验证的版本和扩展差异。

## 应用发布

- [候选构建 37942171133](https://github.com/LeeFo-china/goose/actions/runs/37942171133)：成功，生产机拉取镜像并校验不可变digest、源码revision和build run来源通过。
- [生产部署 37943543804](https://github.com/LeeFo-china/goose/actions/runs/37943543804)：成功；部署回执只含api/admin，完成于 `2026-10-09T14:28:18Z`（北京时间22:28:18）。
- API镜像：`useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:89611f0cb5289c0f80af7a89879df8e00d2bed05332354d957f6da480da1270e`。
- Admin镜像：`useccr.ccs.tencentyun.com/america_goose/goose-admin@sha256:5b3db058b4b44b2f91e4db99ecd96ff8461faabb5f91f80ca09b4563ae674293`。
- 实际两个容器均running/healthy，revision均为发布源码；公网API首页及Admin登录页均HTTP200。其他服务未切换。

## 线上验收

使用现有平台员工的实际权限，在API容器内存中签发5分钟凭证并执行验收，不输出或保存凭证、不提升角色。未调用成功员工登录或有效活跃上报来制造统计。

- GET `/platform/tenants?page=1&pageSize=20` HTTP200；total=9、totalPages=1，9条均有activity；与服务角色摘要RPC的状态一致。
- GET租户详情 HTTP200，并包含activity；超限pageSize=101返回400，无凭证列表请求401。
- 平台员工POST `/tenant-activity/view` 返回403；夹带tenant_id的body返回400。数据库记录RPC拒绝平台员工归入租户，返回false，无写入。
- 实际Admin租户列表与详情页面均HTTP200，服务端渲染包含“使用情况”“跨端去重员工”“成功业务操作”及小程序浏览待接入说明。窄屏交互与浏览去重在发布前Playwright覆盖；本次线上验证为真实后端和页面渲染，不冒称生产浏览器交互测试。
- 验收时所有租户collection_started_at=null、observed_days=0、计数null；对应UI“尚未采集”。只有后续真实有效事件才启动采集，不把历史缺失显示成0活跃。
- 切换后日志检查：`TENANT_ACTIVITY_COLLECTION_FAILED` 与 `tenant_activity_summary_unavailable` 均0条。
- 一次查询GitHub运行状态遇到EOF，随后正常重查成功；无因此重复部署或变更应用。

## 回退基线

- API：`a1f4f6f6c4cab63600bcfe5d0d51d67ad62fcce5`，镜像 `useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:4d3dd06594b7a4a213883f2071d4d88cdb4cce3b0aacb3028b5c82b3adf7186f`。
- Admin：`b02b259e9a76c264fa44687409c5fba9721fea5e`，镜像 `useccr.ccs.tencentyun.com/america_goose/goose-admin@sha256:b64fbf4c8f1243ed87fd32bd049a890e638bf0cce2c7abb008d435a129c553ae`。
- 如需回退应用，走现有候选构建/部署流程，不重放已消费回执。此次数据库为新增设施，停止采集/读取后保留统计历史，无需删除表或手动修库。

## 统计口径与边界

有效使用为受权页面的主动浏览或成功业务动作；登录单独计数。按北京时间近7日、租户内员工跨端去重。历史不回填，首次有效事件前显示尚未采集，采集不足完整窗口需明确提示。

后台主动浏览已接入；小程序当前覆盖主动登录和成功业务操作，纯浏览待客户端按 [接口交接](../../application_integration_documentation/2026-10-09-tenant-activity-collection.md) 配套。运营采集为尽力记录，不等同于审计账本。
