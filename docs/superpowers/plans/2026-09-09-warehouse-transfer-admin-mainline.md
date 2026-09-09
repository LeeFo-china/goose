# 调拨 Admin 主线集成 Implementation Plan

> **For agentic workers:** Use subagent-driven-development with SPEC then quality review. User approved current-mainline integration and DEV Admin release; no production or Orange writes.

**Goal:** 在当前主线保留采购工作台更新的前提下恢复调拨 Admin，再继续真实 DEV 验收。

**Architecture:** 仅移植已审查的 `2f20df15`、`e20387a1` 中 Admin 差异；不重发旧整树，不改 API、Domain、迁移、依赖或发布流程。既有工作区切换到基于 `43cb38bf` 的 `feature/warehouse-transfer-admin-mainline`。

**Tech Stack:** Bun、Next.js、React、现有 shadcn/Radix、Playwright、现有 Release Dev workflow。

## Task 1：最小集成

文件范围：`apps/admin/components/warehouse-transfers/*`、`app/(console)/warehouse-transfers/page.tsx`；既有 inventory、supplier settings、platform tenant rollout、layout menu 对应差异；调拨/rollout E2E 与调拨 Playwright 配置。

- [x] 获取远端 main，确认 `43cb38bf` 与 DEV API/Admin 实际版本一致；旧分支排障证据保存于 `a8048208`，未丢弃用户变更。
- [x] 运行当前主线相关单测和 Admin check；先恢复已有回归测试并观察缺少调拨实现的 RED，再恢复既有实现。
- [x] 运行受影响单测及 `bun run check`；独立 SPEC 后质量审查。对比 `git diff 43cb38bf -- apps/api packages/domain supabase` 必须为空，采购工作台文件亦无差异。
- [x] 静态通过后跑调拨、库存、rollout 桌面/375px E2E，并追加采购工作台受影响回归；模拟测试不代替真实验收。

## Task 2：固定候选与 DEV Admin 发布

- [x] 发布前重查 main、DEV 容器 SHA、活动 workflow、磁盘和只读业务基线，防止集成期间再有覆盖。
- [x] 确认 migration list Local/Remote 对齐；本批无 migration，不执行 apply。
- [x] 集成提交后推送功能分支和唯一固定 release 分支，通过 `gh workflow run release-dev.yml --ref release/warehouse-transfer-admin-mainline-dev-20260909 -f service=admin -f operation=release` 仅发布 Admin。不合并 main、不触发生产。
- [x] 等待 workflow success，并核对实际 Admin SHA/digest/健康、API 仍为发布前版本、迁移门禁与业务基线。回滚只能通过既有流程重发发布前固定 SHA，不做数据回滚。

## Task 3：真实 Chrome 验收

- [ ] Chrome 访问调拨页不再 404，核对指定租户、既有权限员工与明确测试 SKU。
- [ ] 具备现有权限时正常 UI 配置测试开关和双仓，执行正常/反向调拨，核对数量/价值守恒和项目成本/应付/付款未变化；结束关闭开关。不得自动赋权或直接 SQL 修库。
- [ ] 记录实际结果与未完成门禁。D1 真实验收未满足不得进入 D2。

最新状态：`4e522bef` / run `34305784359` DEV Admin 发布成功，Chrome 调拨页404已消除；API保留43cb38bf、库存及财务十组摘要未变。真实验收发现共享 `PERMISSION_CODE_VALUES` 遗漏两个调拨权限，导致已有 system_admin 风清扬仍为217项、无法写调拨。用户已提供平台账号，已填写登录表单但未提交；测试开关未开启、无业务写入。用户已授权扩展到以下权限注册修复与 DEV API/Admin 发布，不通过员工赋权绕过。

## Task 4：调拨权限注册根因修复（用户已授权，先于 Task 3 写验收）

设计：数据库现有 `20260908185501` 已注册两项调拨权限，服务严格检查权限正确；缺失在共享枚举，系统管理员登录上下文从枚举派生。选择补齐枚举及配置，保持鉴权与角色规则不变。手工赋权、服务绕过检查都不能修复该派生链路，排除。无数据库、依赖、采购工作台和 Orange 改动。

- [x] 在 `packages/domain/src/permission.test.ts` 验证两项权限存在且配置标签与 migration 一致；新增 `apps/api/src/services/authorization/system-admin-warehouse-transfer-permissions.test.ts`，真实 `buildAuthContext` 到 `WarehouseTransfersService.command`，仅替代 repository 边界。覆盖 manage/approve 正向和普通/停用/无租户员工拒绝，拒绝时不触达 RPC。
- [x] 先运行上述测试，确认缺少注册及系统管理员 403 的 RED；API 测试前确保 Domain dist 为当前源码构建。
- [x] 仅修改 `packages/domain/src/permission.ts`，在值数组和配置中加入 `inventory.transfer.manage`（管理仓库调拨）及 `inventory.transfer.approve`（确认仓库调拨），配置 module=inventory、resource=transfer、action=manage/approve，与数据库一致。
- [x] 运行 Domain build/permission tests、API typecheck/受影响授权与调拨测试、Admin check/相关权限组件测试；静态通过后串行运行调拨 E2E。独立 SPEC 后 quality 审查。
- [x] 固定新提交及唯一 release 分支。重查远端 main、DEV 容器、活动 workflow、migration 对齐与只读业务基线，通过既有 `release-dev.yml` 的 `service=api,admin` 发布 DEV。核对 workflow、容器 revision/digest、健康。回滚仅重发已记录的前版本，不回滚业务数据。
- [ ] 回到 Task 3；正常 Chrome 登录，不读取凭证、不手工赋权。只有真实正向/反向调拨、库存价值守恒、财务隔离及关闭开关通过后，才标记 D1 完成并进入 D2。

Task 4发布结果：候选 `240e7a78` / run `34307897288` 成功，API/Admin实际容器revision/digest/健康及API加载权限均已核验；发布前后业务摘要一致。后续用户指出DEV免验证码，已核对现有实现并在Chrome空验证码正常提交一次，原页面已进入dashboard。不要再要求验证码。当前页面接管/读取持续超时，尚未核验登录后身份或执行真实调拨；原页面已handoff保留，开关false、测试库存1/88元未变。D1真实验收未完成，D2未进入；详见 `docs/operations/evidence/2026-09-09-warehouse-transfer-permissions-release.md`。
