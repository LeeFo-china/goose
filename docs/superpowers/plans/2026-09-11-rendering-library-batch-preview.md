# 装修效果素材批量预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 为已批准的 Admin 图片列表提供有界、租户隔离的批量短时预览，避免逐卡数据库和配置查询。

**Architecture:** 增加 POST `/tenant/rendering-library/files/previews`，body 仅含 `file_ids`。Service 先验证 read=all 与租户员工上下文，再一次批量读取源文件，复用现有资格检查；gateway 一次加载配置、一个 COS 实例本地签名。任何文件缺失或无资格时整批失败，不返回部分签名或泄漏跨租户存在性。独立于上传和单图预览，不新增发布能力。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase、现有 COS SDK。

## Task 1: 有界批量预览

**Files:** 修改 `packages/domain/src/rendering-library.ts` 及其测试；`apps/api/src/schema/tenant-rendering-library.ts`；`apps/api/src/controllers/tenant-rendering-library/files.ts` 及测试；`apps/api/src/services/rendering-library-files/service.ts` 及测试夹具；`apps/api/src/repositories/tenant-rendering-library.ts` 及测试；`apps/api/src/gateways/rendering-library-storage/client.ts` 及测试。必要时新增就近 `batch-preview.test.ts` 以保持文件聚焦。

- [x] 写失败测试并运行：0、101 个 ID、重复 ID、非 UUID、额外字段拒绝；无权限或非 all 范围零 DB/COS 调用；20 个有效文件恰好一次文件查询、一次配置读取与一次 COS 实例创建；结果顺序匹配请求；缺失、跨租户、公开或错误场景文件整批失败且签名前拒绝；数据库/配置/签名错误固定包装；HTTP 先认证、严格 query/body、no-store，旧路由不变。
- [x] 共享合同采用下列定义，导出由既有 rendering-library 通配导出承接：

```ts
export const RENDERING_LIBRARY_PREVIEW_BATCH_MAX = 100;
export const RenderingLibraryBatchPreviewSchema = z.strictObject({
  file_ids: z.array(z.uuid('无效的素材文件 ID')).min(1).max(RENDERING_LIBRARY_PREVIEW_BATCH_MAX)
    .refine((ids) => new Set(ids).size === ids.length, '素材文件 ID 不能重复'),
});
export const RenderingLibraryBatchPreviewResultSchema = z.strictObject({
  items: z.array(RenderingLibraryFilePreviewResultSchema).min(1).max(RENDERING_LIBRARY_PREVIEW_BATCH_MAX),
});
export type RenderingLibraryBatchPreview = z.infer<typeof RenderingLibraryBatchPreviewSchema>;
export type RenderingLibraryBatchPreviewResult = z.infer<typeof RenderingLibraryBatchPreviewResultSchema>;
```

- [x] Repository 增加 `findSourceFiles(tenantId, fileIds)`：严格有界输入、明确 SOURCE_FIELDS、`.eq('tenant_id', tenantId).in('id', fileIds).is('deleted_at', null).limit(fileIds.length)`；检查返回数量、唯一 ID、请求成员和归属，复用 parseSource；空集合只作为内部短路，不发查询。这是针对已知 ID 的有界批量查找，不是枚举列表；注释说明不会全量扫描/内存分页。
- [x] Gateway 增加 `previews(tenantId, files)`，输入元素 `{ id, location }`；先验证所有 ID、规范路径、桶/地域，再一次本地签名。复用单图签名内部实现，单图原行为不变。禁止逐元素调用会重新加载配置的 public preview 方法。检查批次大小/重复与签名 URL，错误沿用现有固定码。禁止 CDN/public fallback。
- [x] Service 增加 `previews(auth, input)`：先 authorize，然后 schema.safeParse→Errors.fromZod，一次 findSourceFiles，以 Map 按请求顺序对每项 assertRenderingSourceFile；全部验证后调用 storage.previews。签名前记录统一保守 expires_at，按已安装 SDK 的秒边界使用 `floor(now/1000)-1+120`，返回仅 file_id/url/expires_at。更新依赖类型和真实测试夹具，不加生产测试专用接口。
- [x] Controller 增加 `@Post('/tenant/rendering-library/files/previews')`：getRequiredTenantContext、private no-store、严格空 query、shared body schema、service.previews、ResponseHandler.success；更新 ServicePort 与精确路由断言，不注册继承 CRUD。
- [x] GREEN：运行 domain 合同测试、API 文件/草稿/存储相关测试、API 与 domain 类型检查、`git diff --check` 和 API 行数检查。运行命令使用离线 SUPABASE_URL=http://127.0.0.1:54321、test-publish-key、test-service-role-key，不读真实密钥。
- [x] 先规格审查，再质量审查，修复后复验。无远端数据库/COS 调用、无 migration、无安装新依赖。
- [x] 验证后提交 `feat(rendering): 增加素材批量私有预览`。

## 后续 UI 交付边界

继续执行已批准设计 3.1 的 Admin 草稿阶段：图片网格、空间/风格/状态筛选、默认 20 条分页、一次最多 20 张上传、公共标签与单张编辑、逐项错误恢复、版本冲突处理。只展示草稿/隐藏，明确未开放客户发布；用户客户照片不进入此页。上传与预览 URL 不进入 localStorage，不使用 Next 图片优化代理缓存私有源图。
