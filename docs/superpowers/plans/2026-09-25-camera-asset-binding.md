# 摄像头设备资产与项目绑定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让设备资产以机身 SN 独立登记、支持租户级预览，并让项目从未绑定设备中选择后设置业务别名。

**Architecture:** 在 `tenant_devices` 增加独立机身 SN，保留腾讯云 DeviceId/ChannelId 作为集成标识。租户设备服务负责登记、关联摘要和预览，项目摄像头服务只负责把未绑定通道绑定到项目；Admin 复用现有播放器和高级设置。

**Tech Stack:** Bun、TypeScript、Fastify、Supabase migration、Next.js、React、shadcn/Radix、Tailwind。

---

### Task 1: 设备 SN 数据模型

**Files:**
- Create: `supabase/migrations/20260925090000_add_tenant_device_hardware_serial.sql`
- Modify: `apps/api/src/types/database.ts`
- Modify: `apps/api/src/schema/tenant-devices.ts`
- Modify: `apps/api/src/repositories/tenant-devices/legacy/shared.ts`
- Test: `apps/api/src/services/tenant-device-asset-contract.test.ts`

- [x] 先写迁移契约测试，验证列、注释和部分唯一索引存在，并运行确认失败。
- [x] 添加 nullable `hardware_serial`、标准化检查与根资产部分唯一索引。
- [x] 扩展生成类型、schema 与 repository row 类型，再运行测试确认通过。

### Task 2: 租户级登记设备与项目摘要

**Files:**
- Modify: `apps/api/src/controllers/tenant-devices/index.ts`
- Modify: `apps/api/src/services/tenant-devices/legacy-service.ts`
- Create: `apps/api/src/services/tenant-devices/legacy/tenant-tencent-create.ts`
- Modify: `apps/api/src/services/tenant-devices/legacy/lists.ts`
- Modify: `apps/api/src/repositories/tenant-devices/legacy/hydrate.ts`
- Modify: `apps/api/src/repositories/tenant-devices/legacy/queries.ts`
- Modify: `apps/api/src/repositories/tenant-devices/legacy/mutations.ts`
- Test: `apps/api/src/services/tenant-device-asset-contract.test.ts`

- [x] 写失败测试，约束 `POST /tenant-devices/tencent`、SN 冲突、无项目创建和列表关联摘要。
- [x] 实现租户级腾讯设备创建，云端名称使用规范化 SN，资产 `source_project_id` 为空。
- [x] 同步通道时从根设备继承 `hardware_serial`，列表分页后批量补全项目与摄像头摘要。
- [x] 运行 API 定向测试确认通过。

### Task 3: 设备资产预览

**Files:**
- Modify: `apps/api/src/controllers/tenant-devices/index.ts`
- Modify: `apps/api/src/services/tenant-devices/legacy-service.ts`
- Create: `apps/api/src/services/tenant-devices/legacy/playback.ts`
- Test: `apps/api/src/services/tenant-device-playback.test.ts`

- [x] 写失败测试，覆盖租户隔离、根设备无通道、离线、腾讯实时地址和萤石播放参数。
- [x] 实现 `POST /tenant-devices/:id/play-params`，复用播放器响应结构并通过 error factory 返回错误。
- [x] 运行设备预览测试确认通过。

### Task 4: 用设备资产 ID 安全绑定项目

**Files:**
- Modify: `apps/api/src/schema/project-cameras.ts`
- Modify: `apps/api/src/services/project-cameras/legacy/mutations.ts`
- Modify: `apps/admin/components/cameras/camera-form-submit.ts`
- Test: `apps/api/src/services/project-camera-tenant-device-binding.test.ts`
- Test: `apps/admin/components/cameras/camera-asset-binding.test.ts`

- [x] 写失败测试，覆盖资产租户、通道完整性、未绑定检查和并发 409。
- [x] 请求新增 `tenant_device_id`，后端从资产解析厂商字段并绑定。
- [x] 前端提交资产 ID 与别名，不再把第三方标识作为可信输入。
- [x] 运行 API 与 Admin 定向测试确认通过。

### Task 5: Admin 设备管理与项目绑定体验

**Files:**
- Modify: `apps/admin/components/cameras/camera-types.ts`
- Modify: `apps/admin/components/cameras/tenant-device-assets-panel.tsx`
- Modify: `apps/admin/components/cameras/tenant-device-asset-actions.tsx`
- Create: `apps/admin/components/cameras/tenant-device-create-dialog.tsx`
- Create: `apps/admin/components/cameras/tenant-device-preview-action.tsx`
- Modify: `apps/admin/components/cameras/camera-form-dialog.tsx`
- Modify: `apps/admin/components/cameras/camera-project-device-fields.tsx`
- Modify: `apps/admin/app/(console)/cameras/page.tsx`
- Test: `apps/admin/components/cameras/camera-asset-binding.test.ts`
- Test: `apps/admin/app/(console)/cameras/cameras-page-layout.test.ts`

- [x] 写失败契约测试，约束 SN、项目名称、未绑定状态、预览、设备 Select、别名和默认收起高级设置。
- [x] 设备管理改为登记 SN，列表显示项目关系并提供通道预览。
- [x] 项目绑定表单移除厂商选择，选择未绑定资产后填写别名；高级设置保持折叠。
- [x] 顶部加入全局入口，项目行使用同一表单且不再创建云端设备。
- [x] 运行 Admin 定向测试和类型检查。

### Task 6: 验证与提交

**Files:**
- Verify all modified files

- [x] 运行 `bun test` 的摄像头与设备定向测试。
- [x] 运行 `pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit`。
- [x] 运行 `pnpm --dir apps/admin check`。
- [x] 运行 `bun run api:build` 和 `pnpm --dir apps/admin build`。
- [x] 运行 migration 静态检查并确认工作区只包含本需求改动。
- [x] 使用 Conventional Commit 提交。
