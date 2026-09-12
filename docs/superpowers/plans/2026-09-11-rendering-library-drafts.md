# 租户效果素材私有草稿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可隔离租户、分页查询及带版本更新的私有素材草稿数据基础，随后接入 HTTP 管理接口；不依赖方舟，也不开放未经内容审核的公开发布。

**Architecture:** 独立于平台 picture_library，以 tenant_rendering_styles 保存公司素材元数据，复用 platform_file_objects 但只允许本租户专用私有场景。沿用 domain → controller → service → repository；身份从 AuthContext 提取，数据库服务角色访问，客户不直接访问表。

**Tech Stack:** Bun、TypeScript、Zod 4、Fastify、Supabase/PostgreSQL；无新增依赖。

---

本计划是已确认总体方案 B 阶段的第一小步，不宣称覆盖 B 全部。当前没有内容审核提供商；此步只支持 draft/hidden，无发布字段或批准接口。图片上传、私有预览和 Admin 页面在数据/服务边界审查通过后单独编写下一小步计划。不得把旧公共图库文件冒充私有草稿。

实施状态：数据合同和 migration 文件已实现，规格/质量审查通过；实际索引唯一键命名为 `tenant_rendering_styles_active_file_key`。domain 与 Admin 静态检查通过。SQL 仅静态检查，未执行、未部署；工作区尚未提交。后续 API 执行计划见 `2026-09-11-rendering-library-api.md`。

## Task 1：草稿合同、表和权限

**Files:**
- Create: `packages/domain/src/rendering-library.ts`、`rendering-library.test.ts`
- Modify: `packages/domain/src/index.ts`、`shared.ts`、`permission.ts`、`permission.test.ts`
- Fill CLI-created migration: `supabase/migrations/20260911054819_create_tenant_rendering_library.sql`
- Create: `supabase/tests/tenant_rendering_library.sql`

- [x] 写合同失败测试并运行 `cd packages/domain && bun test src/rendering-library.test.ts`。

```ts
import { expect, test } from 'bun:test';
import { RenderingLibraryListSchema, RenderingLibraryUpdateSchema } from './rendering-library';
test('分页与版本写入边界', () => {
  expect(RenderingLibraryListSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  expect(RenderingLibraryListSchema.safeParse({ pageSize: 101 }).success).toBe(false);
  expect(RenderingLibraryUpdateSchema.safeParse({ expected_version: 1, title: '新标题' }).success).toBe(true);
  expect(RenderingLibraryUpdateSchema.parse({ expected_version: 1, title: '新标题' })).toEqual({ expected_version: 1, title: '新标题' });
  for (const extra of [{ tenant_id: 'override' }, { status: 'published' }, { file_id: 'override' }, { approved: true }]) {
    expect(RenderingLibraryUpdateSchema.safeParse({ expected_version: 1, title: '新标题', ...extra }).success).toBe(false);
  }
  expect(RenderingLibraryUpdateSchema.safeParse({ expected_version: 1 }).success).toBe(false);
});
```

- [x] 实现共享合同，复用已存在素材输入，不重复字典。仅可修改元数据，文件替换不属于这一接口。

```ts
import { z } from 'zod';
import { RenderingListQuerySchema, RenderingStyleInputSchema } from './customer-rendering';

export const RENDERING_LIBRARY_SOURCE_SCENE = 'rendering_style_source';
export const RENDERING_LIBRARY_STATUS_VALUES = ['draft', 'hidden'] as const;
export const RenderingLibraryListSchema = RenderingListQuerySchema.extend({
  status: z.enum(RENDERING_LIBRARY_STATUS_VALUES).optional(),
});
export const RenderingLibraryCreateSchema = RenderingStyleInputSchema;
const fields = RenderingStyleInputSchema.shape;
export const RenderingLibraryUpdateSchema = z.strictObject({
    title: fields.title.optional(), space: fields.space.optional(), style: fields.style.optional(),
    color_notes: fields.color_notes.removeDefault().optional(),
    material_notes: fields.material_notes.removeDefault().optional(),
    source_type: fields.source_type.optional(),
    sort_order: fields.sort_order.removeDefault().optional(),
    expected_version: z.number().int().min(1).max(2147483646),
  }).refine((value) => Object.keys(value).some((key) => key !== 'expected_version'), {
    message: '请至少修改一个素材字段',
  });
export const RenderingLibraryVersionSchema = z.strictObject({
  expected_version: z.number().int().min(1).max(2147483646),
});
export const RenderingLibraryStyleSchema = RenderingStyleInputSchema.extend({
  id: z.uuid(), tenant_id: z.uuid(),
  status: z.enum(RENDERING_LIBRARY_STATUS_VALUES),
  version: z.number().int().min(1).max(2147483647),
  created_by_employee_id: z.uuid().nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type RenderingLibraryList = z.infer<typeof RenderingLibraryListSchema>;
export type RenderingLibraryCreate = z.infer<typeof RenderingLibraryCreateSchema>;
export type RenderingLibraryUpdate = z.infer<typeof RenderingLibraryUpdateSchema>;
export type RenderingLibraryVersion = z.infer<typeof RenderingLibraryVersionSchema>;
export type RenderingLibraryStyle = z.infer<typeof RenderingLibraryStyleSchema>;
```

两个导出入口追加 `export * from './rendering-library';`。permission 数组及 PermissionCodeConfig 追加 `rendering_library.read`（查看装修效果素材，module/resource=rendering_library，action=read）、`rendering_library.manage`（管理装修效果素材，action=manage）。测试须确认两个码及配置存在，不能用旧平台图库权限替代。

- [x] migration 使用以下 SQL；保留已有 CLI 文件名，不改旧 migration。新增索引会扫描文件表，发布时先评估表大小和锁等待；无法在 5 秒内取得锁就失败退出。

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE UNIQUE INDEX rendering_file_tenant_id_key
  ON public.platform_file_objects(tenant_id, id);
CREATE TABLE public.tenant_rendering_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 80),
  space text NOT NULL CHECK (space IN ('living_room', 'bedroom')),
  style text NOT NULL CHECK (style IN ('modern_simple','cream','new_chinese','nordic','light_luxury','natural_wood','american','french','wabi_sabi')),
  color_notes text NOT NULL DEFAULT '' CHECK (length(color_notes) <= 300),
  material_notes text NOT NULL DEFAULT '' CHECK (length(material_notes) <= 300),
  source_type text NOT NULL CHECK (source_type IN ('real_case','design','ai_concept')),
  rights_confirmed boolean NOT NULL CHECK (rights_confirmed),
  file_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','hidden')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,file_id) REFERENCES public.platform_file_objects(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX tenant_rendering_styles_list_idx
  ON public.tenant_rendering_styles(tenant_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX tenant_rendering_styles_filter_idx
  ON public.tenant_rendering_styles(tenant_id,status,space,style,sort_order,id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX tenant_rendering_styles_source_idx
  ON public.tenant_rendering_styles(tenant_id,file_id) WHERE deleted_at IS NULL;
CREATE TRIGGER tr_tenant_rendering_styles_updated_at
  BEFORE UPDATE ON public.tenant_rendering_styles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.tenant_rendering_styles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_rendering_styles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_rendering_styles TO service_role;
INSERT INTO public.permissions(code,name,module,resource,action,description,status) VALUES
 ('rendering_library.read','查看装修效果素材','rendering_library','rendering_library','read','查看本公司效果素材，不授予客户私有方案或咨询权限','active'),
 ('rendering_library.manage','管理装修效果素材','rendering_library','rendering_library','manage','管理本公司私有效果素材，不授予客户私有方案或咨询权限','active')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id,access_scope)
SELECT r.id,p.id,'all' FROM public.roles r JOIN public.permissions p
 ON p.code IN ('rendering_library.read','rendering_library.manage')
WHERE r.code='system_admin' AND r.tenant_id IS NOT NULL AND r.status='active' AND p.status='active'
ON CONFLICT(role_id,permission_id) DO NOTHING;
COMMENT ON TABLE public.tenant_rendering_styles IS '租户私有装修效果素材草稿；尚未开放内容审核及公开发布';
COMMIT;
```

- [x] 创建事务式 SQL 验证脚本，验证 RLS、ACL、tenant/file 复合外键、active file 唯一与两个索引存在。脚本使用 `BEGIN READ ONLY; DO $$ ... RAISE EXCEPTION ... $$; ROLLBACK;`，不得读取实际文件内容、Key 或手机号。
- [ ] 在隔离数据库实际应用 migration 并运行 SQL 验证；当前无本地数据库运行时，不以静态匹配替代数据库证据。
- [x] `cd packages/domain && bun test src/rendering-library.test.ts src/permission.test.ts && bunx tsc --noEmit`；全部通过。
- [x] 规格审查后代码质量审查。角色默认授权 SQL 已核对；只读 catalog 脚本不强制覆盖已有自定义角色授权。
- [ ] 该阶段变更独立提交，禁止包含其他工作区的改动；未获部署授权不应用远端。

回退：先关闭新管理入口；保留素材、文件及授权事实，以后续 forward migration 修正。不得删除客户/公司图片或将私有文件改公开。

## 下一执行单元边界

数据合同确定后，下一计划将为 `repositories/tenant-rendering-library.ts`、`services/tenant-rendering-library/`、`controllers/tenant-rendering-library/index.ts` 写明完整实现及 HTTP 测试。所有查询 tenant+必要字段+range，更新 tenant+id+expected_version，source 固定私有前缀/场景/归属；未知或外租户资源返回 404，版本不一致 409。管理权限必须同时具备 read/manage 且均为 all，不把 self/department 自动扩为全租户。
