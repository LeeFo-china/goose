# 兼容层分阶段清理计划

日期：2026-05-27

## 背景

本计划用于逐步清理当前仓库中仍存在的兼容层、旧入口和过期审计工具。每个阶段独立提交，阶段内完成代码调整、构建检查和必要的运行时验证；未通过验收不得进入下一阶段。

已完成前置清理：

- 已删除小程序 visitor 公开项目列表兼容路由 `GET /projects/frontend-visible`。
- 小程序 visitor 公开项目列表改用 `GET /front/projects`。

## 总原则

- 每阶段只处理一个兼容主题，避免跨域变更。
- API 入口删除前必须确认当前 Admin 或小程序端没有运行时依赖。
- 涉及数据库字段或表删除的阶段，必须先完成线上数据审计和迁移脚本验证。
- 能本地验证的阶段直接执行；需要访问日志或外部客户端确认的阶段先补观测或文档，不做盲删。

## 阶段 1：租户部门审计脚本和过期文档清理

### 目标

清理已经失效的租户部门退休审计脚本和文档口径，让后续部门兼容层清理基于当前真实数据库结构推进。

### 当前发现

- dev 链接库中 `employees.department_id` 已不存在。
- `scripts/audit-tenant-department-retirement.sh` 使用的 Supabase CLI 参数已过期。
- `scripts/audit-tenant-department-retirement.sql` 仍检查 `employees.department_id`。
- 运行时仍存在以下遗留对象：
  - `departments` 表。
  - `tenant_departments.legacy_department_id`。
  - `department_post_rules.department_code`。

### 执行范围

- 更新租户部门退休审计 SQL，只保留当前数据库仍存在的遗留对象检查。
- 修复审计脚本 Supabase CLI 参数。
- 更新相关阶段文档，明确 `employees.department_id` 已退休。

### 验收

- `scripts/audit-tenant-department-retirement.sh` 可执行并返回结构化结果。
- `bun run api:build` 通过。
- 提交独立 commit。

## 阶段 2：Admin 旧上传兼容调用清理

### 目标

移除 Admin 端对 `POST /uploads/images` 的兜底或直接调用，统一走 COS direct upload。

### 当前发现

Admin 仍存在旧上传入口：

- `apps/admin/components/employees/employee-mutations.tsx`
- `apps/admin/components/customers/customer-mutations.tsx`
- `apps/admin/components/marketing/h5-page-editor.tsx`

### 执行范围

- 员工头像上传：去除 `/api/backend/uploads/images` fallback。
- 客户头像上传：去除 `/api/backend/uploads/images` fallback。
- H5 营销页图片上传：改为 COS direct upload。
- 保留 API `POST /uploads/images`，等待小程序日志确认后再删。

### 验收

- `rg "/uploads/images" apps/admin` 无运行时代码命中。
- `bun run admin:build` 通过。
- `bun run api:build` 通过。
- 提交独立 commit。

### 执行记录

2026-05-27：

- 员工头像和客户头像已移除 `/api/backend/uploads/images` fallback。
- H5 营销页图片已改为 COS direct upload。
- API direct upload 场景已加入 `h5_marketing_page`。
- `rg "/uploads/images" apps/admin` 无运行时代码命中。
- `bun run admin:build` 通过。
- `bun run api:build` 通过。

## 阶段 3A：后端旧上传入口观察准备

### 目标

在删除 API `POST /uploads/images` 前，补齐旧入口访问观测和小程序退场口径。

### 执行范围

- 在 `POST /uploads/images` 入口输出兼容层使用日志。
- 给小程序端补充上传旧接口退场文档。

### 验收

- `bun run api:build` 通过。
- 小程序文档明确要求不再 fallback 到 `/uploads/images`。
- 提交独立 commit。

### 执行记录

2026-05-27：

- `POST /uploads/images` 已输出 `[compat] legacy uploads/images endpoint used`。
- 已新增小程序图片上传旧接口退场文档。
- `bun run api:build` 通过。

## 阶段 3B：后端旧上传入口退休

### 目标

删除 API `POST /uploads/images` 服务器中转上传入口。

### 前置条件

- Admin 已无 `/uploads/images` 调用。
- 小程序端已确认施工日志、评论、验收图片不再回退 `/uploads/images`。
- 小程序端已确认客户头像、客户抖音截图、客服工单图片、费用附件、推荐付款凭证、客户端个人头像、员工头像均使用 COS 直传。

### 执行范围

- 删除 `UploadsController.uploadImage`。
- 删除旧 multipart upload 相关 schema、服务或依赖中只为该入口存在的代码。
- 更新小程序接入文档，说明 `/uploads/images` 已退休。

### 验收

- `rg "/uploads/images" apps/api/src apps/admin` 无运行时代码命中。
- `bun run api:build` 通过。
- 提交独立 commit。

### 执行记录

2026-05-27：

- 已删除 `POST /uploads/images`。
- direct upload 白名单已补齐 `customer_follow_up_comment`、`customer_douyin_screenshot`、`referral_payment`。
- 小程序退场文档已更新为接口已删除状态。

## 阶段 4：营销页新旧路由收敛

### 目标

收敛营销页管理和公开访问路由，减少 `/marketing-pages`、`/platform/marketing-pages`、`/public/marketing-pages`、`/public/tenants/:tenantSlug/marketing-pages` 并存带来的维护成本。

### 当前发现

- Admin 普通营销页仍使用 `/marketing-pages`。
- 平台营销页使用 `/platform/marketing-pages`。
- 公开 H5 同时暴露全局 `/public/marketing-pages` 和租户作用域 `/public/tenants/:tenantSlug/marketing-pages`。

### 执行范围

- 先确认产品口径：是否继续保留租户内营销页管理。
- 若不保留，迁移 Admin 普通营销页到平台入口或移除页面入口。
- 公开访问优先保留租户作用域 URL。
- 全局公开 URL 先加观测，再按日志删除。

### 验收

- Admin 营销页核心流程可用。
- H5 分享链接仍可访问目标租户页面。
- `bun run admin:build` 和 `bun run api:build` 通过。
- 提交独立 commit。

### 2026-05-27 复核结论

暂不清理。

- `/marketing-pages` 是租户后台“营销活动”页面的当前业务接口，不是只为兼容保留的旧入口。
- `/platform/marketing-pages` 是平台超管 H5 活动页接口，与租户后台作用域不同。
- `/public/marketing-pages` 仍服务无租户 slug 的平台 H5 页面。
- `/public/tenants/:tenantSlug/marketing-pages` 服务租户 H5 页面。

本阶段没有可安全删除项。若后续产品决定取消租户内 H5 活动页管理，应另立迁移阶段，先迁移 Admin `/marketing` 页面和历史分享链接。

## 阶段 5：资料接口别名清理

### 目标

确认并清理 `/auth/me/profile` 与 `/customer/profile` 的重复语义。

### 执行范围

- 根据小程序和 H5 实际调用确认保留入口。
- 若 `/auth/me/profile` 仍作为通用身份资料接口使用，则不删除，仅更新文档边界。
- 若只剩客户资料语义，则迁移到 `/customer/profile` 后删除别名。

### 验收

- 登录态资料页、客户自助资料页可用。
- `bun run api:build` 通过。
- 提交独立 commit。

### 2026-05-27 复核结论

暂不清理。

- `/auth/me/profile` 返回通用登录用户资料和角色信息。
- `/customer/profile` 返回客户身份资料。
- 两者语义不同，不是同一接口的兼容别名。

本阶段不删除接口，仅保留边界说明。

## 阶段 6：旧命名路由清理

### 目标

处理蛇形或旧风格路由，例如：

- `/project_log_comments`
- `/customer_follow_ups/:id/comments`
- `/create_project_page`

### 执行范围

- 先补新路由和迁移文档。
- 确认 Admin、小程序、H5 不再调用旧路由。
- 删除旧路由。

### 验收

- 对应业务流程可用。
- `bun run api:build` 通过。
- 提交独立 commit。

### 2026-05-27 复核结论

暂不清理。

- `/project_log_comments` 仍是小程序项目详情文档中的当前评论接口。
- `/customer_follow_ups/:id/comments` 仍对应客户跟进评论资源。
- `/create_project_page` 是既有创建项目聚合数据入口。

这些路由命名偏旧，但仍是业务入口。清理前必须先补新路由、发小程序/Admin 迁移文档，并确认客户端完成切换。

## 阶段 7：身份迁移遗留观测清理

### 目标

清理认证身份迁移期间的 legacy diagnostics、dual-write 或一次性观测接口。

### 前置条件

- 身份模型迁移完成并有线上观察窗口。
- 解绑、登录、会员身份、员工身份均通过回归。

### 验收

- 认证主流程回归通过。
- `bun run api:build` 通过。
- 提交独立 commit。

### 2026-05-27 复核结论

暂不清理。

- `AUTH_IDENTITY_SOURCE=membership` 仍有灰度验收和一个版本周期稳定运行要求。
- `platform/identity-diagnostics` 仍用于排查旧字段与 membership 不一致。
- 用户身份 dual-write 和 diagnostics 属于认证安全闭环，不在本轮兼容层清理中删除。

后续需要单独执行身份模型退休阶段，包含生产观察窗口、回滚方案和认证主流程回归。
