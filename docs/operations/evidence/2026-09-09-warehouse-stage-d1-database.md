# 阶段 D1 调拨数据库原子过账验证

日期：2026-09-09。分支：`feature/warehouse-project-material-stage-c`。

依据：[D1 设计](../../superpowers/specs/2026-09-09-warehouse-transfer-stage-d1-design.md)、[数据库实施计划](../../superpowers/plans/2026-09-09-warehouse-transfer-stage-d1-database.md)。

## 交付范围与发布边界

新增 migration `20260908185501_warehouse_transfer_atomic_commands.sql`，由 `supabase migration new` 生成文件后实施。包含同租户双仓调拨单、明细、不可变回执、独立默认关闭开关、两个未分配给现有角色的权限定义、原子命令和四个受控读取 RPC。

首次保存冻结租户及两仓；保存／提交／取消需 manage，确认需 approve，成本读取需 stock.view，不要求项目权限。提交不扣库存，确认一次性完成两个仓库的数量／金额移动、明细成本冻结、状态和成功回执。当前身份及权限验证先于历史回执重放；历史读取和获授权重放不受操作开关或仓库停用影响。

所有新表 FORCE RLS，无 anon／authenticated／service_role 直接写权限；内部 helper 仅 owner 执行，公开 RPC 仅 service_role 执行。流水两个方向复合外键绑定租户、仓库、SKU、明细；保留既有来源唯一键及采购、领退料约束。

**本批未对任何真实数据库 apply，未部署 API／Admin，未启用真实租户开关或授权员工，未操作 Chrome。** 现有 API 尚未识别 transfer_in/out 和新来源；必须完成下一 API 兼容批次后再安排远端 apply、`supabase migration list` 对齐检查及开发发布。不能将本报告当作固始晴天装饰工程有限公司的真实调拨验收，更不代表盘点、手工调整或整个阶段 D 完成。

## 测试先行与根因修复

1. 先写 `transfer-contract.sql`，新 migration 尚为空时执行，真实得到 `Stage D1 missing table: warehouse_transfer_orders`、退出 1；之前的 schema 恢复及相关迁移均成功。随后实现表与命令。
2. `transfer-workflow.sql` 在命令实现前编写，验证真实 RPC，不以静态 SQL 文本匹配替代行为证据。
3. 独立审查指出指纹编码边界。只读 SQL 复现含引号／换行原因经 `jsonb::text::bytea` 抛出 `invalid input syntax for type bytea`。修复为 `sha256(convert_to(jsonb_text,'UTF8'))`，特殊字符保存和精确重放回归通过。
4. 性能夹具从 `pg_get_functiondef` 抽取实际分页／聚合 SQL。初始源仓／目标仓无状态筛选各检查 9,020 张单据才返回 20 张；新增不含 status 前缀的两个分页索引后转为各 20 张。
5. 补测缓存参数化查询，允许的 generic plan 仍检查 9,020 张单据并顺序扫描 20,005 条明细。沿用既有库存查询模式，仅给调拨列表函数设置 `plan_cache_mode=force_custom_plan`；修复后该用例同样只检查 20 张单据／40 条明细。代价是每次调用增加少量规划 CPU，不改变调用者或全局设置。

测试准备过程也曾失败：PL/pgSQL 变量与列同名、克隆外租户商品未满足目录／代理操作者约束、员工状态误用不存在的 inactive。分别通过明确列限定、改用现有商品创建命令、按真实表约束使用 suspended 解决；没有删触发器、绕过校验或降低断言。这些准备失败不被计作业务验证通过。

## 实际验证命令

在当前 worktree 根目录：

```bash
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/material-contract.sql \
  scripts/fixtures/warehouse-stage-b/material-workflow.sql \
  scripts/fixtures/warehouse-stage-b/material-security.sql \
  scripts/fixtures/warehouse-stage-b/transfer-contract.sql \
  scripts/fixtures/warehouse-stage-b/transfer-workflow.sql \
  scripts/fixtures/warehouse-stage-b/transfer-security.sql \
  scripts/fixtures/warehouse-stage-b/transfer-concurrency.sql \
  scripts/fixtures/warehouse-stage-b/transfer-read-performance.sql

bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/receipt-accounting.sql \
  scripts/fixtures/warehouse-stage-b/material-workflow.sql \
  scripts/fixtures/warehouse-stage-b/material-concurrency.sql
```

以上两组均退出 0。runner 从本机 PostgreSQL 只读恢复 schema-only 基线（527 条迁移，最新 `20260828160000`）到随机命名、无网络的一次性 PostgreSQL 17 容器，应用采购／仓库相关后续 migrations，再运行合成数据夹具并清理容器。不是完整历史／真实数据迁移验收，也没有改写本机持久业务库或远端数据。

在 `apps/api` 执行：

```bash
bun test src/schema/warehouse-transfers.test.ts src/schema/warehouse-materials.test.ts
bun run typecheck
```

结果：5 pass、0 fail、134 断言；类型检查退出 0。暂存改动 `git diff --cached --check` 通过。本批没有修改 TS／JS 运行时代码。

## 业务与安全结果

- 原库存 0.3／0.02，调出 0.1 和 0.2 的金额分别 0.01／0.01；清空源仓后数量、金额、均价均为 0。
- 目标仓首次入库正确建立余额；不同均价场景源仓 2／30、目标仓 3／90，调拨 1／15 后目标 4／105、均价 26.2500。
- 双 SKU 反向调拨合计 26.27；每条已完成明细恰好两条流水，方向数量／金额合计均为 0。各仓库／SKU 余额与流水重算一致。
- 注入第二条 transfer_in 流水失败，第一条 transfer_out、目标余额创建、明细成本、单据状态／版本及成功回执全部回滚。
- 保存／确认和旧版本保存精确重放不重复过账。错用户、停用员工、外租户仓库／商品／单据、manage／approve／stock 越权、无效精度、数字 JSON、重复 SKU、客户端会计字段、过期版本、非法分页全部被拒绝。
- 关闭开关或停用仓库后历史读取及当前获授权的回执重放继续可用；撤销权限后不能重放。完成只需 approve，项目权限不参与调拨。
- 终态单据及明细的更新／删除、向终态单据插入明细受保护；直接伪造方向仓库或 SKU 的流水被复合外键拒绝。最大 18 位数量通过字符串读取保留精度；版本耗尽拒绝推进但允许历史回执重放。
- 单纯调拨前后项目成本、供应商应付、付款、现金账本的完整事实快照不变，不只比较净金额。

## 并发证据与限制

五组测试均使用独立 dblink 连接：A 执行确认并持有未提交事务，B 异步确认；从 `pg_stat_activity` 实际观察 B 的 `Lock` 等待后才提交 A。

覆盖超库存两个调拨只成功一个、反向调拨在该等待顺序下均成功、同 key 并发返回完全相同回执且只生成一对流水、调拨与项目领料竞争同一余额（分别让两种命令先取得锁）。失败方不残留事实／完成回执。

最后经真实反向调拨与退料命令恢复原 SKU 0.3／0.02。仅“项目领料先成功”的场景合法新增两条领／退项目成本事实，净额为 0；这些不能误算作调拨产生的成本。

这证明指定的持锁等待调度及财务不变量，不声称穷举所有锁交错。防反向死锁还依赖独立审查确认的结构约束：settings → 按 UUID 排序的两仓 → 单据 → 按仓库／SKU 排序的余额，与既有采购收货和领退料锁序兼容。

## 查询计划与审查

1 万张新增合成单据／2 万条明细下，租户分页、源仓无状态、目标仓无状态、源仓＋状态，以及参数化缓存计划五种检查均读取 20 张单据。明细索引扫描 20 次、每次 2 行，共 40 行，未扫描其他单据明细。访问断言同时计入 filter／index recheck 丢弃的行，避免只统计输出行形成假阳性。此证据针对分页及明细聚合；精确 total 仍需统计匹配单据，深 offset 仍有相应成本。

独立审查代理检查 migration、ACL、锁序、计价、夹具和最终索引／计划修复，最终无 Critical／Important 阻塞项。审查未自行执行数据库套件；以上运行结果均由主代理独立取得。

## 下一批与回退

下一批接入 repository/service/controller 和错误映射，补共享库存类型与来源读取兼容、配置开关命令及 API smoke，再接管理端调拨流程。完成这些发布前置后才对开发环境 apply 并核对 Local／Remote migration 状态，随后使用指定测试租户验收。盘点和手工调整仍是之后的 D2／D3。

migration 在事务中执行；未来若需回退，关闭独立开关并保留所有事实／回执，使用正常反向调拨或新的前向修复 migration。禁止删除／覆盖已确认库存事实。本批保留 feature 分支和隔离 worktree，不合并 main，不移动阶段 C 冻结发布分支。
