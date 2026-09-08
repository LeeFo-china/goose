# 仓库孤儿记录修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复可复现的 smoke 清理遗漏，并以审计留痕、精确白名单 migration 移除开发库 4 条无父租户、无业务引用的孤儿仓库，恢复备份验证能力。

**Architecture:** 两个有顺序的部分：先防止 smoke 再制造孤儿，再做一次性定向数据纠正。不重建未知租户／员工，不把审计引用改成别人的 ID，不关闭真实库约束；复用现有 platform_audit_logs 留存删除前完整记录，不新增隔离／缓存架构。最终清单与执行授权需用户确认。

**Tech Stack:** Bun、TypeScript、PostgreSQL 17.6、Supabase migrations、现有 development 目标守卫及本机隔离容器。

---

## 当前状态与边界

**最终实施状态（2026-09-08 15:02 后）：本计划 Task 1–3 已执行。** 用户确认精确清单后，专用修复候选 `af3c37f3` 已通过 CLI 应用开发库；Local／Remote 595 条对齐，4 条审计归档删除，正常仓库与九表事实不变。新备份完整恢复及 325 表逐表计数对账通过。见 [实际应用／恢复证据](../../operations/evidence/2026-09-08-warehouse-orphan-dev-apply.md)。清理代码尚未推送／部署，C 未应用；以下检查点保留为历史，不再代表等待 apply。

**实施检查点（2026-09-08 14:41 Asia/Shanghai）：Task 1、Task 2 本地实施与评审完成，提交 `80bb606b04d9de9a2f68943a2250e6aaf333adb9`。真实 apply、修复后新备份／完整恢复仍未执行。** 用户本轮“执行”已启动实施；依本计划，现停在固定文件、hash 和单独清单后的真实 apply 确认点。详见 [实施证据](../../operations/evidence/2026-09-08-warehouse-orphan-remediation.md)。下方原诊断状态和 SQL 草案保留为历史设计，不代替已测试的实际文件。

2026-09-08 本轮只完成诊断、最小本地复现及本计划；**没有修改代码、生成活动 migration、删除远端数据或应用 C**。用户下一步选择实施只授权本计划约定动作；真实数据删除／migration apply 仍需明确确认目标和清单。

已确认代码缺陷：`supplier-purchasable-sku-smoke-fixture.ts:165` 启用模块触发默认仓库；226 行起清理在 replica 下删除父数据而遗漏仓库；275 行起残留计数也遗漏。完整 gateway 先提交 seed／场景，再独立 cleanup，故不像 EXPLAIN 的整个事务 rollback 能自动撤销默认仓库。

实际四条的历史执行者尚未确证：UUID 未在仓库／现存相关文件中命中，指定时窗数据库容器日志匹配 0。不能把可复现机制当成四次调用的逐笔审计证据。详见 [诊断记录](../../operations/evidence/2026-09-08-warehouse-orphan-root-cause.md)。

### 精确修复目标

| 仓库码 | 仓库 ID | 整行 MD5（变更检测，不作密码用途） |
| --- | --- | --- |
| WH-000004 | `c040be4b-61a8-4966-9d7e-27e42fa942aa` | `4103ef24183be8d47d90e7561ce9db22` |
| WH-000024 | `1ae564fe-915a-40b7-9245-133d80c60961` | `ff2066f5bf7a0e7e76e44876c8715e46` |
| WH-000026 | `402b619f-d22f-4fbc-ae18-6bd84a54333d` | `64118381064d0691523e6f42b03cec60` |
| WH-000032 | `f1ba1d8a-b0db-42f2-a87e-8bcbd9e2601a` | `baecc026272ffb676fa0e9c9e59f1d81` |

四个原租户、四个审计员工均不存在；9 张直接外键引用表对应记录全部为 0，没有发现无外键的 public.warehouse_id 列。保留正常仓库 `WH-000001`，不扫删其他孤儿。身份、版本或行快照变化时必须停止重审。

## Task 1：防止 smoke 再制造孤儿

**Files:**

- Modify: `apps/api/src/scripts/supplier-purchasable-sku-smoke-fixture.ts`
- Create: `apps/api/src/scripts/supplier-purchasable-sku-smoke-cleanup.test.ts`
- Reference: `apps/api/src/scripts/supplier-purchasable-sku-smoke-database.ts`
- Reference: `supabase/migrations/20260905210000_create_warehouse_foundation.sql`

- [x] 在新增 test 文件先添加源码结构回归，确认旧实现失败；它不替代下一步真实 SQL 回归。

```ts
import { describe, expect, test } from "bun:test";

const source = await Bun.file(
  new URL("./supplier-purchasable-sku-smoke-fixture.ts", import.meta.url),
).text();
const cleanup = source.split(
  "export async function cleanupSupplierPurchasableSkuSmokeFixture",
)[1]!.split(
  "export async function countSupplierPurchasableSkuSmokeResiduals",
)[0]!;
const residuals = source.split(
  "export async function countSupplierPurchasableSkuSmokeResiduals",
)[1]!;

describe("warehouse-aware SKU smoke cleanup", () => {
  test("deletes fixture warehouses with FK checks before parent employees", () => {
    const origin = cleanup.indexOf("session_replication_role = origin");
    const warehouses = cleanup.indexOf("delete from public.warehouses");
    const employees = cleanup.indexOf("delete from public.employees");
    expect(origin).toBeGreaterThanOrEqual(0);
    expect(warehouses).toBeGreaterThan(origin);
    expect(employees).toBeGreaterThan(warehouses);
    expect(cleanup).toContain("created_by_employee_id");
    expect(cleanup).toContain("updated_by_employee_id");
  });
  test("residual verification includes warehouse and command records", () => {
    expect(residuals).toContain("public.warehouses");
    expect(residuals).toContain("public.warehouse_command_events");
  });
});
```

Run: `cd apps/api && bun test src/scripts/supplier-purchasable-sku-smoke-cleanup.test.ts`。旧代码预期失败；不得把旧残留计数返回 0 当清理成功。

- [x] 在清理 catalog_units 后、employees 前插入以下片段；后续员工／用户／租户删除保持 origin，不再切回 replica。已有库存／采购／命令引用时，由真实 FK 拒绝整个 cleanup 事务；不删事实来完成清理。

```ts
await tx`set local session_replication_role = origin`.simple();
await tx`delete from public.warehouses
  where tenant_id = ${fixture.tenantId}::uuid
    and name = '公司仓库'
    and is_default and status = 'active' and version = 1
    and manager_employee_id is null
    and created_by_employee_id = ${fixture.actorEmployeeId}::uuid
    and updated_by_employee_id = ${fixture.actorEmployeeId}::uuid`;
```

- [x] 在残留 sum 中加入两项，检查 fixture 两个租户所有仓库／命令，不能只检查刚删除的正常默认仓库。

```sql
(select count(*) from public.warehouses where tenant_id in
  (${fixture.tenantId}::uuid, ${fixture.otherTenantId}::uuid)) +
(select count(*) from public.warehouse_command_events where tenant_id in
  (${fixture.tenantId}::uuid, ${fixture.otherTenantId}::uuid)) +
```

- [x] 在本机隔离临时实例、真实 Stage A 默认仓库 trigger 下验证：seed 后 1 仓库；原清理留下 1 孤儿（已复现）；新清理后 0 仓库／0 父记录；重复 cleanup 无残留；改名／改版本仓库不得被删除；有 warehouse_command_events 或库存 FK 引用时 cleanup 必须失败并回滚。真实 gateway 及 seed/cleanup 调用已纳入回归，不以源码字符串断言代替它。为让 macOS Bun 连接真实 SQL，本次完整 schema runner 使用随机 loopback-only 端口与合成密码；最小 SQL runner 仍为 network=none。没有真实库数据、凭据或根密钥进入容器。
- [x] 定向测试、API check 通过后再评审并提交修复；本步骤不运行开发库写 smoke。

Commands:

```bash
cd apps/api
bun test src/scripts/supplier-purchasable-sku-smoke-cleanup.test.ts
bun test src/scripts/supplier-purchasable-sku-smoke.test.ts
bun test src/scripts/supplier-purchasable-sku-explain.test.ts
bun run check
```

## Task 2：实现定向数据 migration

**Files:**

- Create: 通过仓库根目录 `supabase migration new repair_reviewed_orphan_warehouses` 创建的实际时间戳文件，位于 `supabase/migrations/`；不手填或回拨编号。
- Test: `scripts/fixtures/warehouse-stage-b/reviewed-orphan-repair.sql`，只在隔离库执行。
- Update: 本计划及根因证据，补充新 migration 文件名／hash／审查结果。

- [x] 先在隔离库构造精确 4 行、父租户／员工不存在但 FK 已建的历史状态；使用 replica 仅限合成复现，不在开发库制造坏数据。预期恢复 FK 失败。加入正常仓库、额外孤儿、修改过的目标和被引用目标，作为拒绝／保护分支。
- [x] 实现下面草案并评审、测试。实际 CLI 生成文件为 `20260908062915_repair_reviewed_orphan_warehouses.sql`，SHA-256 `8c0eb82591219a06e0d4572af78007b690082412fe274c12b888f22e7d5c666b`。实际实现另固定 UTC、比对关联表名称和列映射、拒绝新增无外键 warehouse_id 列及其他审计父引用孤儿。原 4 行 MD5 经开发库只读复核未变。**以下保留的代码块仍是历史设计草案，执行只使用实际文件。**

```sql
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $repair$
DECLARE
  v_ids uuid[] := ARRAY[
    'c040be4b-61a8-4966-9d7e-27e42fa942aa'::uuid,
    '1ae564fe-915a-40b7-9245-133d80c60961'::uuid,
    '402b619f-d22f-4fbc-ae18-6bd84a54333d'::uuid,
    'f1ba1d8a-b0db-42f2-a87e-8bcbd9e2601a'::uuid
  ];
  v_present integer;
  v_expected record;
  v_row public.warehouses%ROWTYPE;
  v_dependency record;
  v_has_dependency boolean;
  v_deleted integer := 0;
  v_affected integer;
BEGIN
  IF current_setting('session_replication_role') <> 'origin' THEN
    RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_TRIGGERS_REQUIRED';
  END IF;
  LOCK TABLE public.tenants, public.employees IN SHARE MODE;
  LOCK TABLE public.warehouses IN EXCLUSIVE MODE;
  SELECT count(*) INTO v_present FROM public.warehouses WHERE id=ANY(v_ids);
  -- 不含任何目标的环境不做数据修改；不按孤儿条件扫删其他记录。
  IF v_present=0 THEN RETURN; END IF;
  IF v_present<>4 THEN
    RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_TARGET_SET_CHANGED';
  END IF;
  IF EXISTS(SELECT 1 FROM public.warehouses w
    WHERE NOT EXISTS(SELECT 1 FROM public.tenants t WHERE t.id=w.tenant_id)
      AND NOT(w.id=ANY(v_ids))) THEN
    RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_UNREVIEWED_ORPHAN';
  END IF;
  IF (SELECT count(*) FROM pg_constraint
      WHERE contype='f' AND confrelid='public.warehouses'::regclass)<>9 THEN
    RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_DEPENDENCIES_CHANGED';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_constraint c ON c.oid=t.tgconstraint
    WHERE (c.conrelid='public.warehouses'::regclass
      OR c.confrelid='public.warehouses'::regclass)
      AND (NOT c.convalidated OR t.tgenabled NOT IN ('O','A'))) THEN
    RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_CONSTRAINT_GUARD';
  END IF;

  FOR v_expected IN SELECT * FROM (VALUES
      ('c040be4b-61a8-4966-9d7e-27e42fa942aa'::uuid,'992b842f-231b-46bb-b494-9b0f5cd5c192'::uuid,'db285789-726e-45e6-8fb4-cd878b467a1c'::uuid,'WH-000004','4103ef24183be8d47d90e7561ce9db22'),
      ('1ae564fe-915a-40b7-9245-133d80c60961'::uuid,'1116dec1-9c13-46a8-940b-48465e1db6e2'::uuid,'26bafdfb-4133-484a-b9e1-8c7beb59c638'::uuid,'WH-000024','ff2066f5bf7a0e7e76e44876c8715e46'),
      ('402b619f-d22f-4fbc-ae18-6bd84a54333d'::uuid,'c7264018-d4fb-410a-b342-3ffa755a6523'::uuid,'cedc1fc7-d3c0-41a7-8221-4dd5a21b7035'::uuid,'WH-000026','64118381064d0691523e6f42b03cec60'),
      ('f1ba1d8a-b0db-42f2-a87e-8bcbd9e2601a'::uuid,'77ba4a82-2cf8-452f-93d4-79e41dcc4340'::uuid,'a9176c33-99d3-458c-9bc4-93fe54e19982'::uuid,'WH-000032','baecc026272ffb676fa0e9c9e59f1d81')
  ) AS targets(id,tenant_id,employee_id,warehouse_code,row_md5)
  LOOP
    SELECT * INTO STRICT v_row FROM public.warehouses
      WHERE id=v_expected.id FOR UPDATE;
    IF v_row.tenant_id<>v_expected.tenant_id
      OR v_row.warehouse_code<>v_expected.warehouse_code
      OR v_row.created_by_employee_id IS DISTINCT FROM v_expected.employee_id
      OR v_row.updated_by_employee_id IS DISTINCT FROM v_expected.employee_id
      OR md5(to_jsonb(v_row)::text)<>v_expected.row_md5
      OR EXISTS(SELECT 1 FROM public.tenants WHERE id=v_row.tenant_id)
      OR EXISTS(SELECT 1 FROM public.employees WHERE id=v_expected.employee_id) THEN
      RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_ROW_CHANGED: %',v_expected.warehouse_code;
    END IF;

    FOR v_dependency IN SELECT conrelid::regclass AS relation
      FROM pg_constraint WHERE contype='f'
        AND confrelid='public.warehouses'::regclass
    LOOP
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE warehouse_id=$1)',
        v_dependency.relation)
      INTO v_has_dependency USING v_row.id;
      IF v_has_dependency THEN
        RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_HAS_DEPENDENCY: %',
          v_dependency.relation;
      END IF;
    END LOOP;

    INSERT INTO public.platform_audit_logs(
      action,actor_employee_id,actor_user_id,target_tenant_id,
      resource_type,resource_id,resource_label,status,summary,metadata
    ) VALUES(
      'warehouse_orphan_remediation',NULL,NULL,NULL,
      'warehouse',v_row.id,v_row.warehouse_code,'success',
      'migration: remove reviewed unreferenced orphan warehouse',
      jsonb_build_object('repair_key','warehouse-orphan-20260908',
        'execution_source','database_migration',
        'orphan_tenant_id',v_row.tenant_id,
        'before',to_jsonb(v_row),
        'before_md5',v_expected.row_md5)
    );
    DELETE FROM public.warehouses WHERE id=v_row.id;
    GET DIAGNOSTICS v_affected=ROW_COUNT;
    IF v_affected<>1 THEN
      RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_DELETE_COUNT';
    END IF;
    v_deleted:=v_deleted+v_affected;
  END LOOP;
  IF v_deleted<>4 THEN RAISE EXCEPTION 'WAREHOUSE_ORPHAN_REPAIR_TOTAL_COUNT'; END IF;
END;
$repair$;
COMMIT;
```

- [x] 验证正常目标路径恰好删除 4 行、审计恰好新增 4 行、before 完整可读、正常仓库和业务表数量不变；无目标环境 no-op；1–3 个目标／行 hash 改变／父租户重现／员工重现／新增关联约束／存在引用均必须失败且审计与删除一起回滚。另覆盖审计第二行失败、关闭／未验证约束、replica 会话拒绝和异时区整文件执行。
- [x] 对每项人工列出的 FK 来源和新增无约束 warehouse_id 列再做一次目录检查。若 schema 已变化，更新评审，不放宽“9 条”断言蒙混过关。
- [x] 评审通过后记录精确 hash 和不可变提交；已到达单独请求真实开发 apply 授权的检查点，不得先把文件塞入含 C 的发布候选并自动 push 全部 migration。
- [x] 取得固定文件与 hash 的真实开发 apply 最终确认。

## Task 3：隔离发布修复，重做备份恢复门禁

- [x] 从已应用开发基线准备只包含清理缺陷修复＋修复 migration 的候选，不包含 4 条 C migration。远端 main 只读核对与本地一致；在既有 worktree 创建专用分支、cherry-pick 修复得到 `af3c37f3`，没有修改 main／原 C 分支。
- [x] 在获准目标生成新备份，保留原失败归档；明确删除 4 条及日志审计方案并取得 apply 授权。应用前备份保留在 `/var/tmp/gooes-orphan-preapply-backup.GtsjTFgk`。
- [x] 使用固定修复候选的完整 migration list／dry-run，唯一待执行修复文件；通过 CLI db push 应用，没有手工远端 DDL／DML。
- [x] 应用后 migration list 595／595 全量对齐；核对孤儿=0、正常仓库整行 hash 不变、9 表数量和全行摘要不变、审计=4。
- [x] 基于纠正后的开发库重新生成全 schema、角色及 Vault 根密钥备份，匹配源 UTF8／ICU 编码与排序规则后完整 pg_restore 成功，保持所有约束／ownership／ACL；325 张表依据新同快照清单逐表对账差异 0。临时容器已确认清除。
- [x] 修复与验收记录已本地合入 C 候选，重新求完整差集为 Local 599／Remote 595，仍仅原 4 条 C 待执行。修复 migration 的新时间戳晚于 C 原 4 条，未来应用需审查 `--include-all` 或完整差集工作流；不能改已应用编号、repair 历史或混作本次升级。没有执行 C apply。

## 回退与验收界限

这是破坏性数据纠正：删除仅限 4 条确认无父租户／无引用的孤儿仓库。删除前全行快照保存在已有 platform_audit_logs.metadata.before，原数据库归档也保留。不能简单反向插回并制造同样 FK 违规；若确需恢复，须先明确父租户／员工恢复方案，再以独立审核的前向 migration 完成，不关闭约束。

清理修复、数据纠正、备份恢复分别验证。即使三项通过，也不等于阶段 C 已应用或实际领退料验收通过。Orange 不在修改范围。

## 自检

- [x] 原因证据和历史归因不确定性分别说明。
- [x] 精确 4 行白名单、整行变化检测、依赖拒绝、审计原子性和回退限制齐全。
- [x] 正常仓库不动；没有伪造员工／租户或删除库存成本事实。
- [x] 修复 migration 与 C 的执行顺序、授权和时间戳陷阱已说明。
- [x] 代码与 migration 实施、隔离验证、两阶段独立评审已完成；本地与远端 main 引用已只读核对一致，独立迁移暂存目录的 CLI 清单唯一待执行修复文件。
- [x] 真实开发 apply、修复后备份／完整恢复门禁、修复同步至本地 C 候选已完成；代码 push／部署与 C 发布不在本次授权中。

本计划执行完成。下一步应单独发布清理代码以防旧 smoke 再制造孤儿；C 仍需独立的发布／apply／测试租户及真实业务验收授权，不能把本次恢复门禁通过当作 C 已上线。
