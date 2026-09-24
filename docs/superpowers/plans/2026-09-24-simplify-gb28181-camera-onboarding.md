# GB28181 摄像头最简接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将公司端 GB28181 IPC 接入收敛为“选定项目、填写一个名称、配置设备、检测并自动绑定”的连续流程，并支持同一项目连续添加多台摄像头。

**Architecture:** 新增一个客户端接入对话框编排现有腾讯设备创建、资产同步、分页资产查询和项目摄像头创建接口。将设备匹配、通道决策和默认绑定 payload 放入纯函数模块，通过 Bun 测试覆盖；现有 NVR、萤石和高级设备管理入口继续保留。

**Tech Stack:** Next.js 15、React 19、TypeScript、shadcn/Radix、Tailwind、Bun test、现有 `requestBackendJson`。

---

## 文件结构

- Create: `apps/admin/components/cameras/gb28181-onboarding-rules.ts`：默认绑定 payload、设备资产匹配和通道决策纯函数。
- Create: `apps/admin/components/cameras/gb28181-onboarding-rules.test.ts`：规则层行为测试。
- Create: `apps/admin/components/cameras/gb28181-onboarding-dialog.tsx`：名称、接入信息、检测、通道选择、成功和连续添加状态。
- Create: `apps/admin/components/cameras/gb28181-project-picker.tsx`：按关键词分页查找可接入项目。
- Modify: `apps/admin/app/(console)/cameras/page.tsx`：把普通主操作替换为最简接入入口，并传入项目上下文。
- Modify: `apps/admin/components/cameras/tenant-device-assets-panel.tsx`：设备管理区保留高级创建和同步入口，增加未完成设备的继续接入入口。
- Modify: `apps/admin/components/cameras/cameras-workspace-tabs.tsx`：将“设备接入”改为“设备管理”。
- Modify: `apps/admin/components/cameras/camera-settings-fields.tsx`：新增时只显示名称；编辑时把其余字段归入高级设置并停止要求安装位置。
- Modify: `apps/admin/components/cameras/cameras-page-layout.test.ts`：锁定普通入口文案和高级设备管理边界。
- Create: `apps/api/src/services/tenant-devices/legacy/tenant-tencent.ts`：按公司边界恢复腾讯云 SIP 接入信息。
- Modify: `apps/api/src/controllers/tenant-devices/index.ts`：提供未完成设备的继续接入接口。

### Task 1: 接入规则与默认值

**Files:**
- Create: `apps/admin/components/cameras/gb28181-onboarding-rules.test.ts`
- Create: `apps/admin/components/cameras/gb28181-onboarding-rules.ts`

- [x] **Step 1: 写失败测试**

覆盖三项行为：默认 payload 不包含安装位置业务输入、只匹配本次 `device_id` 的未绑定腾讯通道、单通道自动选择而多通道要求选择。

```ts
import { describe, expect, test } from "bun:test";
import {
  buildGb28181CameraPayload,
  decideGb28181Channel,
  findGb28181Channels,
} from "./gb28181-onboarding-rules";

test("builds safe defaults from one camera name", () => {
  expect(buildGb28181CameraPayload({ name: "客厅", deviceId: "dev-1", channelId: "ch-1" }))
    .toMatchObject({ name: "客厅", position: null, can_view: true, capabilities: ["live"] });
});
```

- [x] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `cd apps/admin && bun test components/cameras/gb28181-onboarding-rules.test.ts`
Expected: FAIL，提示无法找到 `gb28181-onboarding-rules`。

- [x] **Step 3: 实现最小规则模块**

```ts
export function buildGb28181CameraPayload(input: Gb28181BindingInput) {
  return {
    name: input.name.trim(),
    position: null,
    vendor: "tencent_iotvideo_industry" as const,
    vendor_device_serial: input.deviceId,
    vendor_channel_id: input.channelId,
    vendor_device_code: input.deviceCode ?? null,
    vendor_channel_code: input.channelCode ?? null,
    channel_no: 1,
    can_view: true,
    can_control: false,
    capabilities: ["live"] as const,
    cover_url: null,
    sort_order: 0,
    remark: null,
    video_encrypted: false,
    play_protocol: "flv" as const,
  };
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `cd apps/admin && bun test components/cameras/gb28181-onboarding-rules.test.ts`
Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add apps/admin/components/cameras/gb28181-onboarding-rules.ts apps/admin/components/cameras/gb28181-onboarding-rules.test.ts
git commit -m "feat(cameras): 增加GB28181接入规则"
```

### Task 2: 连续接入对话框

**Files:**
- Create: `apps/admin/components/cameras/gb28181-onboarding-dialog.tsx`
- Test: `apps/admin/components/cameras/gb28181-onboarding-rules.test.ts`

- [x] **Step 1: 为分页匹配和恢复决策补充失败测试**

测试资产列表中存在同设备级记录、其他设备通道、已绑定通道和多个未绑定通道时，只返回目标设备可绑定通道。

- [x] **Step 2: 运行测试确认失败原因是缺少筛选行为**

Run: `cd apps/admin && bun test components/cameras/gb28181-onboarding-rules.test.ts`
Expected: FAIL，实际通道集合包含错误设备或已绑定资产。

- [x] **Step 3: 实现对话框状态和请求编排**

状态限定为：

```ts
type OnboardingStep = "name" | "configure" | "detecting" | "choose-channel" | "success";
```

请求顺序固定为：

```ts
await requestBackendJson(`/projects/${projectId}/cameras/tencent-devices`, {
  method: "POST",
  body: JSON.stringify({ name: cameraName.trim(), device_type: 2, password: null }),
});
await requestBackendJson("/tenant-devices/sync", { method: "POST" });
// 按 page=1&pageSize=100 分页读取，直到命中本次 device_id 或没有下一页。
await requestBackendJson(`/projects/${projectId}/cameras`, {
  method: "POST",
  body: JSON.stringify(buildGb28181CameraPayload(...)),
});
```

配置页复用 `CopyValueButton`，只展示现场必须录入的七项。成功页的“继续添加下一台”重置本次设备数据但保留 `projectId` 和项目名称。

- [x] **Step 4: 运行规则测试和 Admin 类型检查**

Run: `cd apps/admin && bun test components/cameras/gb28181-onboarding-rules.test.ts && bun run typecheck`
Expected: PASS，TypeScript 无错误。

- [x] **Step 5: 提交**

```bash
git add apps/admin/components/cameras/gb28181-onboarding-dialog.tsx apps/admin/components/cameras/gb28181-onboarding-rules.test.ts
git commit -m "feat(cameras): 实现GB28181连续接入对话框"
```

### Task 3: 接入主入口与设备管理恢复

**Files:**
- Modify: `apps/admin/app/(console)/cameras/page.tsx`
- Modify: `apps/admin/components/cameras/tenant-device-assets-panel.tsx`
- Modify: `apps/admin/components/cameras/cameras-workspace-tabs.tsx`
- Modify: `apps/admin/components/cameras/cameras-page-layout.test.ts`

- [x] **Step 1: 更新页面测试并确认失败**

增加源码约束：页面使用 `Gb28181OnboardingButton`，普通空态说明只描述“填写名称、配置设备、检测完成”，页签显示“设备管理”，普通入口不再直接渲染 `CreateTencentDeviceButton`。

- [x] **Step 2: 运行页面测试确认旧页面不满足约束**

Run: `cd apps/admin && bun test 'app/(console)/cameras/cameras-page-layout.test.ts'`
Expected: FAIL，缺少新入口或仍包含旧文案。

- [x] **Step 3: 替换普通入口**

项目分组行传入该项目 ID 和显示名称；全局空态使用当前已选项目。普通主操作统一为：

```tsx
<Gb28181OnboardingButton
  projectId={project.id}
  projectLabel={project.address || project.name || "当前项目"}
/>
```

设备管理区保留高级“新增腾讯云设备”和“同步资产”，并为未绑定的腾讯设备提供带 `initialDevice` 的“继续接入”。

- [x] **Step 4: 运行页面与规则测试**

Run: `cd apps/admin && bun test 'app/(console)/cameras/cameras-page-layout.test.ts' components/cameras/gb28181-onboarding-rules.test.ts`
Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add 'apps/admin/app/(console)/cameras/page.tsx' apps/admin/components/cameras/tenant-device-assets-panel.tsx apps/admin/components/cameras/cameras-workspace-tabs.tsx 'apps/admin/app/(console)/cameras/cameras-page-layout.test.ts'
git commit -m "feat(cameras): 启用项目内最简摄像头接入"
```

### Task 4: 简化摄像头业务表单

**Files:**
- Modify: `apps/admin/components/cameras/camera-settings-fields.tsx`
- Modify: `apps/admin/components/cameras/camera-form-dialog.tsx`
- Test: `apps/admin/components/cameras/cameras-page-layout.test.ts`

- [x] **Step 1: 写失败测试**

约束新增模式不显示“安装位置”，名称提示为“用位置命名”；编辑模式保留高级配置入口，提交时未编辑的历史 `position` 不被清空。

- [x] **Step 2: 运行测试确认失败**

Run: `cd apps/admin && bun test 'app/(console)/cameras/cameras-page-layout.test.ts'`
Expected: FAIL，旧组件仍并列展示名称和安装位置。

- [x] **Step 3: 按模式收敛字段**

为 `CameraSettingsFields` 增加 `mode`；`create` 只显示名称，其他字段使用默认值；`edit` 的高级设置用现有 `Collapsible` 展开，名称始终可见。更新提交逻辑，编辑名称时沿用 `camera.position`。

- [x] **Step 4: 运行测试与类型检查**

Run: `cd apps/admin && bun test 'app/(console)/cameras/cameras-page-layout.test.ts' components/cameras/gb28181-onboarding-rules.test.ts && bun run typecheck`
Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add apps/admin/components/cameras/camera-settings-fields.tsx apps/admin/components/cameras/camera-form-dialog.tsx 'apps/admin/app/(console)/cameras/cameras-page-layout.test.ts'
git commit -m "refactor(cameras): 收敛摄像头业务字段"
```

### Task 5: 完整验证与交付

**Files:**
- Modify: `docs/superpowers/plans/2026-09-24-simplify-gb28181-camera-onboarding.md`

- [x] **Step 1: 运行摄像头相关测试**

Run: `cd apps/admin && bun test components/cameras 'app/(console)/cameras'`
Expected: 0 failures。

- [x] **Step 2: 运行 Admin 静态检查**

Run: `cd apps/admin && bun run check`
Expected: 文件大小和 TypeScript 检查通过。

- [x] **Step 3: 运行生产构建**

Run: `cd apps/admin && bun run build`
Expected: Next.js production build 完成，`/cameras` 路由生成成功。

- [x] **Step 4: 审计改动边界**

Run: `git diff --check && git status --short && git diff main...HEAD --stat`
Expected: 无空白错误；不包含 migration、数据库、orange 仓库或小程序改动。

- [x] **Step 5: 更新计划勾选并提交**

```bash
git add docs/superpowers/plans/2026-09-24-simplify-gb28181-camera-onboarding.md
git commit -m "docs(cameras): 记录最简接入实施结果"
```


## 实施结果

- 普通入口统一为“选项目、填名称、配置、检测并自动绑定”，成功后可保留项目连续添加。
- 未完成 IPC 可从设备管理继续；NVR、多通道通过高级绑定的搜索与分页继续处理。
- SIP 密码恢复接口同时校验公司、具体项目 `project.update` 范围，并在 API 与 Admin 代理禁用缓存。
- 未新增数据库结构或 migration。
- 验证：Admin 相关 31 项测试、Admin 类型检查与生产构建、API 合约测试、API 类型检查与构建、文件规模检查、`git diff --check`。
