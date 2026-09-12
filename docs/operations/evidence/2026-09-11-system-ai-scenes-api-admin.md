# 系统场景与 Admin 模型选择验证

## 范围

执行系统场景注册、后端完整路由校验和 Admin 模型选择交互。不包含火山方舟 AK/SK 目录同步、真实模型调用、开发业务库 migration 应用或服务发布。

工作区：`.worktrees/customer-rendering-library`；基线提交：`55b7b100d`。

## 已确认根因

- `AiConfigService.updateSceneRoute` 只校验 PATCH 请求字段，不读取并合并已保存路由。遗漏 modality 或另一侧模型时可能绕过完整匹配/重复校验。
- Admin 供应商选择仅更新表单状态，模型候选只在点击搜索时请求；缺少自动加载、分页、明确状态和请求代次保护。

## 基线验证

- 根目录 `bun run api:typecheck`：通过。
- 根目录 `pnpm --dir apps/admin check`：文件大小和类型检查通过。
- `apps/api` 内 `bun test src/services/ai-config/index.test.ts src/repositories/ai-config.test.ts`：10 pass / 0 fail / 27 assertions。
- domain `ai-scenes.test.ts`：6 pass / 0 fail / 79 assertions。
- `apps/admin` 内 `pnpm exec playwright test --config playwright.ai-provider-secrets.config.ts`：11 passed（31.8s），包括密钥和供应商删除。
- API Bun 测试须在 `apps/api` 执行；从根目录直接运行会因 `@/` 别名上下文错误而失败，不能据此判断业务回归。

## 数据库测试边界

本机 Docker daemon 不可用。使用开发服务器现有 PostgreSQL 可执行程序另起隔离测试 cluster，不连接业务库：

- 主机校验：`VM-0-11-ubuntu`。
- 独立数据目录：`/tmp/gooes-system-scenes-pg.BOHbJH/data`。
- Unix socket：`/tmp/gooes-system-scenes-pg.BOHbJH`，端口 `6544`，`listen_addresses` 为空，无 TCP 监听。
- 限定资源：`shared_buffers=16MB`、`max_connections=10`。
- 仅加载合成 fixture，不加载应用数据；测试结束停止本次 cluster，保留测试文件供排查。
- 已执行 `pg_ctl -D /tmp/gooes-system-scenes-pg.BOHbJH/data -m fast -w stop`，确认 `server stopped`。

## 后端实施后验证

- 定向命令（在 `apps/api`）：`bun test src/services/ai-config/index.test.ts src/services/ai-config/scene-routes.test.ts src/repositories/ai-config.test.ts src/schema/ai-config-scene-routes.test.ts src/services/ai-system-scene-registry-migration.test.ts src/controllers/ai-config/index.test.ts`。
- 结果：23 pass / 0 fail / 95 assertions。
- 根目录 `bun run api:typecheck`、`bun run api:check-file-size`：通过；`git diff --check`：通过。
- `packages/domain` 内 `bun run build`：通过，dist 159651 bytes。
- 后端规格审查：PASS；质量审查发现并修复 Zod `.partial()` 默认值泄漏后复查 PASS。
- 新增 PATCH 回归：仅改名称不注入 `quality_tier/status`，保留原 `fast/inactive`；未接通图片场景保留/清空旧绑定可行，替换或新增绑定拒绝。
- 扩展回归（在 `apps/api`）：`bun test src/services/ai-config src/controllers/ai-config src/repositories/ai-config.test.ts src/repositories/ai-provider-delete.test.ts src/repositories/ai-model-catalog.test.ts src/schema/ai-config-scene-routes.test.ts src/services/ai-system-scene-registry-migration.test.ts`，结果 83 pass / 0 fail / 376 assertions。
- 根目录 `bun run api:build`：通过，984 modules，产物约 5.14 MB。

### 实际 PostgreSQL 验证

在独立测试 cluster 的 `gooes_system_scenes_fixture` 数据库按顺序执行：

1. `supabase/tests/ai_system_scene_registry_conflict.sql`：预期报 `ai_system_scene_historical_modality_conflict`，DETAIL 为 `historical_conflict`；事务回滚，断言两条旧记录保留、注册表未创建，通过后清理本 fixture 的合成表。
2. `supabase/tests/ai_system_scene_registry_migration.sql`：插入 10 个 system 和 1 个 legacy；验证历史身份/绑定、FK、RLS、授权、编码保护、不可新增 legacy、不可为未接通场景新增模型绑定，以及旧路由普通编辑，全部通过。

最终触发器调整后已重跑上述两项，整体退出码 0。首轮测试库改名为 `gooes_system_scenes_fixture_first` 保留，重跑使用新建的同名 fixture 库。

已执行的 migration SHA-256：`424b997d7b38a0178552c72043562e204753547c33c4849cf328472709004bed`。

新增 migration 为 `20260911151225_create_ai_system_scene_registry.sql`，**尚未在开发业务库应用**；以上是隔离测试结果，不代表发布完成。

## Admin 实施后验证

验证完成时间：2026-09-12（Asia/Shanghai）。

- 根目录 `pnpm --dir apps/admin check`：文件大小与类型检查通过，1590 个 TS/TSX 文件通过大小门禁。
- `apps/admin` 内 `bun test components/platform-ai`：30 pass / 0 fail / 171 assertions。
- `apps/admin` 内 `pnpm exec playwright test --config playwright.ai-provider-secrets.config.ts`：初轮主代理独立复跑 23 passed（57.8s），规格修复后 25 passed（1.0m）；质量修复后的最终复跑 26 passed（1.0m），其中新增 15 项路由交互，原有 11 项密钥与供应商删除回归保持通过。
- 主代理最终运行 API 扩展回归：85 pass / 0 fail / 419 assertions；domain 场景定义：6 pass / 0 fail / 79 assertions。
- 浏览器测试仅使用本地 mock、合成账号与模型，不连接真实供应商，不触发收费调用；测试服务器随验证结束退出。
- 终端输出存在 `NO_COLOR` / `FORCE_COLOR` 配色环境警告，不影响测试结果。

### 已验证的界面边界

- 中文场景选择、编码/模态只读，PATCH 不重写身份，保留版本与旧参数。
- 选择场景、供应商和首次编辑自动加载；加载不等于自动选中模型。
- 候选加载、错误重试、空态、搜索、分页，以及目录/手工候选离页后保存。
- 主备选择独立；切换供应商/场景、编辑与重置后，迟到结果不能覆盖当前状态。
- 缺失/停用模型绑定保留显示和 ID；停用供应商下不能新增模型选择。
- 同步保存锁阻止双击重复写入，并锁定编辑、重置及供应商删除。
- 注册表失败不清空已有路由/供应商，支持独立重试；只读账号没有路由变更入口。
- 未接通生图场景显示明确警告，禁止新配置/更换绑定，不声称方舟目录或生图已接通。

### 修复过程证据

新增回归实测捕获了草稿中的生图新增入口、缺失关联不显示、已选模型掩盖搜索空态、同 ID 候选覆盖旧绑定显示，以及停用供应商仍可更换模型问题。另修复旧场景闭包导致从未接通场景编辑文本路由时跳过候选加载。

原布局源文件断言在拆分 hook 后失败，已调整为检查新模块中的分页和状态约束，未移除约束。浏览器分页测试曾错误命中路由表页脚，已限定主模型分组；没有修改通用请求重试机制来掩盖失败。

### 界面检查

遵循现有 Admin/shadcn 规范，拆分编辑状态、候选请求、模型选择器和表格，未修改全局壳或引入依赖。主代理已查看以下本地截图：

- `apps/admin/test-results/ai-provider-secrets/ai-model-routes-注册表失败保留路由和供应商列表，支持独立重试-chromium/route-desktop.png`
- `apps/admin/test-results/ai-provider-secrets/ai-model-routes-未接通生图场景阻止新绑定，旧路由保留只读身份和已有绑定-chromium/route-raw-drawing-mobile.png`

桌面表格保持自身横向滚动；400px 下生图警告与身份字段可读，没有页面级横向溢出。截图属于本地测试产物，不纳入 Git。

### 审查与交付

独立规格审查发现并修复三项问题，复审 PASS：

1. mock 原先把缺失/停用旧绑定的 PATCH 错误模拟为成功。修正为与真实后端一致的 `AI_MODEL_NOT_FOUND`、`AI_MODEL_INACTIVE`、`AI_PROVIDER_INACTIVE`；验证错误后表单和 ID 保留，另验证有效 raw 旧绑定正常保存。界面明确提示恢复有效状态或在场景允许时替换/清空，后端完整校验没有放宽。
2. 为只读账号可见的路由表补上共享 domain 驱动的“运行时尚未接通”标识，页头说明限定为已接通场景。
3. 修复既有手工候选追加到每页导致超出 pageSize、总数不准的问题。候选现在位于全部内部结果之后的唯一分页位置；新增生产 service 回归覆盖内部总量 0/19/20/21/100、pageSize 20/100 和越末页，不增加查询数或扩大数据库查询范围。

三个界面修复用例先运行得到 3 failed，再完成修复并通过最终全套验证。分页 service 测试先因总数错误失败，修复后通过；测试 fixture 的元组与状态字面量类型错误也已定位并修正。

质量审查发现旧路由的模型关联缺少嵌套供应商元数据，导致绑定供应商不在首 100 条候选时，前端补入旧供应商的路径在真实 API 下无效。已在原分页关联查询中补充两侧供应商的 `id/code/name/provider_type/status`，不查询密钥/endpoint，不增加查询次数。新增 repository 测试先 RED 后 GREEN，并将 mock 改为相同字段投影；新增 101 个供应商、旧绑定位于首 100 条以外的浏览器 fixture。

独立代码质量与整体复审 PASS，无剩余 P1/P2；最终 26 项浏览器测试退出码 0。最终 API 类型检查、文件大小门禁和构建再次通过；`git diff --check` 通过。

后端本地提交为 `466c1a89b`；Admin 与接口收尾修复随本记录一并提交。新增 migration 尚未应用开发业务库，本轮没有发布或推送。后续发布仍需先确认待应用 migration、应用并验证 Local/Remote 对齐；不得把本地隔离 fixture 结果当成业务库发布结果。
