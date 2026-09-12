# AI Model Routing Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让超管在两个清晰的 Tab 中维护供应商及其模型、创建系统或自定义场景路由，并在无远端目录时手动登记多模态模型，全程不填写内部编码。

**Architecture:** 保留现有 `ai_providers`、`ai_models`、`ai_scene_routes` 和 `ai_system_scenes`，通过增量 migration 扩展自定义场景、编码不可变和原子创建 RPC。API 继续采用 controller/service/repository/gateway 分层；Admin 将供应商和模型收敛为主从工作区，并让路由编辑器区分已登记模型、OpenRouter 目录和显式手动输入。

**Tech Stack:** Bun、TypeScript、Fastify decorators、Zod 4、Supabase/PostgreSQL、Next.js 15、React 19、shadcn/Radix、Tailwind CSS、Bun tests、Playwright。

---

## File map

### Database

- Create: `supabase/migrations/20260912100000_rework_ai_model_routing_admin.sql`
  - 扩展场景注册表、编码保护、模型业务唯一键和自定义场景事务 RPC。
- Create: `supabase/tests/ai_model_routing_admin_redesign_migration.sql`
  - 在隔离 PostgreSQL fixture 中验证触发器、RPC、引用保护和回滚。

### API

- Create: `apps/api/src/services/ai-config/resource-codes.ts`
  - 生成 `prv_`、`mdl_`、`scene_` 稳定编码。
- Create: `apps/api/src/services/ai-config/resource-codes.test.ts`
  - 验证格式、确定性注入和非法 UUID 拒绝。
- Create: `apps/api/src/services/ai-config/admin-redesign-migration-contract.test.ts`
  - 对 migration 的关键约束做静态合同验证。
- Create: `apps/api/src/services/ai-config/endpoint-normalizer.ts`
  - 规范化 Base URL，并兼容标准历史推理路径。
- Create: `apps/api/src/services/ai-config/endpoint-normalizer.test.ts`
  - 验证 HTTPS、标准路径剥离和未知路径失败关闭。
- Modify: `apps/api/src/schema/ai-config.ts`
  - 移除可写编码、增加 provider 模型过滤、自定义场景 CRUD 和路由创建联合类型。
- Modify: `apps/api/src/schema/ai-config.test.ts`
- Modify: `apps/api/src/schema/ai-config-scene-routes.test.ts`
- Modify: `apps/api/src/repositories/ai-config.ts`
  - 增加 provider-scoped 模型分页、系统编码写入和原子 RPC 调用。
- Modify: `apps/api/src/repositories/ai-system-scenes.ts`
  - 扩展为统一场景注册表 repository，并增加自定义场景维护。
- Modify: `apps/api/src/repositories/ai-config.test.ts`
- Modify: `apps/api/src/services/ai-config/index.ts`
  - 编排编码、模型复用、场景 CRUD、审计和 endpoint 规范化。
- Modify: `apps/api/src/services/ai-config/scene-route-policy.ts`
  - 允许待接入场景预配置模型，保持身份和模态保护。
- Modify: `apps/api/src/services/ai-config/index.test.ts`
- Modify: `apps/api/src/services/ai-config/scene-routes.test.ts`
- Modify: `apps/api/src/controllers/ai-config/index.ts`
- Modify: `apps/api/src/controllers/ai-config/index.test.ts`
- Modify: `apps/api/src/services/ai-gateway.ts`
  - 运行时按 Base URL 和模态拼接标准推理路径。
- Modify: `apps/api/src/services/ai-gateway.test.ts`

### Admin

- Create: `apps/admin/components/platform-ai/ai-provider-workspace.tsx`
  - 供应商左侧列表和右侧连接、模型详情容器。
- Create: `apps/admin/components/platform-ai/ai-provider-editor.tsx`
  - 连接表单、密钥状态与删除动作。
- Create: `apps/admin/components/platform-ai/ai-provider-models.tsx`
  - 当前供应商模型表、筛选和新增/编辑 Dialog。
- Create: `apps/admin/components/platform-ai/use-ai-provider-models.ts`
  - provider-scoped 模型分页、保存和迟到请求保护。
- Create: `apps/admin/components/platform-ai/ai-manual-model-fields.tsx`
  - 路由选择器共享的手动模型输入区域。
- Create: `apps/admin/components/platform-ai/ai-scene-selector.tsx`
  - 支持关键词与分页加载的系统/自定义场景选择器。
- Modify: `apps/admin/components/platform-ai/ai-config-types.ts`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-shared.ts`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-panel.tsx`
- Modify: `apps/admin/components/platform-ai/ai-provider-secret-editor.tsx`
- Modify: `apps/admin/components/platform-ai/ai-route-model-selector.tsx`
- Modify: `apps/admin/components/platform-ai/ai-model-route-tab.tsx`
- Modify: `apps/admin/components/platform-ai/use-ai-route-editor.ts`
- Modify: `apps/admin/components/platform-ai/use-ai-route-model-options.ts`
- Modify: `apps/admin/components/platform-ai/ai-route-editor-shared.ts`
- Modify: `apps/admin/app/(console)/platform/ai-models/page.tsx`
- Modify: `apps/admin/components/platform-ai/ai-provider-form.test.tsx`
- Create: `apps/admin/components/platform-ai/use-ai-provider-models.test.ts`
- Modify: `apps/admin/components/platform-ai/ai-model-route-tab.test.tsx`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-layout.test.ts`
- Modify: `apps/admin/e2e/ai-provider-secrets-mock-backend.mjs`
- Modify: `apps/admin/e2e/ai-provider-secrets.spec.ts`
- Modify: `apps/admin/e2e/ai-model-routes.spec.ts`
- Modify: `apps/admin/e2e/ai-model-inspection.spec.ts`

### Evidence

- Create: `docs/operations/evidence/2026-09-12-ai-model-routing-admin-redesign.md`
  - 记录根因、测试、migration、开发发布和 smoke 证据，不包含密钥。

## Task 1: Add migration contract and database behavior

**Files:**

- Create: `apps/api/src/services/ai-config/admin-redesign-migration-contract.test.ts`
- Create: `supabase/migrations/20260912100000_rework_ai_model_routing_admin.sql`
- Create: `supabase/tests/ai_model_routing_admin_redesign_migration.sql`

- [ ] **Step 1: Write the failing migration contract test**

Create a Bun test that reads the exact migration and asserts the non-negotiable boundaries:

```ts
import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../../../../../supabase/migrations/20260912100000_rework_ai_model_routing_admin.sql',
  import.meta.url,
);

describe('AI model routing admin redesign migration', () => {
  test('adds custom scenes, immutable codes, a model business key and atomic RPC', async () => {
    const sql = (await readFile(migrationUrl, 'utf8')).toLowerCase();
    expect(sql).toContain("source = any (array['system'::text, 'custom'::text, 'legacy'::text])");
    expect(sql).toContain("requirements_source = any (array['runtime'::text, 'planned_adapter'::text, 'admin'::text])");
    expect(sql).toContain('unique (provider_id, model_name, modality)');
    expect(sql).toContain('ai_config_code_immutable');
    expect(sql).toContain('create_ai_custom_scene_route');
    expect(sql).toContain('delete_ai_custom_scene');
    expect(sql).toContain("v_model_code := 'mdl_' || replace(gen_random_uuid()::text, '-', '')");
    expect(sql).not.toContain('code = v_entry.model_code');
    expect(sql).toContain('revoke all on function');
    expect(sql).toContain('grant execute on function');
  });
});
```

- [ ] **Step 2: Run the contract test and confirm RED**

Run from `apps/api`:

```bash
bun test src/services/ai-config/admin-redesign-migration-contract.test.ts
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Write the additive migration**

The migration must start with bounded transaction controls and must not rewrite existing codes or Endpoint values:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.ai_system_scenes
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp();

ALTER TABLE public.ai_system_scenes
  DROP CONSTRAINT ai_system_scenes_source_check,
  DROP CONSTRAINT ai_system_scenes_requirements_source_check,
  DROP CONSTRAINT ai_system_scenes_configuration_source_check;

ALTER TABLE public.ai_system_scenes
  ADD CONSTRAINT ai_system_scenes_source_check CHECK (
    source = ANY (ARRAY['system'::text, 'custom'::text, 'legacy'::text])
  ),
  ADD CONSTRAINT ai_system_scenes_requirements_source_check CHECK (
    requirements_source = ANY (
      ARRAY['runtime'::text, 'planned_adapter'::text, 'admin'::text]
    )
  ),
  ADD CONSTRAINT ai_system_scenes_configuration_source_check CHECK (
    (source IN ('system', 'custom') AND allow_new_configuration)
    OR (source = 'legacy' AND NOT allow_new_configuration)
  ),
  ADD CONSTRAINT ai_system_scenes_status_check CHECK (
    status = ANY (ARRAY['active'::text, 'inactive'::text])
  ),
  ADD CONSTRAINT ai_system_scenes_version_check CHECK (version > 0);

DO $block$
DECLARE duplicate_key text;
BEGIN
  SELECT provider_id::text || ':' || model_name || ':' || modality
  INTO duplicate_key
  FROM public.ai_models
  GROUP BY provider_id, model_name, modality
  HAVING count(*) > 1
  ORDER BY provider_id, model_name, modality
  LIMIT 1;
  IF duplicate_key IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'ai_model_business_key_conflict',
      DETAIL = duplicate_key;
  END IF;
END;
$block$;

ALTER TABLE public.ai_models
  ADD CONSTRAINT ai_models_provider_call_name_modality_key
  UNIQUE (provider_id, model_name, modality);
```

Replace the old registry immutability trigger with a guard that rejects all system/legacy updates and permits only `name` and `status` changes for custom rows. Add `BEFORE UPDATE` code guards to `ai_providers` and `ai_models`; each must raise `ai_config_code_immutable` when `NEW.code IS DISTINCT FROM OLD.code`. The custom-scene guard itself increments `version` and writes `updated_at`, so no second version trigger is attached.

Create `public.create_ai_custom_scene_route(...) RETURNS jsonb` as `SECURITY DEFINER SET search_path = pg_catalog, public`. It must validate `scene_` code format, insert the custom scene with the fixed defaults from the design, insert the first route, and return `jsonb_build_object('scene', to_jsonb(scene_row), 'route', to_jsonb(route_row))`. Revoke all public/authenticated access and grant execute only to `service_role`.

Create `public.delete_ai_custom_scene(p_scene_code text, p_expected_version integer) RETURNS text`. Inside the function, lock `ai_scene_routes` and `ai_call_logs` in `SHARE` mode, reject non-custom rows, reject version mismatch, reject any route or call-log reference, delete the row and return its code. Apply the same revoke/grant boundary.

Update `ai_scene_route_identity_guard()` so `runtime_status='not_connected'` no longer rejects model bindings; retain unknown-scene, legacy-new-route and identity mutation checks.

Re-declare the latest `public.apply_openrouter_model_catalog(uuid, jsonb, text)` function from `20260904110000_extend_openrouter_catalog_classification.sql`, preserving its validation, locking, pricing and error mapping. Make only these identity changes:

```sql
-- Add beside the existing local variables.
v_model_code text;

-- Remove both conflict_model blocks that compare ai_models.code with
-- ai_model_catalog_entries.model_code. The external catalog code is no longer
-- the internal model identity.

IF v_entry.current_model_id IS NULL THEN
  v_model_code := 'mdl_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.ai_models (
    provider_id, code, name, model_name, status, sort_order, modality,
    input_modalities, capability_payload, probe_status, catalog_managed
  ) VALUES (
    v_provider.id, v_model_code, v_entry.model_name, v_entry.external_model_id,
    'active', v_entry.entry_position, v_entry.modality,
    v_entry.input_modalities, v_entry.capability_payload, 'stale', true
  ) RETURNING id INTO v_model_id;
ELSE
  UPDATE public.ai_models
  SET provider_id = v_provider.id,
      name = v_entry.model_name,
      model_name = v_entry.external_model_id,
      status = 'active',
      sort_order = v_entry.entry_position,
      modality = v_entry.modality,
      input_modalities = v_entry.input_modalities,
      capability_payload = v_entry.capability_payload,
      probe_status = 'stale',
      catalog_managed = true
  WHERE id = v_entry.current_model_id
    AND provider_id = v_provider.id
    AND version = v_entry.current_model_version
  RETURNING id INTO v_model_id;
END IF;
```

Do not change `ai_model_catalog_entries.model_code`; it remains the catalog projection used for preview display and hashing, not the internal `ai_models.code`.

Use the following trigger and RPC shapes so the implementation has one database authority rather than UI-only protection:

```sql
DROP TRIGGER tr_ai_system_scene_registry_immutable ON public.ai_system_scenes;
DROP FUNCTION public.ai_system_scene_registry_immutable();

CREATE FUNCTION public.ai_system_scene_registry_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD.source <> 'custom' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_system_scene_registry_immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.code IS DISTINCT FROM OLD.code
    OR NEW.modality IS DISTINCT FROM OLD.modality
    OR NEW.required_input_modalities IS DISTINCT FROM OLD.required_input_modalities
    OR NEW.runtime_status IS DISTINCT FROM OLD.runtime_status
    OR NEW.requirements_source IS DISTINCT FROM OLD.requirements_source
    OR NEW.requires_streaming IS DISTINCT FROM OLD.requires_streaming
    OR NEW.min_reference_images IS DISTINCT FROM OLD.min_reference_images
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.allow_new_configuration IS DISTINCT FROM OLD.allow_new_configuration
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_scene_identity_immutable';
  END IF;
  NEW.version := OLD.version + 1;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER tr_ai_system_scene_registry_guard
BEFORE UPDATE OR DELETE ON public.ai_system_scenes
FOR EACH ROW EXECUTE FUNCTION public.ai_system_scene_registry_guard();

CREATE FUNCTION public.ai_config_code_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_config_code_immutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER tr_ai_providers_code_immutable
BEFORE UPDATE ON public.ai_providers
FOR EACH ROW EXECUTE FUNCTION public.ai_config_code_immutable();

CREATE TRIGGER tr_ai_models_code_immutable
BEFORE UPDATE ON public.ai_models
FOR EACH ROW EXECUTE FUNCTION public.ai_config_code_immutable();

CREATE OR REPLACE FUNCTION public.ai_scene_route_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE scene public.ai_system_scenes%ROWTYPE;
BEGIN
  SELECT * INTO scene FROM public.ai_system_scenes WHERE code = NEW.scene_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'ai_scene_not_registered';
  END IF;
  IF TG_OP = 'INSERT' AND NOT scene.allow_new_configuration THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_scene_route_new_configuration_forbidden';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.scene_code IS DISTINCT FROM OLD.scene_code
    OR NEW.modality IS DISTINCT FROM OLD.modality
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_scene_route_identity_immutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.create_ai_custom_scene_route(
  p_scene_code text,
  p_scene_name text,
  p_modality text,
  p_quality_tier text,
  p_primary_model_id uuid,
  p_fallback_model_id uuid,
  p_temperature numeric,
  p_response_format text,
  p_timeout_ms integer,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scene_row public.ai_system_scenes%ROWTYPE;
  route_row public.ai_scene_routes%ROWTYPE;
BEGIN
  IF p_scene_code !~ '^scene_[0-9a-f]{32}$' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_custom_scene_code_invalid';
  END IF;
  INSERT INTO public.ai_system_scenes (
    code, name, modality, required_input_modalities, runtime_status,
    requirements_source, requires_streaming, min_reference_images,
    source, allow_new_configuration, status
  ) VALUES (
    p_scene_code, btrim(p_scene_name), p_modality, ARRAY[p_modality],
    'not_connected', 'admin', false, 0, 'custom', true, 'active'
  ) RETURNING * INTO scene_row;

  INSERT INTO public.ai_scene_routes (
    scene_code, name, primary_model_id, fallback_model_id, quality_tier,
    modality, temperature, response_format, timeout_ms, status
  ) VALUES (
    p_scene_code, scene_row.name, p_primary_model_id, p_fallback_model_id,
    p_quality_tier, p_modality, p_temperature, p_response_format,
    p_timeout_ms, p_status
  ) RETURNING * INTO route_row;

  RETURN jsonb_build_object('scene', to_jsonb(scene_row), 'route', to_jsonb(route_row));
END;
$function$;

CREATE FUNCTION public.delete_ai_custom_scene(
  p_scene_code text,
  p_expected_version integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE scene_row public.ai_system_scenes%ROWTYPE;
BEGIN
  LOCK TABLE public.ai_scene_routes IN SHARE MODE;
  LOCK TABLE public.ai_call_logs IN SHARE MODE;
  SELECT * INTO scene_row
  FROM public.ai_system_scenes
  WHERE code = p_scene_code
  FOR UPDATE;
  IF NOT FOUND OR scene_row.source <> 'custom' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ai_custom_scene_not_found';
  END IF;
  IF scene_row.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'ai_config_version_stale';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_scene_routes WHERE scene_code = p_scene_code)
    OR EXISTS (SELECT 1 FROM public.ai_call_logs WHERE scene_code = p_scene_code) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'ai_custom_scene_in_use';
  END IF;
  DELETE FROM public.ai_system_scenes WHERE code = p_scene_code;
  RETURN p_scene_code;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_ai_custom_scene_route(
  text, text, text, text, uuid, uuid, numeric, text, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_custom_scene_route(
  text, text, text, text, uuid, uuid, numeric, text, integer, text
) TO service_role;
REVOKE ALL ON FUNCTION public.delete_ai_custom_scene(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ai_custom_scene(text, integer)
  TO service_role;
```

End with comments describing rollback as application rollback plus retained additive schema, then `COMMIT;`.

- [ ] **Step 4: Add the isolated PostgreSQL fixture**

Create a fixture that applies the prerequisite AI migrations followed by the new migration, then asserts:

```sql
DO $block$
DECLARE result jsonb;
BEGIN
  result := public.create_ai_custom_scene_route(
    'scene_11111111111141118111111111111111',
    '自定义文案',
    'text',
    'balanced',
    NULL,
    NULL,
    0.7,
    'text',
    60000,
    'active'
  );
  IF result #>> '{scene,source}' <> 'custom' THEN
    RAISE EXCEPTION 'custom scene source mismatch';
  END IF;
  IF result #>> '{route,scene_code}' <> 'scene_11111111111141118111111111111111' THEN
    RAISE EXCEPTION 'route scene mismatch';
  END IF;
END;
$block$;
```

The fixture must also attempt and catch expected SQLSTATE failures for code mutation, system scene mutation, duplicate model business key and referenced custom-scene deletion. Finish by verifying that a `not_connected` registered scene accepts a valid preconfigured model binding and that a catalog-created model receives an `mdl_` code that remains unchanged on the next catalog apply.

- [ ] **Step 5: Run migration tests and confirm GREEN**

Run:

```bash
cd apps/api
bun test src/services/ai-config/admin-redesign-migration-contract.test.ts \
  src/services/ai-system-scene-registry-migration.test.ts
```

Expected: all selected Bun tests pass. If local PostgreSQL is available, apply `supabase/tests/ai_model_routing_admin_redesign_migration.sql` to a disposable fixture database and require exit code 0. Never point this fixture at development or production.

- [ ] **Step 6: Commit the database contract**

```bash
git add \
  supabase/migrations/20260912100000_rework_ai_model_routing_admin.sql \
  supabase/tests/ai_model_routing_admin_redesign_migration.sql \
  apps/api/src/services/ai-config/admin-redesign-migration-contract.test.ts
git commit -m "feat(ai): 扩展可维护场景注册表"
```

## Task 2: Make resource codes server-owned and normalize Endpoint input

**Files:**

- Create: `apps/api/src/services/ai-config/resource-codes.ts`
- Create: `apps/api/src/services/ai-config/resource-codes.test.ts`
- Create: `apps/api/src/services/ai-config/endpoint-normalizer.ts`
- Create: `apps/api/src/services/ai-config/endpoint-normalizer.test.ts`
- Modify: `apps/api/src/schema/ai-config.ts`
- Modify: `apps/api/src/schema/ai-config.test.ts`

- [ ] **Step 1: Write failing code-generation and Endpoint tests**

Use an injected UUID factory so tests remain deterministic:

```ts
import { describe, expect, test } from 'bun:test';
import { createAiResourceCode } from './resource-codes';
import { normalizeAiProviderBaseUrl } from './endpoint-normalizer';

const uuid = () => '11111111-1111-4111-8111-111111111111';

describe('AI config identities', () => {
  test('creates opaque prefixed codes', () => {
    expect(createAiResourceCode('prv', uuid)).toBe('prv_11111111111141118111111111111111');
    expect(createAiResourceCode('mdl', uuid)).toBe('mdl_11111111111141118111111111111111');
    expect(createAiResourceCode('scene', uuid)).toBe('scene_11111111111141118111111111111111');
  });

  test('normalizes HTTPS Base URLs and strips only standard inference paths', () => {
    expect(normalizeAiProviderBaseUrl('https://ark.cn-beijing.volces.com/api/v3/'))
      .toBe('https://ark.cn-beijing.volces.com/api/v3');
    expect(normalizeAiProviderBaseUrl('https://api.example.com/v1/chat/completions'))
      .toBe('https://api.example.com/v1');
    expect(() => normalizeAiProviderBaseUrl('http://127.0.0.1:9000/v1'))
      .toThrowError('AI_PROVIDER_ENDPOINT_HTTPS_REQUIRED');
    expect(() => normalizeAiProviderBaseUrl('https://api.example.com/private/infer'))
      .toThrowError('AI_PROVIDER_ENDPOINT_PATH_UNSUPPORTED');
  });
});
```

Add schema assertions that provider/model create and update reject `code`, that model list accepts `providerId`, and that manual resolution accepts `image`.

- [ ] **Step 2: Run tests and confirm RED**

```bash
cd apps/api
bun test src/services/ai-config/resource-codes.test.ts \
  src/services/ai-config/endpoint-normalizer.test.ts \
  src/schema/ai-config.test.ts
```

Expected: new imports and schema expectations fail.

- [ ] **Step 3: Implement focused helpers**

`resource-codes.ts`:

```ts
type AiResourcePrefix = 'prv' | 'mdl' | 'scene';
type UuidFactory = () => string;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createAiResourceCode(
  prefix: AiResourcePrefix,
  uuidFactory: UuidFactory = crypto.randomUUID,
): string {
  const uuid = uuidFactory().toLowerCase();
  if (!UUID_PATTERN.test(uuid)) {
    throw new TypeError('Invalid UUID returned by AI resource code factory');
  }
  return `${prefix}_${uuid.replaceAll('-', '')}`;
}
```

`endpoint-normalizer.ts` must parse with `URL`, require `https:`, reject credentials, query and hash, strip a trailing `/chat/completions` or `/images/generations`, remove the final slash, and reject paths ending in an unknown inference leaf. Convert helper failures to `Errors.business(...)` in the service boundary so production never exposes a raw TypeError.

- [ ] **Step 4: Tighten Zod schemas**

Make provider and model payloads `z.strictObject`. Remove `code` from `AiModelPayloadSchema`; because the update schema derives from the create schema, PATCH also rejects code. Extend `AiModelListQuerySchema`:

Keep `provider_type` strictly limited to `z.enum(['openai_compatible', 'openrouter'])`; do not add Anthropic Format in this plan.

```ts
export const AiModelListQuerySchema = PaginationQuerySchema.extend({
  providerId: z.uuid('无效的供应商 ID').optional(),
  modality: ModalitySchema.optional(),
  status: StatusSchema.optional(),
  keyword: optionalText(120),
});
```

Change manual route resolution to accept all four modalities and optional input modalities:

```ts
z.strictObject({
  source: z.literal('manual'),
  model_name: z.string().trim().min(1).max(200),
  name: optionalText(120),
  modality: ModalitySchema,
  input_modalities: z.array(ModalitySchema).min(1).max(4).optional(),
});
```

- [ ] **Step 5: Run focused tests and typecheck**

```bash
cd apps/api
bun test src/services/ai-config/resource-codes.test.ts \
  src/services/ai-config/endpoint-normalizer.test.ts \
  src/schema/ai-config.test.ts \
  src/schema/ai-config-scene-routes.test.ts
bun run typecheck
```

Expected: all selected tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit the identity boundary**

```bash
git add apps/api/src/services/ai-config/resource-codes.ts \
  apps/api/src/services/ai-config/resource-codes.test.ts \
  apps/api/src/services/ai-config/endpoint-normalizer.ts \
  apps/api/src/services/ai-config/endpoint-normalizer.test.ts \
  apps/api/src/schema/ai-config.ts \
  apps/api/src/schema/ai-config.test.ts \
  apps/api/src/schema/ai-config-scene-routes.test.ts
git commit -m "feat(ai): 收归配置编码与地址规范"
```

## Task 3: Add paginated model and custom-scene repositories

**Files:**

- Modify: `apps/api/src/repositories/ai-config.ts`
- Modify: `apps/api/src/repositories/ai-system-scenes.ts`
- Modify: `apps/api/src/repositories/ai-config.test.ts`

- [ ] **Step 1: Write failing repository tests**

Add tests for provider-scoped model pagination and exact field projection:

```ts
const result = await repository.listModels({
  page: 2,
  pageSize: 20,
  providerId: PROVIDER_ID,
  modality: 'image',
  status: 'active',
  keyword: 'seedream',
});

expect(builder.calls).toContainEqual({ method: 'eq', args: ['provider_id', PROVIDER_ID] });
expect(builder.calls).toContainEqual({ method: 'eq', args: ['modality', 'image'] });
expect(builder.calls).toContainEqual({ method: 'range', args: [20, 39] });
expect(result.pagination.pageSize).toBe(20);
```

Add tests that `createProvider` and `createModel` insert the service-supplied code without querying for name-derived candidates. Add scene repository tests for keyword/source/status filters applied before bounded pagination, custom update with `expected_version`, atomic `createCustomSceneRoute` RPC and protected delete RPC.

- [ ] **Step 2: Run repository tests and confirm RED**

```bash
cd apps/api
bun test src/repositories/ai-config.test.ts
```

Expected: failures show the old unpaged `listModels()`, old provider code lookup and missing scene writes/RPC.

- [ ] **Step 3: Replace unbounded and name-derived repository paths**

Change `listModels(query)` to use `MODEL_SELECT`, exact count, filter before `.range()`, order by `sort_order` and `created_at`, and return `Page<AiModelRecord>`.

Change create methods to accept prepared records:

```ts
async createProvider(input: AiProviderPayload & { code: string }) {
  const { data, error } = await this.from('ai_providers')
    .insert(input)
    .select('*')
    .single();
  if (error) throw Errors.dbError('创建 AI 供应商失败', error);
  return data as AiProviderRecord;
}

async createModel(input: AiModelPayload & { code: string }) {
  const { data, error } = await this.from('ai_models')
    .insert(input)
    .select(MODEL_SELECT)
    .single();
  if (error) throw Errors.dbError('创建 AI 模型失败', error);
  return data as AiModelRecord;
}
```

Map unique model business-key errors to `AI_MODEL_ALREADY_REGISTERED`, without including database detail.

Add `hasModelRouteReference(modelId)` using one `ai_scene_routes` query with an escaped primary/fallback `.or(...)` filter and `.limit(1)`. The service uses it only when a PATCH changes modality; ordinary edits do not add an extra route query.

- [ ] **Step 4: Extend the scene repository**

Rename the repository class to `AiSceneRegistryRepository` and keep an export alias during rollout so imports remain compatible. Extend the record type with `status`, `version`, `updated_at`, `source: 'system' | 'custom' | 'legacy'`, and `requirements_source: 'runtime' | 'planned_adapter' | 'admin'`.

Implement:

```ts
list(query: AiSceneListQuery): Promise<Page<AiSceneRecord>>
getByCode(code: string): Promise<AiSceneRecord | null>
updateCustom(code: string, input: UpdateAiCustomScenePayload): Promise<AiSceneRecord>
createCustomSceneRoute(input: CreateCustomSceneRouteCommand): Promise<CustomSceneRouteResult>
deleteCustom(code: string, expectedVersion: number): Promise<{ code: string; deleted: true }>
```

`createCustomSceneRoute` must call only `rpc('create_ai_custom_scene_route', mappedParams)`; it must not issue two independent inserts.

The scene list selects only registry fields, applies `source`, `status` and escaped name/code keyword filters before `.range()`, defaults to 20 rows and never exceeds 100.

- [ ] **Step 5: Run repository tests**

```bash
cd apps/api
bun test src/repositories/ai-config.test.ts
bun run typecheck
```

Expected: all repository tests pass and no unbounded public model list remains.

- [ ] **Step 6: Commit repositories**

```bash
git add apps/api/src/repositories/ai-config.ts \
  apps/api/src/repositories/ai-system-scenes.ts \
  apps/api/src/repositories/ai-config.test.ts
git commit -m "feat(ai): 增加模型与场景分页仓储"
```

## Task 4: Implement services, policies and HTTP endpoints

**Files:**

- Modify: `apps/api/src/schema/ai-config.ts`
- Modify: `apps/api/src/services/ai-config/index.ts`
- Modify: `apps/api/src/services/ai-config/scene-route-policy.ts`
- Modify: `apps/api/src/services/ai-config/index.test.ts`
- Modify: `apps/api/src/services/ai-config/scene-routes.test.ts`
- Modify: `apps/api/src/controllers/ai-config/index.ts`
- Modify: `apps/api/src/controllers/ai-config/index.test.ts`

- [ ] **Step 1: Write failing service tests for the new commands**

Cover these exact cases:

```ts
test('creates provider and model with opaque server codes', async () => {
  const generated = ['prv_11111111111141118111111111111111', 'mdl_22222222222242228222222222222222'];
  const service = new AiConfigService({
    codeFactory: () => generated.shift()!,
    configRepository: {
      createProvider: async input => input as never,
      createModel: async input => input as never,
      getProviderById: async () => provider(),
    },
  });
  await expect(service.createProvider(authContext(), providerPayload))
    .resolves.toMatchObject({ code: 'prv_11111111111141118111111111111111' });
  await expect(service.createModel(authContext(), imageModelPayload))
    .resolves.toMatchObject({ code: 'mdl_22222222222242228222222222222222' });
});

test('allows a disconnected image scene to bind a matching active model', async () => {
  const service = sceneRouteService({ runtime_status: 'not_connected' });
  await expect(service.createSceneRoute(authContext(), registeredImageRoutePayload))
    .resolves.toMatchObject({ primary_model_id: MODEL_ID, modality: 'image' });
});
```

Add cases for custom-scene atomic creation, custom rename/disable, referenced delete conflict, manual image model reuse, concurrent model unique conflict reread, OpenRouter manual resolution, inactive provider, wrong modality and permission denial. Add a model-update case proving a referenced model cannot change modality while its name, status and sort order remain editable. Add provider-validation cases proving OpenRouter uses the bounded catalog check while OpenAI Compatible returns `unsupported` without fetch. Add route-option cases proving manual input is no longer inserted into paginated rows and discovery metadata is returned.

- [ ] **Step 2: Run service tests and confirm RED**

```bash
cd apps/api
bun test src/services/ai-config/index.test.ts \
  src/services/ai-config/scene-routes.test.ts
```

Expected: old disconnected-scene rejection and missing code/custom/manual behavior fail.

- [ ] **Step 3: Add scene and route schemas**

Add strict schemas:

```ts
export const AiSceneCodeParamsSchema = z.strictObject({
  code: z.string().trim().min(1).max(120),
});

export const UpdateAiCustomScenePayloadSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  status: StatusSchema.optional(),
  expected_version: ExpectedVersionSchema,
});

export const DeleteAiCustomScenePayloadSchema = z.strictObject({
  expected_version: ExpectedVersionSchema,
});
```

Extend `SystemAiSceneListQuerySchema` into `AiSceneListQuerySchema` with bounded pagination plus optional `keyword`, `source` and `status`. Keep the old exported name as an alias for the compatibility controller route.

Represent route creation with a discriminated input. Keep a preprocess compatibility adapter for the already deployed Admin payload that sends `scene_code` without `scene_source`; normalize it to `scene_source: 'registered'` until Admin deployment completes.

```ts
type RegisteredRouteCreate = {
  scene_source: 'registered';
  scene_code: string;
};

type CustomRouteCreate = {
  scene_source: 'custom';
  scene_name: string;
  modality: AiModality;
};
```

- [ ] **Step 4: Implement service orchestration**

Inject `codeFactory` into `AiConfigService` for deterministic tests. Generate codes before repository writes. Normalize provider Endpoint before persistence.

For manual resolution, remove the OpenRouter prohibition and pass the requested modality/input modalities into creation:

```ts
const existing = await repository.findModelByProviderAndCallName(
  provider.id,
  input.model_name,
  input.modality,
);
const model = existing ?? await repository.createManualModel({
  code: this.codeFactory('mdl'),
  provider,
  modelName: input.model_name,
  displayName: input.name,
  modality: input.modality,
  inputModalities: input.input_modalities ?? [input.modality],
});
return { model_id: model.id, model };
```

If creation reports `AI_MODEL_ALREADY_REGISTERED`, reread the same business key once and return it; do not retry the insert.

For `scene_source='custom'`, generate a `scene_` code and call the repository RPC. For registered scenes, retain the policy and ordinary route insert. Remove the runtime-status binding prohibition from `AiSceneRoutePolicy`, while preserving active supplier/model, modality, duplicate and identity checks.

Every new failure path imports `Errors` from `apps/api/src/errors/error-factory.ts`; do not add `throw new Error()` in controllers, services, repositories or gateways.

- [ ] **Step 5: Add controller endpoints**

Keep `/platform/ai-config/system-scenes` as a read alias for compatibility and add:

```text
GET    /platform/ai-config/scenes
PATCH  /platform/ai-config/scenes/:code
DELETE /platform/ai-config/scenes/:code
POST   /platform/ai-config/providers/:id/validate
```

The scene routes require platform AI permissions, use the new schemas and wrap service results with `ResponseHandler.success`. DELETE reads `expected_version` from the JSON body, matching provider delete.

The provider validation response is a strict union:

```ts
type AiProviderValidationResult =
  | { status: 'verified'; checked_at: string; method: 'openrouter_catalog' }
  | { status: 'unsupported'; checked_at: string; method: 'none'; message: string };
```

For OpenRouter, reuse the bounded first-page catalog request as a read-only connectivity check. For OpenAI Compatible, return `unsupported` without making an external request because a safe discovery/probe contract is not guaranteed. Never return a provider error body or credential detail.

Change route-model option responses to include discovery metadata without placing synthetic manual rows into pagination:

```ts
type AiRouteModelOptionPage = Page<AiRouteModelOptionRecord> & {
  discovery: {
    mode: 'internal_only' | 'openrouter_catalog';
    status: 'ready' | 'unsupported' | 'empty';
  };
};
```

OpenAI Compatible returns `internal_only/unsupported`; OpenRouter returns catalog readiness or `empty`. Transport/auth failures remain stable API errors so Admin can show retry separately.

- [ ] **Step 6: Run controller and service tests**

```bash
cd apps/api
bun test src/services/ai-config \
  src/controllers/ai-config \
  src/repositories/ai-config.test.ts \
  src/schema/ai-config.test.ts \
  src/schema/ai-config-scene-routes.test.ts
bun run typecheck
```

Expected: all selected tests pass; error responses contain stable codes and omit raw database details.

- [ ] **Step 7: Commit API commands**

```bash
git add apps/api/src/schema/ai-config.ts \
  apps/api/src/services/ai-config/index.ts \
  apps/api/src/services/ai-config/scene-route-policy.ts \
  apps/api/src/services/ai-config/index.test.ts \
  apps/api/src/services/ai-config/scene-routes.test.ts \
  apps/api/src/controllers/ai-config/index.ts \
  apps/api/src/controllers/ai-config/index.test.ts
git commit -m "feat(ai): 完善模型与自定义场景接口"
```

## Task 5: Make the runtime use canonical Base URLs

**Files:**

- Modify: `apps/api/src/services/ai-gateway.ts`
- Modify: `apps/api/src/services/ai-gateway.test.ts`
- Modify: `apps/api/src/gateways/ark-rendering/requests.ts`
- Modify: `apps/api/src/gateways/ark-rendering/client.test.ts`

- [ ] **Step 1: Write failing URL-construction tests**

Add a text gateway case whose provider stores `https://api.example.com/v1` and assert that fetch receives `https://api.example.com/v1/chat/completions`. Add a legacy stored endpoint ending in `/chat/completions` and assert it is not doubled.

Retain the Ark image case and assert:

```ts
expect(url).toBe('https://ark.cn-beijing.volces.com/api/v3/images/generations');
```

- [ ] **Step 2: Run URL tests and confirm RED**

```bash
cd apps/api
bun test src/services/ai-gateway.test.ts \
  src/gateways/ark-rendering/client.test.ts
```

Expected: the current text gateway posts directly to the stored Base URL.

- [ ] **Step 3: Centralize inference URL construction**

Use the normalizer from Task 2 and a URL join helper:

```ts
export function aiInferenceEndpoint(
  baseUrl: string,
  modality: 'text' | 'image' | 'video' | 'speech',
): string {
  const base = normalizeAiProviderBaseUrl(baseUrl);
  if (modality === 'text') return `${base}/chat/completions`;
  if (modality === 'image') return `${base}/images/generations`;
  throw Errors.business(400, '该模型模态尚未接入运行时', 'AI_MODALITY_RUNTIME_UNSUPPORTED');
}
```

Pass provider type and model modality through the route resolution row. Use this helper in text resolution; keep the existing Ark rendering boundary for image requests. Do not add video or speech calls in this task.

- [ ] **Step 4: Run gateway tests and API check**

```bash
cd apps/api
bun test src/services/ai-gateway.test.ts \
  src/gateways/ark-rendering/client.test.ts
cd ../..
bun run api:check
```

Expected: URL tests pass; typecheck, build and file-size checks pass.

- [ ] **Step 5: Commit runtime URL handling**

```bash
git add apps/api/src/services/ai-gateway.ts \
  apps/api/src/services/ai-gateway.test.ts \
  apps/api/src/gateways/ark-rendering/requests.ts \
  apps/api/src/gateways/ark-rendering/client.test.ts
git commit -m "fix(ai): 统一推理服务基础地址"
```

## Task 6: Build the supplier and model master-detail workspace

**Files:**

- Create: `apps/admin/components/platform-ai/ai-provider-workspace.tsx`
- Create: `apps/admin/components/platform-ai/ai-provider-editor.tsx`
- Create: `apps/admin/components/platform-ai/ai-provider-models.tsx`
- Create: `apps/admin/components/platform-ai/use-ai-provider-models.ts`
- Modify: `apps/admin/components/platform-ai/ai-config-types.ts`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-shared.ts`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-panel.tsx`
- Modify: `apps/admin/components/platform-ai/ai-provider-secret-editor.tsx`
- Modify: `apps/admin/app/(console)/platform/ai-models/page.tsx`
- Modify: `apps/admin/components/platform-ai/ai-provider-form.test.tsx`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-layout.test.ts`

- [ ] **Step 1: Inspect the installed shadcn components before JSX changes**

Run from the repository root:

```bash
bunx --bun shadcn@latest docs select dialog field table badge alert input button
```

Expected: documentation resolves for the installed component APIs. Do not install a new component or dependency; the required local components already exist.

- [ ] **Step 2: Write failing Admin component contracts**

Assert that the supplier Tab renders the new workspace, model form contains modality/input modalities, and no editable model-code input remains:

```ts
expect(source).toContain('<AiProviderWorkspace');
expect(modelSource).toContain('模型模态');
expect(modelSource).toContain('输入模态');
expect(modelSource).not.toContain('onChange({ ...form, code:');
expect(modelSource).toContain('系统编码');
```

Add reducer/hook tests showing that switching supplier resets the model page and ignores a late response from the prior supplier.

- [ ] **Step 3: Update client types and form state**

Extend scene types with `custom`, `admin`, `status` and `version`. Change `ModelFormState` to:

```ts
export type ModelFormState = {
  id?: string;
  version?: number | null;
  provider_id: string;
  code?: string;
  name: string;
  model_name: string;
  modality: 'text' | 'image' | 'video' | 'speech';
  input_modalities: Array<'text' | 'image' | 'video' | 'speech'>;
  status: 'active' | 'inactive';
  sort_order: string;
};
```

Create payload helpers that omit `code` for both create and update.

- [ ] **Step 4: Implement the master-detail workspace**

`AiProviderWorkspace` owns selected provider identity only. `useAiProviderModels` owns provider-scoped model query state, request generation counters, Dialog form and save state. `AiProviderEditor` renders the connection form and existing secret editor. `AiProviderModels` renders filters, table, pagination and the model Dialog.

Use this desktop composition:

```tsx
<div className="grid min-h-0 flex-1 xl:grid-cols-[320px_minmax(0,1fr)]">
  <ProviderRail />
  <div className="min-w-0 overflow-auto">
    <AiProviderEditor />
    <Separator />
    <AiProviderModels />
  </div>
</div>
```

On narrow screens use a single column and keep table overflow local. Do not nest Cards. Use existing `FieldGroup`, `Field`, `Select`, `Dialog`, `Table`, `Badge`, `Alert` and Lucide icons.

Add a “验证连接” action to `AiProviderEditor`. It calls `POST /platform/ai-config/providers/:id/validate` after the provider is saved. Render `verified` as a success status and `unsupported` as “配置已保存，当前协议没有无损验证方式”; never convert `unsupported` into success.

- [ ] **Step 5: Make secret states explicit**

Allow a manager to configure the selected registered secret before the supplier record exists. Keep provider save and secret save as separate requests and messages. The raw secret remains in the password Dialog only; clearing/closing the Dialog clears local state.

Status copy must be exactly one of:

```text
未配置
已配置，模型调用未验证
配置引用异常
没有密钥管理权限
```

- [ ] **Step 6: Run Admin unit checks**

```bash
cd apps/admin
bun test components/platform-ai/ai-provider-form.test.tsx \
  components/platform-ai/ai-model-routing-layout.test.ts
pnpm run check
```

Expected: selected tests and Admin file-size/type checks pass.

- [ ] **Step 7: Commit the supplier workspace**

```bash
git add apps/admin/components/platform-ai/ai-provider-workspace.tsx \
  apps/admin/components/platform-ai/ai-provider-editor.tsx \
  apps/admin/components/platform-ai/ai-provider-models.tsx \
  apps/admin/components/platform-ai/use-ai-provider-models.ts \
  apps/admin/components/platform-ai/ai-config-types.ts \
  apps/admin/components/platform-ai/ai-model-routing-shared.ts \
  apps/admin/components/platform-ai/ai-model-routing-panel.tsx \
  apps/admin/components/platform-ai/ai-provider-secret-editor.tsx \
  'apps/admin/app/(console)/platform/ai-models/page.tsx' \
  apps/admin/components/platform-ai/ai-provider-form.test.tsx \
  apps/admin/components/platform-ai/use-ai-provider-models.test.ts \
  apps/admin/components/platform-ai/ai-model-routing-layout.test.ts
git commit -m "feat(admin): 重整供应商与模型工作区"
```

## Task 7: Add reusable custom scenes and explicit manual model entry

**Files:**

- Create: `apps/admin/components/platform-ai/ai-manual-model-fields.tsx`
- Create: `apps/admin/components/platform-ai/ai-scene-selector.tsx`
- Modify: `apps/admin/components/platform-ai/ai-route-model-selector.tsx`
- Modify: `apps/admin/components/platform-ai/ai-model-route-tab.tsx`
- Modify: `apps/admin/components/platform-ai/use-ai-route-editor.ts`
- Modify: `apps/admin/components/platform-ai/use-ai-route-model-options.ts`
- Modify: `apps/admin/components/platform-ai/ai-route-editor-shared.ts`
- Modify: `apps/admin/components/platform-ai/ai-model-route-tab.test.tsx`
- Modify: `apps/admin/components/platform-ai/ai-route-model-inspection.test.tsx`

- [ ] **Step 1: Write failing route editor tests**

Cover:

- system/registered versus new-custom source switch;
- scene selector keyword search and next-page loading without exceeding pageSize 20;
- custom name and modality required before save;
- disconnected scene keeps selectors enabled;
- provider selection auto-loads registered models;
- unsupported/failed/empty catalog states remain distinct;
- manual image model payload includes `modality: 'image'`;
- primary and fallback manual drafts stay independent;
- text-only response format is hidden for image scenes;
- late option responses cannot overwrite a changed provider/scene.

Example source contract:

```ts
expect(source).toContain('新建自定义场景');
expect(source).toContain('待业务接入');
expect(source).toContain('<AiManualModelFields');
expect(source).not.toContain('selectedScene.runtime_status !== "connected"');
```

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
cd apps/admin
bun test components/platform-ai/ai-model-route-tab.test.tsx \
  components/platform-ai/ai-route-model-inspection.test.tsx
```

Expected: the current editor still locks disconnected scenes and lacks custom/manual fields.

- [ ] **Step 3: Extend route form state**

Add:

```ts
scene_source: 'registered' | 'custom';
custom_scene_name: string;
custom_scene_modality: 'text' | 'image' | 'video' | 'speech';
primary_manual: { enabled: boolean; name: string; model_name: string };
fallback_manual: { enabled: boolean; name: string; model_name: string };
```

`routeFormFromRecord` always returns `scene_source: 'registered'`. A newly created custom scene becomes a registered scene after the server response and reload.

- [ ] **Step 4: Implement explicit model source handling**

Remove the synthetic manual candidate from option pagination. Render a separate “手动填写调用名称” action when:

- provider protocol is OpenAI Compatible;
- OpenRouter directory failed or returned no matching model;
- the operator explicitly chooses manual input.

Manual resolution request:

```ts
{
  source: 'manual',
  name: draft.name || draft.model_name,
  model_name: draft.model_name,
  modality: routeForm.modality,
  input_modalities: selectedScene?.required_input_modalities ?? [routeForm.modality],
}
```

Keep the selected provider and existing selection when loading fails. The error region must offer both retry and manual entry, not disable the entire selector.

- [ ] **Step 5: Implement registered/custom scene UX**

For `registered`, use the paginated `/scenes` data and derive identity from the selected record. For `custom`, render name and modality inputs and show “保存后生成” instead of an empty editable code field.

`AiSceneSelector` requests `/platform/ai-config/scenes?page=N&pageSize=20&keyword=...`, replaces results when the keyword changes, appends only the next page for “加载更多”, and uses a request generation counter so stale searches cannot overwrite the current list. Preserve the currently bound scene as a pinned option when it is outside the loaded page.

Submit payloads:

```ts
const identity = form.scene_source === 'custom'
  ? {
      scene_source: 'custom' as const,
      scene_name: form.custom_scene_name,
      modality: form.custom_scene_modality,
    }
  : {
      scene_source: 'registered' as const,
      scene_code: form.scene_code,
    };
```

Remove all runtime-status guards from `changeProvider`, `selectModel`, `submit` and `canCreate`. Keep permission and synchronous save locks.

When editing a `custom` scene, show an adjacent action menu with “重命名场景”“停用场景”“删除场景”. Rename and status changes call `PATCH /platform/ai-config/scenes/:code` with `expected_version`. Delete opens an AlertDialog, calls DELETE with `expected_version`, and removes the option only after success. For `system` and `legacy`, do not render these mutation actions.

- [ ] **Step 6: Run Admin component suite**

```bash
cd apps/admin
bun test components/platform-ai
pnpm run check
```

Expected: all platform-ai component tests pass; type and file-size checks pass.

- [ ] **Step 7: Commit route interaction**

```bash
git add apps/admin/components/platform-ai/ai-manual-model-fields.tsx \
  apps/admin/components/platform-ai/ai-scene-selector.tsx \
  apps/admin/components/platform-ai/ai-route-model-selector.tsx \
  apps/admin/components/platform-ai/ai-model-route-tab.tsx \
  apps/admin/components/platform-ai/use-ai-route-editor.ts \
  apps/admin/components/platform-ai/use-ai-route-model-options.ts \
  apps/admin/components/platform-ai/ai-route-editor-shared.ts \
  apps/admin/components/platform-ai/ai-model-route-tab.test.tsx \
  apps/admin/components/platform-ai/ai-route-model-inspection.test.tsx
git commit -m "feat(admin): 完善场景路由配置交互"
```

## Task 8: Add browser regression coverage

**Files:**

- Modify: `apps/admin/e2e/ai-provider-secrets-mock-backend.mjs`
- Modify: `apps/admin/e2e/ai-provider-secrets.spec.ts`
- Modify: `apps/admin/e2e/ai-model-routes.spec.ts`
- Modify: `apps/admin/e2e/ai-model-inspection.spec.ts`

- [ ] **Step 1: Extend the mock backend state machine**

Add paginated provider models, `GET /scenes`, custom scene atomic creation, scene PATCH/DELETE, model POST/PATCH and manual route model resolution for image. Every write must append `{ path, input }` to the existing `writes` array. Never include a real credential; use `ark-test-redacted` only inside the mock process.

- [ ] **Step 2: Write failing Playwright scenarios**

Add browser cases for:

1. Select 火山方舟, create `Seedream 5 Pro` with image output and confirm its code is read-only after save.
2. Open 装修生图 while runtime is `not_connected`, bind the image model and reload with the same selection.
3. Simulate option failure, open manual input, submit `doubao-seedream-5-0-pro-260628`, and verify the resolve payload carries `modality: 'image'`.
4. Create a custom text scene, verify “保存后生成” before submit and generated `scene_` code after reload.
5. Confirm a read-only account can inspect but cannot see mutation actions.
6. Confirm 400px viewport has no page-level horizontal overflow and long model IDs wrap inside their region.
7. Validate OpenRouter as `verified` and OpenAI Compatible as `unsupported`, without a paid model request.
8. Rename and disable an unreferenced custom scene, then delete it through the confirmation dialog; verify system scenes expose no such actions.

- [ ] **Step 3: Run Playwright and confirm RED**

```bash
cd apps/admin
pnpm exec playwright test --config playwright.ai-provider-secrets.config.ts
```

Expected: new scenarios fail against the old mock/UI behavior.

- [ ] **Step 4: Complete mock behavior and test locators**

Use accessible role/label locators. Scope duplicate labels under `getByRole('group', { name: '主模型' })` or `备用模型`. Do not use arbitrary sleeps; wait for the matching request/response or visible state.

- [ ] **Step 5: Run browser and static verification**

```bash
cd apps/admin
bun test components/platform-ai
pnpm run check
pnpm exec playwright test --config playwright.ai-provider-secrets.config.ts
```

Expected: all selected component and browser tests pass. Inspect at least one desktop and one 400px screenshot generated by explicit `page.screenshot()` calls in the new route test.

- [ ] **Step 6: Commit browser coverage**

```bash
git add apps/admin/e2e/ai-provider-secrets-mock-backend.mjs \
  apps/admin/e2e/ai-provider-secrets.spec.ts \
  apps/admin/e2e/ai-model-routes.spec.ts \
  apps/admin/e2e/ai-model-inspection.spec.ts
git commit -m "test(admin): 覆盖模型路由完整配置流程"
```

## Task 9: Run full verification and record local evidence

**Files:**

- Create: `docs/operations/evidence/2026-09-12-ai-model-routing-admin-redesign.md`

- [ ] **Step 1: Run API regression**

```bash
cd apps/api
bun test src/services/ai-config \
  src/controllers/ai-config \
  src/repositories/ai-config.test.ts \
  src/repositories/ai-provider-delete.test.ts \
  src/schema/ai-config.test.ts \
  src/schema/ai-config-scene-routes.test.ts \
  src/services/ai-gateway.test.ts \
  src/gateways/ark-rendering/client.test.ts \
  src/services/ai-system-scene-registry-migration.test.ts
cd ../..
bun run api:check
```

Expected: all selected tests, API typecheck, build and file-size checks pass.

- [ ] **Step 2: Run Admin regression**

```bash
cd apps/admin
bun test components/platform-ai
pnpm run check
pnpm exec playwright test --config playwright.ai-provider-secrets.config.ts
cd ../..
```

Expected: component tests, typecheck, file-size checks and browser suite pass.

- [ ] **Step 3: Run repository hygiene checks**

```bash
git diff --check
bun scripts/check-file-size.ts
git status --short
```

Expected: no whitespace errors or file-size violations. The pre-existing untracked file `docs/operations/evidence/2026-09-12-ai-admin-ark-readiness-recheck.md` remains untouched and unstaged unless the user separately authorizes it.

- [ ] **Step 4: Write local verification evidence**

Record:

- root causes and changed boundaries;
- exact commands, pass counts and exit codes;
- migration filename and SHA-256;
- confirmation that no real key was displayed;
- confirmation that no paid generation was triggered;
- desktop/mobile screenshot paths;
- remaining boundary that Admin configuration is not yet a business end-to-end generation test.

- [ ] **Step 5: Commit local evidence**

```bash
git add docs/operations/evidence/2026-09-12-ai-model-routing-admin-redesign.md
git commit -m "docs(ops): 记录模型路由重整验证"
```

## Task 10: Apply the migration and release API/Admin to development

**Files:**

- Modify: `docs/operations/evidence/2026-09-12-ai-model-routing-admin-redesign.md`

- [ ] **Step 1: Freeze and push one development candidate**

```bash
release_branch='release/ai-model-routing-admin-dev-20260912'
git status --short
git branch -f "$release_branch" HEAD
git push --force-with-lease origin "$release_branch"
release_sha=$(git rev-parse HEAD)
printf '%s\n' "$release_sha"
```

Expected: only the known pre-existing untracked evidence file may remain locally; the release SHA is a full 40-character commit and the remote branch points to it.

- [ ] **Step 2: Run development migration plan**

```bash
gh workflow run migrate-dev-database.yml \
  --ref "$release_branch" \
  -f mode=plan \
  -f confirm_dev_project_ref=fclnkyatvfvmzgzdqlba
```

Use `gh run list --workflow migrate-dev-database.yml --branch "$release_branch" --limit 1` and `gh run view --log` to verify the run head SHA equals `$release_sha` and the only pending migration is `20260912100000`.

- [ ] **Step 3: Apply the development migration**

```bash
gh workflow run migrate-dev-database.yml \
  --ref "$release_branch" \
  -f mode=apply \
  -f confirm_dev_project_ref=fclnkyatvfvmzgzdqlba
```

Expected: workflow success and Local/Remote migration history both contain `20260912100000`. If any other pending migration appears, stop before apply and investigate.

- [ ] **Step 4: Release API then Admin through the trusted orchestrator**

```bash
gh workflow run release-dev.yml \
  --ref "$release_branch" \
  -f operation=release \
  -f service=api,admin \
  -f reason='AI模型路由后台交互重整，先migration再发布开发API和Admin'
```

Expected: build success, migration-history gate success, API deployment success before Admin deployment, and final workflow outcome success.

- [ ] **Step 5: Run development smoke without paid generation**

Verify through the development Admin:

1. 火山方舟供应商显示 Base URL and configured-secret status without revealing the key.
2. `doubao-seedream-5-0-pro-260628` is an image model with the expected input modalities.
3. 装修生图 route selectors are enabled and can persist the primary model.
4. Refresh retains provider/model binding.
5. A custom text scene can be created and receives a `scene_` code.
6. Provider deletion remains blocked while models reference it.

Do not click the paid image test action in this smoke.

- [ ] **Step 6: Record immutable release evidence and commit**

Append the migration plan/apply run IDs, release run ID, release SHA, image digests, container revisions, health responses, migration list output and smoke results. Do not include secrets or full Authorization headers.

```bash
git add docs/operations/evidence/2026-09-12-ai-model-routing-admin-redesign.md
git commit -m "docs(ops): 记录模型路由开发发布"
git push origin feature/customer-rendering-library
```

Expected: the feature branch contains the evidence commit. Production remains untouched.
