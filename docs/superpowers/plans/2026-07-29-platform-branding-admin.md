# Platform Branding Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Admin 超管侧提供独立、可发布的平台默认品牌名称和 Logo 管理页面。

**Architecture:** 服务端页面负责会话、权限与初始 GET；客户端表单负责字段校验、`brand_logo` 直传、实时预览、PATCH 草稿和 POST 发布。纯函数与类型放在独立文件，页面、表单和骨架屏分别承担加载、交互和占位职责。

**Tech Stack:** Next.js App Router、React 19、TypeScript、Tailwind CSS、shadcn/ui、Bun test、现有 `/api/backend` 代理和 COS 直传工具。

---

## 文件结构

- Create `apps/admin/app/(console)/platform/branding/page.tsx`：权限检查、服务端加载与页面外壳。
- Create `apps/admin/app/(console)/platform/branding/loading.tsx`：与真实页面结构一致的骨架屏。
- Create `apps/admin/components/platform-branding/platform-branding-types.ts`：品牌 profile、effective 和接口响应类型。
- Create `apps/admin/components/platform-branding/platform-branding-form-data.ts`：初始化、校验、payload 与状态派生纯函数。
- Create `apps/admin/components/platform-branding/platform-branding-form-data.test.ts`：纯函数行为测试。
- Create `apps/admin/components/platform-branding/platform-branding-form.tsx`：上传、预览、保存和发布交互。
- Create `apps/admin/components/platform-branding/platform-branding-preview.tsx`：编辑预览和线上状态展示。
- Create `apps/admin/components/platform-branding/platform-branding-admin-contract.test.ts`：页面、上传、接口与骨架屏契约测试。
- Modify `apps/admin/components/layout/menu-config.ts`：新增“平台品牌”菜单。
- Modify `apps/admin/components/layout/admin-nav-visibility.test.ts`：新增菜单权限测试。

## Task 1: 先定义表单行为

**Files:**

- Create: `apps/admin/components/platform-branding/platform-branding-form-data.test.ts`
- Create: `apps/admin/components/platform-branding/platform-branding-types.ts`
- Create: `apps/admin/components/platform-branding/platform-branding-form-data.ts`

- [ ] **Step 1: 写失败测试**

覆盖首次配置、已有草稿、名称长度、草稿 payload、未保存修改和发布条件：

```ts
test("builds a first platform branding draft with version zero", () => {
  const values = createPlatformBrandingFormValues(null, effective);
  expect(values.displayName).toBe(effective.display_name);
  expect(values.logoFileId).toBe("");
  expect(() => buildPlatformBrandingDraft(null, values)).toThrow(
    "请上传平台品牌 Logo",
  );
});

test("builds a saved draft payload from the current version", () => {
  expect(buildPlatformBrandingDraft(profile, {
    displayName: " Gooes ",
    logoFileId: "11111111-1111-4111-8111-111111111111",
    logoUrl: "https://example.com/logo.png",
  })).toEqual({
    display_name: "Gooes",
    logo_file_id: "11111111-1111-4111-8111-111111111111",
    version: profile.version,
  });
});
```

- [ ] **Step 2: 运行 RED**

```bash
bun test apps/admin/components/platform-branding/platform-branding-form-data.test.ts
```

Expected: FAIL，因为平台品牌表单模块尚不存在。

- [ ] **Step 3: 实现最小纯函数**

实现并导出：

```ts
createPlatformBrandingFormValues(profile, effective)
buildPlatformBrandingDraft(profile, values)
hasUnsavedPlatformBrandingChanges(profile, values)
canPublishPlatformBranding(profile, values)
getPlatformBrandingStatus(profile, values)
```

名称按 Unicode code point 校验 2–40 个字符，首次保存使用 `version: 0`。

- [ ] **Step 4: 运行 GREEN**

运行 Task 1 测试，预期全部通过。

## Task 2: 建立页面和导航契约

**Files:**

- Create: `apps/admin/components/platform-branding/platform-branding-admin-contract.test.ts`
- Modify: `apps/admin/components/layout/admin-nav-visibility.test.ts`

- [ ] **Step 1: 写失败契约测试**

断言：

```ts
expect(page).toContain('buildBackendUrl("/platform/branding")');
expect(page).toContain("platform.branding.manage");
expect(form).toContain('scene: "brand_logo"');
expect(form).toContain('"/platform/branding/publish"');
expect(loading).toContain("PlatformBranding");
```

导航测试断言 `/platform/branding` 使用 `platform.branding.manage`，并与
`/platform/branding-addon` 分开。

- [ ] **Step 2: 运行 RED**

```bash
bun test \
  apps/admin/components/platform-branding/platform-branding-admin-contract.test.ts \
  apps/admin/components/layout/admin-nav-visibility.test.ts
```

Expected: 平台品牌页面和菜单断言失败。

## Task 3: 实现服务端页面、菜单和骨架屏

**Files:**

- Create: `apps/admin/app/(console)/platform/branding/page.tsx`
- Create: `apps/admin/app/(console)/platform/branding/loading.tsx`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: 新增独立菜单**

在“平台配置”中加入：

```ts
{
  href: "/platform/branding",
  label: "平台品牌",
  icon: PanelsTopLeft,
  permission: "platform.branding.manage",
}
```

- [ ] **Step 2: 实现服务端加载**

页面使用 `getAdminSession()`、`isPlatformOnlySession()` 和同一权限检查。
有权限时带 Admin token 请求 `GET /platform/branding`；失败显示
`StatusAlert`，无数据时不渲染空表单。

- [ ] **Step 3: 实现结构一致的骨架屏**

使用已安装的 `Skeleton`、`Card`、`CardHeader`、`CardContent` 和
`CardFooter` 表达页头、状态、编辑区、预览和双操作按钮。

- [ ] **Step 4: 运行导航和页面契约测试**

运行 Task 2 命令；允许表单相关断言继续失败，但页面、菜单和骨架屏断言应
通过。

## Task 4: 实现 Logo 上传、预览、保存与发布

**Files:**

- Create: `apps/admin/components/platform-branding/platform-branding-preview.tsx`
- Create: `apps/admin/components/platform-branding/platform-branding-form.tsx`

- [ ] **Step 1: 实现上传字段**

使用隐藏的原生文件输入和 shadcn `Button`：

```ts
validateUploadFile(file, {
  allowedTypes: new Set(["image/jpeg", "image/png"]),
  maxSizeBytes: 2 * 1024 * 1024,
  typeMessage: "平台品牌 Logo 仅支持 JPEG 或 PNG",
  sizeMessage: "平台品牌 Logo 不能超过 2MB",
});
const uploaded = await uploadDirectToCos(file, { scene: "brand_logo" });
```

要求 `uploaded.fileId` 存在；上传期间使用 `Spinner` 并禁用状态变更。

- [ ] **Step 2: 实现实时预览**

预览显示当前表单名称、当前本地/后端 Logo、编辑预览标签和当前线上品牌。
本地对象 URL 在替换和卸载时调用 `URL.revokeObjectURL`。

- [ ] **Step 3: 实现保存草稿**

使用：

```ts
requestBackendJson<PlatformBrandingResult>("/platform/branding", {
  method: "PATCH",
  body: JSON.stringify(buildPlatformBrandingDraft(profile, values)),
  fallbackMessage: "平台品牌草稿保存失败",
});
```

成功后同步 profile、effective、表单基线和预览 URL。

- [ ] **Step 4: 实现发布**

仅允许完整、已保存且 `has_unpublished_changes` 的 profile 发布：

```ts
requestBackendJson<PlatformBrandingResult>("/platform/branding/publish", {
  method: "POST",
  body: JSON.stringify({ version: profile.version }),
  fallbackMessage: "平台品牌发布失败",
});
```

版本冲突显示稳定提示与“重新加载”按钮；成功后更新线上预览。

- [ ] **Step 5: 运行 GREEN**

```bash
bun test \
  apps/admin/components/platform-branding/platform-branding-form-data.test.ts \
  apps/admin/components/platform-branding/platform-branding-admin-contract.test.ts \
  apps/admin/components/layout/admin-nav-visibility.test.ts
```

Expected: 全部通过。

## Task 5: 全量验证和浏览器 smoke

**Files:**

- Verify all changed Admin files.

- [ ] **Step 1: 检查 diff 和文件大小**

```bash
git diff --check
pnpm --dir apps/admin check:file-size
```

- [ ] **Step 2: Admin 类型检查**

```bash
pnpm --dir apps/admin typecheck
```

- [ ] **Step 3: Admin 生产构建**

```bash
pnpm --dir apps/admin build
```

- [ ] **Step 4: 浏览器 smoke**

使用本地 Admin 3010 和 API 3000 验证：

- 有权限账号能看到“平台品牌”菜单；
- 页面加载当前 profile/effective；
- JPEG/PNG 上传、Logo 预览、名称编辑正常；
- 保存后显示未发布状态；
- 发布后线上状态和版本更新；
- 刷新后数据保持；
- 控制台无运行时错误。

- [ ] **Step 5: 提交**

```bash
git add apps/admin docs/superpowers/plans/2026-07-29-platform-branding-admin.md
git commit -m "feat(admin): 增加平台默认品牌管理"
```
