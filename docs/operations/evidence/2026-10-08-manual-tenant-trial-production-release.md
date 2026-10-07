# 超管手动建户试用生产发布

日期：2026-10-08（Asia/Shanghai）。范围：超管建户配置试用天数、未核验企业试用、7 天只读宽限、租户列表显示与延长试用；不提供缩短操作。

## 应用与功能迁移

- 应用提交 `e8691d469b8883b5e88c203527a2e553925a0146`，Tag `v2026.10.08.1`。
- [构建](https://github.com/LeeFo-china/goose/actions/runs/37701389166)和[部署](https://github.com/LeeFo-china/goose/actions/runs/37702549444)成功，候选和部署回执仅包含 `api,admin`。生产机已验证镜像拉取；最终两个容器 revision 均与应用提交一致，且为 running/healthy，公网 API 首页和 Admin 登录页均 HTTP 200。
- [功能迁移 apply](https://github.com/LeeFo-china/goose/actions/runs/37702443974)只应用 `20261007100000`、`20261007101000`、`20261007102000`、`20261007103000`、`20261007151339`、`20261007152046`，历史从 643 条变为 649 条。
- 应用前独立 CLI 核对 643 条匹配、待应用 6 条、无生产独有版本；应用后 `supabase migration list` 与固定应用提交的全部 649 条版本完全对齐，`verify-migration-history.mjs` 通过。CLI 经 SSH 隧道连接，只对该命令设置 `PGSSLMODE=disable`，凭据未输出。
- 迁移前备份：`/opt/supabase/docker/backups/prod-migrate-37702443974-20261008072840.sql`，17,712,336 bytes；工作流备份范围是 `public` 与 `supabase_migrations`。迁移与 API/Admin 切换在同一维护窗口完成。

## 生产 ACL 差异与修正

生产只读核验发现 `create_platform_tenant_with_trial` 对 anon/authenticated 的 EXECUTE 为 true。根因是生产迁移角色 `supabase_admin` 的默认函数 ACL 直接向这两个角色授权；原功能 migration 只撤销 PUBLIC，未移除直接授权。本地隔离库使用 postgres 创建函数，其默认 ACL 不包含这两项授权，因此此前本地检查未覆盖该环境差异。

未开启新试用入口前，在尚未应用的 `20261007232025_enable_manual_tenant_trial_access.sql` 中加入显式撤销 PUBLIC/anon/authenticated，并断言 service_role 可执行、其余两者不可执行，再开启访问开关。已应用的六个功能 migration 未改写。生产其余相关发放、申请、延长、单个/批量事实函数均已核对为仅 service_role 可执行。

隔离数据库先赋予同样的直接授权，SQL smoke 按预期报错；应用修正后完整 `supabase/tests/manual_tenant_trial.sql` 通过，夹具全部回滚。新回归覆盖实际有效权限，而非只检查 SQL 文本。

## 访问开关与验收

- 开关及 ACL 迁移源码提交 `b314f122f6c7fbec06ca9c19f83570ba2be8a020`；[预检](https://github.com/LeeFo-china/goose/actions/runs/37702863560)仅待 `20261007232025`，[apply](https://github.com/LeeFo-china/goose/actions/runs/37703103069)成功，历史从 649 条变为 650 条。此前 `dea179271` 的开关预检未用于 apply。
- 该次备份为 `/opt/supabase/docker/backups/prod-migrate-37703103069-20261008073536.sql`，17,728,035 bytes。
- 最终独立 CLI `migration list` 与全部 650 条本地版本完全一致，验证脚本通过。隧道复查曾遇到连接超时，改在生产机内通过 Docker 内网只读执行相同 CLI，并再次用本地版本集合核对；无手工数据库修复。
- 实际运行时代码确认 `PLATFORM_SERVICE_TRIAL_ACCESS_ENABLED=true`、`PLATFORM_SERVICE_TRIAL_APPLICATION_ENABLED=false`，对应开启审计记录 1 条。新建租户函数与批量事实函数的实际权限均为 anon=false、authenticated=false、service_role=true。
- 最终 API/Admin 容器均 healthy，revision 仍为 `e8691d469`；公网 API 首页和 Admin 登录页均 HTTP 200。本次验证没有使用生产用户凭据，也没有执行生产建户/延期写入；写入行为与时间边界通过隔离数据库完整 SQL smoke 和此前的浏览器模拟 API 验证。

应用发布后的只读运行态 smoke 通过：7 个现有租户均保持 `legacy_compatible`，访问模式为 1 个 legacy、6 个 hard_blocked；批量与单个事实解析一致，切换试用开关的预计算结果不改变这些租户的模式。发布前生产无试用记录；本次不创建生产测试租户或修改真实试用期限。

回滚使用前向修正 migration，保留试用和审计数据；不得恢复 anon/authenticated 的函数权限。关闭试用访问开关会阻断已有纯试用租户，故应用故障优先前向修复。旧 API 的严格解析与新增数据库字段不兼容，不可单独回退旧镜像。
