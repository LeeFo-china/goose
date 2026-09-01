# Supplier SKU Main Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已在 dev 验证的商品、SKU、即时供货价原子保存能力完整合入 main，恢复 `20260901130000` 的仓库/开发库迁移历史一致性，并重新发布 API、Admin 与抖音资料查询性能门禁。

**Architecture:** 以当前 `origin/main` 为唯一集成基线，使用真实 Git merge 保留供应商分支的完整提交谱系。只人工解决已预演确认的 `apps/api/package.json` 脚本冲突；抖音迁移采用自动三方合并结果并通过逐文件同一性检查保护。数据库只通过受保护的 dev migration workflow 验证或应用，禁止手工执行远端 DDL/DML。

**Tech Stack:** Git worktree、Bun 1.3.2、TypeScript、Fastify、Next.js、Supabase migrations、GitHub Actions。

---

### Task 1: 锁定集成基线和迁移根因

**Files:**
- Create: `docs/superpowers/plans/2026-09-02-supplier-sku-main-integration.md`
- Inspect: `supabase/migrations/20260901130000_create_supplier_purchasable_sku_command.sql`

- [ ] **Step 1: 确认隔离分支精确基于 main**

Run:

```bash
git rev-parse HEAD
git rev-parse origin/main
git branch --show-current
```

Expected: 两个 SHA 都为 `b5a211694dc23841d183eb11a6d03038a05745ed`，分支为 `integration/supplier-sku-main`。

- [ ] **Step 2: 确认远端缺失项在供应商分支中唯一存在**

Run:

```bash
git ls-tree -r --name-only docs/supplier-sku-inline-price-design \
  | rg '^supabase/migrations/20260901130000_create_supplier_purchasable_sku_command.sql$'
git ls-tree -r --name-only origin/main \
  | rg '^supabase/migrations/20260901130000_create_supplier_purchasable_sku_command.sql$' \
  && exit 1 || true
```

Expected: 供应商分支命中一次，main 不命中。

- [ ] **Step 3: 提交集成计划**

```bash
git add docs/superpowers/plans/2026-09-02-supplier-sku-main-integration.md
git commit -m "docs(supplier): 规划 SKU 主线集成"
```

### Task 2: 合并完整供应商能力

**Files:**
- Modify: `apps/api/package.json`
- Merge: `docs/supplier-sku-inline-price-design`

- [ ] **Step 1: 执行非快进合并并确认唯一冲突**

Run:

```bash
git merge --no-ff docs/supplier-sku-inline-price-design
git diff --name-only --diff-filter=U
```

Expected: merge 暂停，唯一未合并文件为 `apps/api/package.json`。

- [ ] **Step 2: 合并两边 package scripts**

保留 main 中：

```json
"douyin:material-note:explain": "bun src/scripts/douyin-material-note-explain.ts"
```

同时保留供应商分支中：

```json
"supplier:purchasable-sku:smoke": "bun src/scripts/supplier-purchasable-sku-smoke.ts",
"supplier:purchasable-sku:explain": "bun src/scripts/supplier-purchasable-sku-explain.ts"
```

- [ ] **Step 3: 验证无冲突标记并完成 merge commit**

Run:

```bash
rg -n '^(<<<<<<<|=======|>>>>>>>)' apps packages supabase docs .github
git diff --check
git add apps/api/package.json
git commit
```

Expected: `rg` 不命中，merge commit 成功。

### Task 3: 验证迁移和双功能语义不回退

**Files:**
- Verify: `supabase/migrations/20260901120000_create_douyin_material_notes.sql`
- Verify: `supabase/migrations/20260901120010_validate_douyin_material_note_events.sql`
- Verify: `supabase/migrations/20260901120020_swap_douyin_material_note_events.sql`
- Verify: `supabase/migrations/20260901120030_index_douyin_material_note_event_erasure.sql`
- Verify: `supabase/migrations/20260901130000_create_supplier_purchasable_sku_command.sql`
- Verify: `apps/api/src/types/database.ts`

- [ ] **Step 1: 确认抖音迁移内容仍等于合并前 main**

Run:

```bash
for file in supabase/migrations/20260901120000_create_douyin_material_notes.sql \
  supabase/migrations/20260901120010_validate_douyin_material_note_events.sql \
  supabase/migrations/20260901120020_swap_douyin_material_note_events.sql \
  supabase/migrations/20260901120030_index_douyin_material_note_event_erasure.sql; do
  git diff --exit-code b5a211694dc23841d183eb11a6d03038a05745ed HEAD -- "$file"
done
```

Expected: 四个文件均无差异。

- [ ] **Step 2: 确认数据库类型同时包含两个领域**

Run:

```bash
rg -n 'command_supplier_purchasable_sku_v1|get_supplier_purchasable_sku_price_context_v1|claim_douyin_material_note' \
  apps/api/src/types/database.ts
```

Expected: 三个函数签名均存在。

- [ ] **Step 3: 运行供应商和资料门禁专项测试**

Run:

```bash
bun test \
  apps/api/src/schema/supplier-purchasable-skus.test.ts \
  apps/api/src/repositories/supplier-purchasable-skus.test.ts \
  apps/api/src/repositories/supplier-purchasable-skus-save.test.ts \
  apps/api/src/services/supplier-purchasable-skus.test.ts \
  apps/api/src/services/supplier-purchasable-skus-write.test.ts \
  apps/api/src/controllers/supplier-purchasable-skus/routes.test.ts \
  apps/api/src/services/supplier-purchasable-sku-migration-contract.test.ts \
  apps/api/src/scripts/supplier-purchasable-sku-smoke.test.ts \
  apps/api/src/scripts/supplier-purchasable-sku-explain.test.ts \
  apps/api/src/scripts/douyin-material-note-explain*.test.ts
```

Expected: 全部通过且无远端数据库访问。

### Task 4: 执行完整静态、构建和前端回归

**Files:**
- Verify only.

- [ ] **Step 1: 运行 API 和仓库安全门禁**

```bash
bun run api:check
bun run check:permission-boundaries
bun run audit:supabase-writes
```

Expected: 全部退出码为 0。

- [ ] **Step 2: 运行 Admin 类型、测试和构建**

```bash
pnpm --dir apps/admin check
pnpm --dir apps/admin build
```

Expected: 类型检查、单测和生产构建通过。

- [ ] **Step 3: 运行供应商定价浏览器回归**

```bash
pnpm --dir apps/admin test:e2e:supplier-product-pricing
```

Expected: SKU 与即时供货价组合保存场景全部通过，无浏览器控制台错误。

### Task 5: 推送 main 并恢复迁移一致性

**Files:**
- No local file changes.

- [ ] **Step 1: 提交前确认范围和远端 main 未前移**

```bash
git fetch origin main
test "$(git merge-base HEAD origin/main)" = "$(git rev-parse origin/main)"
git diff --check origin/main...HEAD
git status --short
```

Expected: 仅允许未跟踪的既有抖音交接文档；main 可非强制快进。

- [ ] **Step 2: 非强制推送 main**

```bash
git push origin HEAD:main
```

Expected: main 快进至集成 SHA。

- [ ] **Step 3: 通过受保护 workflow 运行 dev migration plan**

```bash
gh workflow run migrate-dev-database.yml --ref main \
  -f mode=plan \
  -f confirm_dev_project_ref=fclnkyatvfvmzgzdqlba
```

Expected: workflow 成功并确认 Local/Remote 已对齐；若仍有 pending，只能再通过同一 workflow 的 `apply` 模式处理。

### Task 6: 按 API 后 Admin 顺序发布 dev

**Files:**
- No local file changes.

- [ ] **Step 1: 发布 API**

```bash
gh workflow run release-dev.yml --ref main \
  -f service=api -f operation=release \
  -f reason='Integrate supplier SKU atomic save and restore migration alignment'
```

Expected: migration、API deploy、revision 和健康检查均成功。

- [ ] **Step 2: 运行真实供应商 smoke 与 EXPLAIN**

从仓库根目录的开发环境文件加载地址但不打印地址；先用现有目标校验器同时核对项目 ref、
dev host 和生产拒绝列表，再把 direct URL 仅注入两个 CLI：

```bash
set -a
source /Users/leefo/Public/work/gooes/.env
set +a
export SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-fclnkyatvfvmzgzdqlba}"
node scripts/validate-dev-database-target.mjs --direct-migration-history \
  "${SUPABASE_DB_DIRECT_URL}" "${SUPABASE_PROJECT_REF}" \
  api-dev.goodcms.cn fclnkyatvfvmzgzdqlba \
  'api.goodcms.cn 1.13.20.39' unqhypivjkpwldhufpjc
SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL="${SUPABASE_DB_DIRECT_URL}" \
  bun run --cwd apps/api supplier:purchasable-sku:smoke
SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL="${SUPABASE_DB_DIRECT_URL}" \
  bun run --cwd apps/api supplier:purchasable-sku:explain
```

Expected: 原子新增、编辑、幂等、并发、未来价格保护、清理和索引计划全部通过，输出不含凭据或真实业务标识。

- [ ] **Step 3: 发布 Admin**

```bash
gh workflow run release-dev.yml --ref main \
  -f service=admin -f operation=release \
  -f reason='Enable supplier SKU and price combined form after API smoke'
```

Expected: Admin revision 等于集成 SHA，组合表单可连接新版 API。

### Task 7: 恢复抖音资料性能验收并记录状态

**Files:**
- Modify after runtime evidence: `docs/miniprogram/2026-09-01-douyin-material-note-claims-handoff.md`

- [ ] **Step 1: 运行受保护资料 EXPLAIN workflow**

```bash
gh workflow run verify-dev-douyin-material-note-explain.yml --ref main \
  -f commit_sha="$(git rev-parse HEAD)" \
  -f confirmation=development-read-only
```

Expected: 若已有真实领取，三条 plan 与脱敏 artifact 全部通过；若返回 `REPRESENTATIVE_CLAIM_MISSING`，如实记录并等待真实抖音账号领取，不创建数据库伪 fixture。

- [ ] **Step 2: 更新交接证据**

记录 main SHA、migration workflow、API/Admin 发布 run、三个性能计划或稳定缺失领取码，以及仍需真实抖音账号完成的事项。文档不得包含手机号、UUID、subject hash、数据库地址或 token。

- [ ] **Step 3: 最终审计**

```bash
git status --short
git diff --check
git ls-remote origin refs/heads/main
```

Expected: main 和 dev revision 有明确证据；未完成的真实账号、无手机号副作用和生产审批不得被误报为完成。
