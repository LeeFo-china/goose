# Admin 弹窗底层页面闪烁分阶段执行文档

日期：2026-05-27

## 背景

Admin 超管侧在部分页面的弹窗、确认框和操作卡片上执行操作时，底层页面偶尔会出现短暂闪烁或轻微位移。

当前高概率原因：

- Radix `Dialog` / `AlertDialog` 打开时锁定页面滚动，滚动条消失会导致底层页面宽度变化。
- 弹窗遮罩使用 `backdrop-blur-sm`，在复杂表格、图表和渐变背景上会触发更重的浏览器合成与重绘。
- 部分弹窗操作成功后立即关闭弹窗并同帧执行 `router.refresh()`，底层 RSC 页面在关闭动画期间重新渲染，视觉上像闪一下。

## 目标

- 消除弹窗打开/关闭时底层页面的横向跳动。
- 降低遮罩渲染导致的重绘成本。
- 让弹窗关闭动画和页面刷新错开，避免同帧刷新造成闪烁。
- 不改变业务 API、不改变权限、不改变数据提交语义。

## 非目标

- 不重构所有弹窗业务组件。
- 不把所有列表页改成前端乐观更新。
- 不调整页面信息架构或视觉风格。

## 阶段 0：计划和基线确认

### 执行范围

- 落本执行文档。
- 扫描通用弹窗组件和 `router.refresh()` 调用点。
- 明确优先修复顺序。

### 验收

- 明确闪烁的主要来源和修复阶段。
- 本文档记录阶段计划。

### 执行记录

2026-05-27：

- 已确认通用弹窗组件：
  - `apps/admin/components/ui/dialog.tsx`
  - `apps/admin/components/ui/alert-dialog.tsx`
- 已确认高频触发路径：
  - 弹窗打开/关闭时 body 滚动锁定。
  - `DialogOverlay` / `AlertDialogOverlay` 使用 `backdrop-blur-sm`。
  - 多个业务弹窗成功后执行 `router.refresh()`。

## 阶段 1：布局稳定与遮罩降重

### 执行范围

- 在全局样式中启用滚动条稳定占位，避免弹窗打开时页面宽度变化。
- 移除 `Dialog` / `AlertDialog` 遮罩上的 `backdrop-blur-sm`，保留半透明遮罩和动画。

### 验收

- `bun run admin:build` 通过。
- `Dialog` / `AlertDialog` 遮罩仍存在，层级仍为 `z-50`。
- 构建产物中不再包含通用弹窗遮罩的 `backdrop-blur-sm`。
- Admin 本地服务可启动，静态 CSS 返回 200。

### 执行记录

2026-05-27：

- 已在 `apps/admin/app/globals.css` 增加 `html { scrollbar-gutter: stable; }`，稳定弹窗打开/关闭时的滚动条占位。
- 已移除以下通用遮罩的 `backdrop-blur-sm`：
  - `apps/admin/components/ui/dialog.tsx`
  - `apps/admin/components/ui/alert-dialog.tsx`
- 已保留遮罩 `z-50` 层级和 `bg-foreground/35` 半透明背景。

### 验收记录

2026-05-27：

- `bun run admin:build` 通过。
- `rg -n "scrollbar-gutter|backdrop-blur-sm|bg-foreground/35|z-50" apps/admin/app/globals.css apps/admin/components/ui/dialog.tsx apps/admin/components/ui/alert-dialog.tsx` 确认：
  - `scrollbar-gutter` 已生效。
  - `Dialog` / `AlertDialog` 遮罩仍保留 `z-50` 和 `bg-foreground/35`。
  - 通用弹窗遮罩不再包含 `backdrop-blur-sm`。
- Admin 本地服务 `http://127.0.0.1:3010` 可启动，当前 CSS 静态资源 `/_next/static/css/45a0ba87b7edf9d1.css` 返回 200。

## 阶段 2：弹窗关闭后延迟刷新

### 执行范围

- 新增 admin 前端通用刷新工具。
- 将高频超管侧弹窗操作里的 `router.refresh()` 改为“弹窗关闭后短延迟刷新”。
- 优先覆盖平台租户、平台设备、平台线索、计费中心、员工、权限、摄像头等使用弹窗/确认框的操作入口。

### 验收

- `bun run admin:build` 通过。
- 高频弹窗操作不再同帧执行关闭和 `router.refresh()`。
- 仍保留操作成功后的数据刷新。
- Admin 本地服务可启动，登录态和 `/dashboard` 正常。

### 执行记录

2026-05-27：

- 新增 `apps/admin/lib/deferred-refresh.ts`，统一提供 `refreshAfterDialogClose(router)`。
- 已将弹窗关闭后的刷新从同帧 `router.refresh()` 调整为关闭后短延迟刷新。
- 覆盖范围：
  - 平台租户：`apps/admin/components/platform-tenants/platform-tenant-mutations.tsx`
  - 平台设备：`apps/admin/components/platform-devices/platform-tencent-devices-table.tsx`
  - 平台线索：`apps/admin/components/platform-leads/platform-lead-mutations.tsx`
  - 计费中心：`apps/admin/components/billing/billing-actions.tsx`
  - 员工、权限、角色：`apps/admin/components/employees/employee-mutations.tsx`、`apps/admin/components/permissions/permission-mutations.tsx`、`apps/admin/components/roles/role-mutations.tsx`
  - 摄像头和设备资产：`apps/admin/components/cameras/camera-mutations.tsx`、`apps/admin/components/cameras/tenant-device-assets-panel.tsx`
  - 组织部门和岗位：`apps/admin/components/organization/department-mutations.tsx`、`apps/admin/components/organization/post-mutations.tsx`
  - 客户、营销、员工个性化：`apps/admin/components/customers/customer-mutations.tsx`、`apps/admin/components/marketing/marketing-mutations.tsx`、`apps/admin/components/marketing/h5-page-mutations.tsx`、`apps/admin/components/employee-personalization/employee-personalization-client.tsx`

### 验收记录

2026-05-27：

- `bun run admin:build` 通过。
- 以下扫描无命中，说明“关闭弹窗后同帧刷新”的已知模式已清除：
  - `rg -n "(set[A-Za-z]*Open\\(false\\)|onOpenChange\\(false\\)|setStatusAction\\(null\\)|setDeleteOpen\\(false\\));\\n\\s*router\\.refresh\\(\\)" apps/admin/components --glob '*.tsx' -U`
- 数据刷新语义保留：所有成功操作仍调用 `router.refresh()`，只是通过 `refreshAfterDialogClose(router)` 延后执行。

## 阶段 3：回归与收口

### 执行范围

- 检查剩余直接 `router.refresh()` 调用是否属于非弹窗场景。
- 记录暂不处理的调用点和原因。

### 验收

- `git diff --check` 通过。
- `bun run admin:build` 通过。
- `/dashboard` 和 `/platform/tenants` 可访问。
- 工作区只包含本任务相关改动。

### 执行记录

2026-05-27：

- 已复查剩余 `router.refresh()` 调用点，剩余场景主要是列表筛选/分页、登录登出、非弹窗按钮操作、编辑器内部操作、轮询或手动刷新，不属于“关闭弹窗同帧刷新”模式。
- 已重启 admin 本地服务，地址为 `http://127.0.0.1:3010`。

### 验收记录

2026-05-27：

- `git diff --check` 通过。
- `bun run admin:build` 通过。
- 登录接口 `POST /api/auth/login` 使用超管账号 `19900000001` 返回 200，并写入本地非 Secure Cookie。
- `GET /dashboard` 返回 200。
- `GET /platform/tenants` 返回 200。
- 当前 CSS 静态资源 `GET /_next/static/css/45a0ba87b7edf9d1.css` 返回 200。
- `git status --short` 待提交内容仅包含本任务相关的 admin 弹窗稳定性改动和本文档。
