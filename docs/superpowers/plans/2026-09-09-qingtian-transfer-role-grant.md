# 晴天测试租户调拨角色授权 Implementation Plan

> **For agentic workers:** Use subagent-driven-development with SPEC then quality review. User explicitly confirmed this scoped authorization change on 2026-09-09; proceed through existing DEV migration workflow and genuine UI acceptance without routine re-approval.

**Goal:** 仅使固始晴天装饰工程有限公司既有 system_admin 角色获得管理／确认调拨权限，保持其他角色、租户和数据库鉴权不变。

**Architecture:** 新增受控、幂等、事务化数据 migration，不改既有 migration 或通用权限 helper。精确限定 tenant `3eebca47-961f-4899-b976-a3d3208d326b`、role `e72850fe-dbba-427f-9109-f1779080a239`、code `system_admin`、active 状态以及两项 active 权限，access_scope=`all`。目标租户不存在的其他环境无操作；目标存在但身份／角色／权限不匹配则事务失败，不创建角色、不授予员工覆盖、不删除 deny、不打开开关。

**Tech Stack:** PostgreSQL 17、Supabase migration、既有 Bun 隔离数据库 runner、GitHub DEV migration workflow、Chrome。

## Task 1：真实 SQL 回归与最小 migration

文件：

- `supabase/migrations/20260909045512_grant_qingtian_warehouse_transfer_permissions.sql`（由 CLI 创建，已实现并验证）
- `scripts/fixtures/warehouse-stage-b/transfer-tenant-grant-before.sql`（合成目标租户／角色／员工、非目标对照与拒绝基线）
- `scripts/fixtures/warehouse-stage-b/transfer-tenant-grant.sql`（迁移后授权与拒绝边界断言）
- `scripts/verify-warehouse-stage-b-database.ts`（仅新增本 migration 的可选 before/after 检查钩子，沿用既有 rollout hook；禁止新依赖或改持久库）

- [x] 先在真实一次性离线数据库准备目标及非目标合成身份。目标身份使用获准 UUID，但不拷贝真实业务行；同租户非管理员及外租户 system_admin 均为对照。
- [x] 在空 migration 下运行以下命令，观察 `target transfer permission missing after migration` 的 RED；迁移前明确断言两项 `__gooes_has_tenant_procurement_permission(...)` 均为 false。

```sh
bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/transfer-tenant-grant.sql
```

- [x] 实现事务 migration：锁定／校验精确目标与 active 身份，校验两项权限存在且 active，插入下列限定集合；重复执行不重复或扩大既有授权。目标存在但 expected role 不匹配须 fail closed。不存在目标时无数据变更。

```sql
INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'all'
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.id = 'e72850fe-dbba-427f-9109-f1779080a239'
  AND r.tenant_id = '3eebca47-961f-4899-b976-a3d3208d326b'
  AND r.code = 'system_admin' AND r.status = 'active'
  AND p.code IN ('inventory.transfer.manage', 'inventory.transfer.approve')
  AND p.status = 'active'
ON CONFLICT (role_id, permission_id) DO NOTHING;
```

- [x] GREEN 验证 migration 恰好添加两条、其他角色权限／员工 overrides／开关不变、重复运行不变、无目标租户无操作、异常角色身份不放宽；通过实际 helper 和调拨权限断言验证角色继承生效，显式 deny、停用员工／角色／权限、错误租户仍拒绝。测试仅写一次性容器。
- [x] 静态检查 runner 真实依赖与 TS 类型后运行受影响数据库套件；已有 API 系统管理员 9 个测试作为辅助而非数据库替代。
- [x] 独立 SPEC 后 quality 审查；主代理运行验证并核对 diff，提交最小改动。

## Task 2：DEV apply

- [x] 发布前只读复核目标角色、两项现有授权、关闭开关、单据／库存／财务基线、DEV 实际 SHA、活动 workflow、磁盘及完整 migration 差集。
- [x] 推送当前功能分支和唯一固定候选分支；在该固定 ref 上运行 `migrate-dev-database.yml` mode=plan，确认唯一 pending 为 `20260909045512`，再以相同 ref mode=apply，confirm_dev_project_ref=`fclnkyatvfvmzgzdqlba`。不合并 main、不触发生产。
- [x] 通过 `supabase migration list` 与仓库 strict verifier 验证 Local/Remote 对齐，确认实际授权仅增加目标角色两条、员工 overrides 不变、开关 false、全部业务摘要未动。纯授权 migration 不需要重发无变化的应用镜像；若当前镜像被覆盖，先核对集成差异再走已授权 DEV 发布流程。
- [x] 回退为先关闭开关、保留业务事实，必要时新建前向 migration，仅撤销本次新增精确两条角色权限；禁止改旧 migration 或直接 SQL 删除。apply 前记录原始两条均不存在，作为可逆依据。

## Task 3：继续真实验收

- [ ] 正常 Chrome 空验证码登录；复用已有 DEV 测试分仓、风清扬和 SKU `732e2b3b-cb7e-4e40-a4e2-228c22bf985c`，临时开关仅作用目标租户。
- [ ] 正向及反向各 1 箱，验证草稿／提交无流水、确认成对过账、数量价值守恒、公司仓恢复 1／88、测试仓 0／0，财务及领退料事实不变；结束关闭开关。
- [ ] 补齐调拨与退料／收货并发的独立行为证据后，才可标记 D1 完成、进入 D2。任何未知写入结果先只读核查，不更换幂等键盲重试。

自检：该授权是用户对上一轮“不自动授权”约束的明确、仅目标租户例外；没有扩大到全租户管理员默认权限、员工绑定、API 自动放行或其他功能。已有工作区隔离且干净；API 9 个基线测试在 apps/api 目录运行通过（从根目录运行无法解析 @ 别名，不是业务失败）。

## Task 4：补齐原 D1 退料／收货交叉并发验收

此任务只新增离线测试，不新增产品功能、migration 或真实业务操作。授权修复已经独立 SPEC/quality 通过后，可在主代理执行 DEV apply／Chrome 验收期间由独立实现者处理，禁止与主代理共用 Chrome。

文件：`scripts/fixtures/warehouse-stage-b/transfer-cross-command-concurrency.sql`；若准备代码过长，拆出 `transfer-cross-command-before.sql`，通过 runner 原有 fixture 参数顺序传入，不修改 runner 或旧 fixture。

- [ ] 先验证既有 `material-workflow → transfer-contract → transfer-workflow → transfer-concurrency` 基线，读取 `receipt-accounting.sql` 的真实采购生成及收货命令；只调用已存在、已检查的真实 SQL API。
- [ ] 新增四组独立连接持锁调度：退料先／调拨先、采购收货先／调拨先。准备完成后连接 A 执行业务命令持有未提交事务，连接 B 异步执行另一命令，必须观察 `pg_stat_activity.wait_event_type='Lock'` 后才提交 A；有超时与连接清理，不用串行命令或固定 sleep 冒充并发。
- [ ] 退料通过真实领料完成再建立草稿；收货通过真实采购生成、确认履约再调用 `create_supplier_purchase_order_receipt`。两种调拨都通过真实保存／提交／完成命令。不得禁用触发器、修改 RLS 或伪造已完成业务状态来通过测试。
- [ ] 每轮断言两命令预期结果、单据／版本／回执与流水条数、调拨成对数量价值净0、余额与全部流水重算一致、每个来源唯一。合法退料对应的成本冲回、收货对应的应付必须单独精确归因；调拨不得产生项目成本／应付／付款／现金事实。不声称采购收货后总库存与测试前相同。
- [ ] 在一次性无网络容器运行上述新 fixture；必须含负控制证明无真实锁等待会失败，且每组都输出可核验 evidence。独立 SPEC 后 quality 审查、主代理复跑并记录，不以合成测试替代真实 UI 验收。
