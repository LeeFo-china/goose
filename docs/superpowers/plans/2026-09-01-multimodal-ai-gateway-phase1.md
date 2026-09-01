# Multi-modal AI Gateway 2.0 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有同步文字 AI 调用的前提下，交付统一异步的文字、图片、视频和配音 Gateway、模型能力同步、平台预算预占、费用账本、私有 COS 转存、独立 Worker 与超管运维界面。

**Architecture:** 保留 `apps/api/src/services/ai-gateway.ts` 供现有业务同步使用，新建 `ai-generation` 领域作为未来内容项目和租户共用的异步边界。API 只通过 service-role-only RPC 创建、claim 和完成任务；AI Worker 根据经过能力探针确认的 OpenRouter Adapter 执行供应商请求，媒体结果先转存私有 COS，再以租约匹配 RPC 完成任务。模型目录、任务预算和财务账本均以数据库事实为准，Admin 只做严格 DTO 的配置、测试与运维。

**Tech Stack:** Bun、TypeScript 5、Fastify 5.8、Zod 4.4、Supabase/PostgreSQL、腾讯 COS SDK 2.15、OpenRouter HTTP API、Next.js 15、React 19、shadcn/Radix、Docker Compose、GitHub Actions

---

## 实施前提、边界与顺序

- 执行前使用 `using-git-worktrees` 从最新 `main` 创建隔离工作树；不得在当前含无关文件的工作树直接实现。
- 只实施总设计的阶段一；不创建内容项目、来源、分镜、合成或租户入口。
- 不修改现有 `aiGateway.chat()` 的同步返回合同，也不把现有 DeepSeek/OpenAI 场景迁到新异步链路。
- 新自媒体场景的主备模型都必须是 OpenRouter 内已验证模型，不增加直连供应商 fallback。
- 数据库变更只使用下列 forward migration；文件一旦 local apply 就不回改，缺陷新增 repair migration。
- OpenRouter 能力探针是硬 Gate。探针无法证明请求/响应、费用关联键或任务恢复能力时，停止对应模态实现并报告 `NEEDS_CONTEXT`，不得猜测第三方合同。
- 真实 OpenRouter、COS 与 direct dev Gate 必须显式 opt-in；默认测试不得调用外网或远端数据库。
- 每个任务独立提交，提交前只暂存该任务列出的文件。

## 文件职责映射

### Shared domain

- `packages/domain/src/ai-generation.ts`：四模态、质量档位、任务状态、计费状态、能力、价格和公开 DTO 的唯一严格合同。
- `packages/domain/src/ai-generation.test.ts`：strict、状态耦合、费用 decimal string 和分页合同。
- `packages/domain/src/index.ts`、`packages/domain/src/shared.ts`：同一 schema 实例导出。

### API / Gateway

- `apps/api/src/services/ai-generation/openrouter-contract.ts`：OpenRouter 当前合同的 strict parser 和错误归类。
- `apps/api/src/services/ai-generation/openrouter-capability-probe.ts`：只读能力探针与脱敏报告。
- `apps/api/src/services/ai-generation/adapters/*.ts`：文字、图片、视频、配音 Adapter。
- `apps/api/src/services/ai-generation/gateway.ts`：`generateText/Image/Video/Speech` 四个稳定异步入口。
- `apps/api/src/services/ai-generation/job-service.ts`：任务创建、取消、重新确认和人工处理未知提交。
- `apps/api/src/services/ai-generation/private-payload-crypto.ts`：私有请求和供应商临时结果的版本化
  AES-256-GCM envelope；密钥只来自运行环境。
- `apps/api/src/services/ai-generation/worker-service.ts`：claim 后的状态编排，不处理 HTTP。
- `apps/api/src/services/ai-generation/private-asset-store.ts`：供应商媒体流式校验、私有 COS 转存和孤儿补偿。
- `apps/api/src/services/ai-generation/usage-reconciliation.ts`：OpenRouter generation/Activity 与本地账本对账。
- `apps/api/src/repositories/ai-generation-jobs.ts`：任务与命令 RPC adapter。
- `apps/api/src/repositories/ai-model-catalog.ts`：模型同步 run/entry 和 apply RPC adapter。
- `apps/api/src/schema/ai-generation.ts`：Admin 任务、测试、取消、重确认、分页 schema。
- `apps/api/src/controllers/ai-generation/index.ts`：平台 HTTP 路由。
- `apps/api/src/workers/ai-generation-worker.ts`、`ai-generation-worker-health.ts`：独立 Worker 与健康证据。
- `apps/api/src/scripts/openrouter-capability-probe.ts`：显式 opt-in CLI。
- `apps/api/src/scripts/ai-generation-database-smoke.ts`：仅本地真实 PostgreSQL 并发/ACL smoke。
- `apps/api/src/scripts/ai-generation-live-smoke.ts`：显式开发配置的 OpenRouter/COS smoke。

### Existing API files to modify

- `apps/api/src/schema/ai-config.ts`：多模态模型、价格、能力、质量档位与同步命令 schema。
- `apps/api/src/repositories/ai-config.ts`：必要字段分页读取，不再用 `select('*')` 获取新增大 JSON。
- `apps/api/src/services/ai-config.ts`：OpenRouter 同步 preview/apply、route test、credits/usage。
- `apps/api/src/controllers/ai-config/index.ts`：总设计 10.5 节的配置路由。
- `apps/api/src/services/files/platform-file-storage/legacy-service.ts`：挂接私有生成资产方法，不改变现有公开上传。
- `apps/api/src/services/files/platform-file-storage/legacy/generated-private-asset.ts`：COS 私有对象 put/head/delete/sign 实现。
- `apps/api/src/types/database.ts`：官方 local typegen 结果。
- `apps/api/package.json`、根 `package.json`：Worker、probe 和 smoke 命令。

### Database

- `supabase/migrations/20260901100000_extend_ai_multimodal_catalog.sql`：供应商类型、模型能力/价格快照、三档路由、同步 run/entry、权限。
- `supabase/migrations/20260901101000_create_ai_generation_accounting.sql`：任务、预算策略、预占、账本、供应商事件、资产意图、RLS/ACL/索引。
- `supabase/migrations/20260901102000_create_ai_generation_commands.sql`：创建、claim、心跳、提交未知、完成、失败、取消、重确认、结算和目录 apply RPC。
- `supabase/migrations/20260901103000_seed_social_media_ai_scenes.sql`：七个 social-media 场景的 inactive 路由骨架；不自动启用模型。

### Admin

- `apps/admin/components/platform-ai/ai-config-types.ts`：复用 domain DTO 的 Admin 类型。
- `apps/admin/components/platform-ai/ai-model-catalog-tab.tsx`：同步预览、变更确认和能力状态。
- `apps/admin/components/platform-ai/ai-generation-operations-tab.tsx`：任务、unknown、overrun 和对账摘要。
- `apps/admin/components/platform-ai/ai-model-routing-panel.tsx`：增加目录与运行记录 tabs。
- `apps/admin/components/platform-ai/ai-model-routing-sections.tsx`：模型能力/价格/探针状态只读摘要。
- `apps/admin/app/(console)/platform/ai-models/page.tsx`：服务端加载 credits/usage 摘要并避免页面截断。

### Deployment

- `deploy/docker-compose.api.yml`、`deploy/docker-compose.dev.yml`：新增 `gooes-ai-generation-worker`。
- `.github/workflows/build-docker-images.yml`、`.github/workflows/deploy-dev.yml`、`.github/workflows/deploy-docker-services.yml`：识别新服务。
- `scripts/resolve-dev-change-plan.mjs`、`scripts/resolve-admin-release-services.mjs`、`scripts/resolve-web-deployment.mjs`：相关路径才部署 AI Worker。
- `apps/api/src/schema/release-deployments.ts`、`apps/admin/components/ops/ops-types.ts`：发布服务联合类型。
- 相邻 release/deploy contract tests：锁定构建复用 API 镜像、独立重启和健康检查。

---

### Task 1: OpenRouter 合同与能力探针硬 Gate

**Files:**
- Create: `apps/api/src/services/ai-generation/openrouter-contract.ts`
- Create: `apps/api/src/services/ai-generation/openrouter-contract.test.ts`
- Create: `apps/api/src/services/ai-generation/openrouter-capability-probe.ts`
- Create: `apps/api/src/services/ai-generation/openrouter-capability-probe.test.ts`
- Create: `apps/api/src/services/ai-generation/fixtures/openrouter-contract-v1.json`
- Create: `apps/api/src/scripts/openrouter-capability-probe.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: 写 strict 外部合同 RED 测试**

测试必须覆盖 `/api/v1/models`、`/api/v1/images/models`、`/api/v1/videos/models`、`/api/v1/images`、`/api/v1/videos`、`/api/v1/videos/:id`、`/api/v1/videos/:id/content`、`/api/v1/audio/speech`、`/api/v1/credits` 和 `/api/v1/generation?id=`。对未知根字段、缺少稳定 billing ID、视频缺少任务 ID、TTS 非音频 content-type、费用非 decimal string 全部失败关闭。

```ts
import { describe, expect, test } from 'bun:test';
import {
  OpenRouterGenerationUsageSchema,
  OpenRouterVideoSubmissionSchema,
  parseOpenRouterAudioResponse,
} from './openrouter-contract';

describe('OpenRouter strict contract', () => {
  test('requires a stable async video task id', () => {
    expect(OpenRouterVideoSubmissionSchema.safeParse({ id: 'video_1', status: 'queued' }).success)
      .toBe(true);
    expect(OpenRouterVideoSubmissionSchema.safeParse({ status: 'queued' }).success)
      .toBe(false);
  });

  test('requires a billing correlation id and decimal cost', () => {
    expect(OpenRouterGenerationUsageSchema.safeParse({
      id: 'gen_1',
      total_cost: '0.012500000000',
    }).success).toBe(true);
    expect(OpenRouterGenerationUsageSchema.safeParse({ total_cost: 0.0125 }).success)
      .toBe(false);
  });

  test('rejects non-audio speech responses', async () => {
    const response = new Response('<html>error</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    await expect(parseOpenRouterAudioResponse(response)).rejects.toMatchObject({
      code: 'AI_PROVIDER_RESPONSE_INVALID',
    });
  });
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd apps/api && bun test src/services/ai-generation/openrouter-contract.test.ts`

Expected: FAIL，错误为找不到 `openrouter-contract`。

- [ ] **Step 3: 实现 strict parser 与稳定错误分类**

使用项目真实 Zod 4.4.2，所有 JSON 使用 `z.strictObject`；音频使用 `Response` 的 status、content-type、content-length 和受限字节读取。只导出内部归一化结果：

```ts
export type OpenRouterNormalizedResult = {
  billingCorrelationId: string;
  providerTaskId: string | null;
  status: 'submitted' | 'processing' | 'succeeded';
  output: Readonly<Record<string, unknown>>;
  usage: Readonly<Record<string, string | number | null>>;
  temporaryAssetUrls: readonly string[];
};

export type OpenRouterErrorKind =
  | 'definitely_not_submitted'
  | 'submission_unknown'
  | 'terminal_provider_failure'
  | 'rate_limited'
  | 'invalid_response';
```

不得把供应商 message 放入公开异常；`Errors.business()` 只返回固定中文消息和业务码。

- [ ] **Step 4: 写能力探针 RED 测试**

注入 fake fetch，断言探针并行读取模型目录但并发不超过 3，按模态验证一个管理员指定模型，输出脱敏 fixture，且绝不输出 Authorization、临时 URL 或原始 Prompt。缺少 billing correlation ID 的模态必须输出 `eligible=false`。

- [ ] **Step 5: 实现只读探针与 CLI**

CLI 只在以下条件全部满足时运行：

```text
OPENROUTER_CAPABILITY_PROBE=1
GOOES_DEPLOY_ENV=development
OPENROUTER_API_KEY 已配置
```

先读取真实目录，再由运行人员把本次返回的精确 model ID 注入探针：

```bash
OPENROUTER_CAPABILITY_PROBE=1 \
bun run ai:openrouter:probe -- --list-models

OPENROUTER_CAPABILITY_PROBE=1 \
OPENROUTER_TEXT_MODEL="$OPENROUTER_TEXT_MODEL_ID" \
OPENROUTER_IMAGE_MODEL="$OPENROUTER_IMAGE_MODEL_ID" \
OPENROUTER_VIDEO_MODEL="$OPENROUTER_VIDEO_MODEL_ID" \
OPENROUTER_SPEECH_MODEL="$OPENROUTER_SPEECH_MODEL_ID" \
bun run ai:openrouter:probe
```

四个 `*_MODEL_ID` 必须由运行人员根据同一次目录响应显式导出；脚本拒绝空值和不在本次目录中的
ID，不把示例 model ID 写入代码或 migration。CLI 只写
`reports/openrouter-capability-probe.json`；提交的 fixture 必须由 `sanitizeProbeReport()` 生成，字段
固定为 endpoint、modality、request schema version、response shape、billing ID kind、
async/query/cancel/webhook 能力和 `eligible`，不保存真实素材或密钥。

- [ ] **Step 6: 运行 focused 测试与真实开发探针**

Run: `cd apps/api && bun test src/services/ai-generation/openrouter-contract.test.ts src/services/ai-generation/openrouter-capability-probe.test.ts`

Expected: PASS。

Run: `cd apps/api && bun --env-file=../../.env src/scripts/openrouter-capability-probe.ts`

Expected: 四种模态各有一条 `eligible=true`；任何一项失败时停止后续对应模态任务并报告实际缺失合同。

- [ ] **Step 7: 核对第三方真实类型与提交**

Run: `cd apps/api && bun run typecheck`

Expected: PASS；实现只能使用当前 Bun `fetch`、Zod 4.4.2 和项目已安装依赖。

```bash
git add apps/api/src/services/ai-generation apps/api/src/scripts/openrouter-capability-probe.ts apps/api/package.json
git commit -m "feat(ai): 固化OpenRouter多模态合同"
```

---

### Task 2: Shared domain 四模态任务合同

**Files:**
- Create: `packages/domain/src/ai-generation.ts`
- Create: `packages/domain/src/ai-generation.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/shared.ts`
- Modify: `packages/domain/scripts/verify-build.mjs`

- [ ] **Step 1: 写 schema RED 测试**

```ts
import { describe, expect, test } from 'bun:test';
import {
  AiGenerationJobSchema,
  AiGenerationStatusSchema,
  AiModelCapabilitySchema,
  AiMoneySchema,
} from './ai-generation';

describe('AI generation domain contract', () => {
  test('keeps generation and billing states orthogonal', () => {
    expect(AiGenerationJobSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      modality: 'video',
      quality_tier: 'balanced',
      status: 'succeeded',
      billing_status: 'overrun',
      estimated_cost: '1.250000000000',
      reserved_cost: '1.250000000000',
      actual_cost: '1.500000000000',
      currency: 'USD',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:01:00.000Z',
    }).success).toBe(true);
    expect(AiGenerationStatusSchema.safeParse('budget_overrun').success).toBe(false);
  });

  test('rejects numeric money and unbounded capability payloads', () => {
    expect(AiMoneySchema.safeParse(0.1).success).toBe(false);
    expect(AiModelCapabilitySchema.safeParse({
      modality: 'video',
      aspect_ratios: ['9:16'],
      max_duration_seconds: 30,
      supports_audio: false,
      unknown: true,
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认 RED**

Run: `cd packages/domain && bun test src/ai-generation.test.ts`

Expected: FAIL，缺少新模块。

- [ ] **Step 3: 实现唯一 strict schemas**

必须定义：

```ts
export const AiModalitySchema = z.enum(['text', 'image', 'video', 'speech']);
export const AiQualityTierSchema = z.enum(['fast', 'balanced', 'quality']);
export const AiGenerationStatusSchema = z.enum([
  'awaiting_budget_reconfirmation',
  'queued',
  'submitting',
  'submission_unknown',
  'submitted',
  'processing',
  'succeeded',
  'failed',
  'canceled',
]);
export const AiBillingStatusSchema = z.enum([
  'estimated',
  'reserved',
  'settled',
  'overrun',
  'adjusted',
]);
export const AiMoneySchema = z.string().regex(/^\d{1,12}\.\d{12}$/u);
export const AiScopeSchema = z.strictObject({
  scope_type: z.enum(['platform', 'tenant']),
  tenant_id: z.uuid().nullable(),
}).superRefine((value, ctx) => {
  if (value.scope_type === 'platform' && value.tenant_id !== null) {
    ctx.addIssue({ code: 'custom', path: ['tenant_id'], message: '平台任务不能绑定租户' });
  }
  if (value.scope_type === 'tenant' && value.tenant_id === null) {
    ctx.addIssue({ code: 'custom', path: ['tenant_id'], message: '租户任务必须绑定租户' });
  }
});
```

能力按模态使用 discriminated union；公开 job DTO 不包含 request payload、供应商临时 URL、COS object key、Prompt、原始错误或 API Key。

- [ ] **Step 4: 验证 root/shared 同引用与 dist**

Run: `cd packages/domain && bun test src/ai-generation.test.ts && bun run build && bun run verify:packed-consumer`

Expected: PASS；`@gooes/domain` root 导出的 schema 与 `shared.ts` 为 `Object.is` 同一实例。

- [ ] **Step 5: 提交**

```bash
git add packages/domain/src/ai-generation.ts packages/domain/src/ai-generation.test.ts packages/domain/src/index.ts packages/domain/src/shared.ts packages/domain/scripts/verify-build.mjs
git commit -m "feat(domain): 增加多模态生成合同"
```

---

### Task 3: 多模态模型目录、价格与质量路由 migration

**Files:**
- Create: `supabase/migrations/20260901100000_extend_ai_multimodal_catalog.sql`
- Create: `apps/api/src/services/ai-multimodal-catalog-migration-contract.test.ts`

- [ ] **Step 1: 写 migration contract RED 测试**

锁定以下合同：

```text
ai_providers.provider_type 允许 openrouter
ai_providers / ai_models / ai_scene_routes 增 version optimistic token
ai_models 增 modality、input_modalities、capability_payload、probe_status、probe_at
ai_model_price_snapshots 使用 numeric(24,12) 且 append-only
ai_scene_routes 增 quality_tier、modality、max_cost、confirmation_threshold、concurrency_limit
ai_scene_routes 增 cost_guard_status、cost_guard_reason、cost_guard_at
旧 uniq_ai_scene_routes_scene 替换为 (scene_code, quality_tier)
ai_model_catalog_sync_runs / ai_model_catalog_entries 分页保存同步预览
目录 apply 和 capability override 只经 service_role RPC
anon/authenticated 无任何配置命令 EXECUTE
同步 run/entry 表 service_role 只保留 SELECT；现有 provider/model/route CRUD 暂保留当前
service-role 边界，避免 expand migration 先于新 API 部署时让旧配置页中断
```

测试必须读取 migration 文本并对历史 `20260509183000_create_ai_provider_routing.sql` 做 SHA-256 锁，证明没有回改历史 migration。

- [ ] **Step 2: 运行确认 RED**

Run: `cd apps/api && bun test src/services/ai-multimodal-catalog-migration-contract.test.ts`

Expected: FAIL，缺少 `20260901100000`。

- [ ] **Step 3: 实现 forward migration**

关键数据库约束必须使用以下确定值：

```sql
CHECK (modality = ANY (ARRAY['text','image','video','speech']))
CHECK (quality_tier = ANY (ARRAY['fast','balanced','quality']))
CHECK (probe_status = ANY (ARRAY['unverified','eligible','ineligible','stale']))
CHECK (cost_guard_status = ANY (ARRAY['active','paused_overrun']))
CHECK (max_cost_usd > 0 AND confirmation_threshold_usd >= 0)
CHECK (jsonb_typeof(capability_payload) = 'object')
UNIQUE (scene_code, quality_tier)
```

`ai_model_price_snapshots` 每行保存 model、catalog sync run、币种 `USD`、模态单价列、原始价格
安全投影、`valid_from` 和 catalog hash；不得 UPDATE/DELETE。模型当前价格通过
`current_price_snapshot_id` 引用。`ai_model_catalog_entries` 对每次 run 最多保存 10,000 条，应用
命令每次最多 100 条，防止无界数组。

同一 migration 提供 `save_ai_model_capability_override` 和 `apply_openrouter_model_catalog` 命令，
统一 expected version、strict envelope、ACL 和固定 search_path。现有 provider/model/route CRUD
保持当前兼容合同；只有新增 catalog 批量应用和能力覆盖必须走原子命令。

- [ ] **Step 4: local migration Gate**

Run: `supabase db push --local --dry-run`

Expected: 只列 `20260901100000_extend_ai_multimodal_catalog.sql`。

Run: `supabase db push --local && supabase migration list --local`

Expected: Local/Remote(local history column) 对齐至 `20260901100000`。

Run: `supabase db push --local --dry-run`

Expected: `Local database is up to date`。

- [ ] **Step 5: catalog 与 ACL truth**

使用本地 PostgreSQL 查询证明新表 RLS enabled+forced、service_role 表只 SELECT、目录 apply RPC 仅 service_role EXECUTE、search_path 固定 `pg_catalog, public`。对模型/路由列表执行 `EXPLAIN ANALYZE`，确认使用 provider/status 和 scene/tier 索引。

- [ ] **Step 6: 提交**

```bash
git add supabase/migrations/20260901100000_extend_ai_multimodal_catalog.sql apps/api/src/services/ai-multimodal-catalog-migration-contract.test.ts
git commit -m "feat(ai): 扩展多模态模型目录"
```

---

### Task 4: OpenRouter 模型同步 preview/apply 与超管配置

**Files:**
- Create: `apps/api/src/repositories/ai-model-catalog.ts`
- Create: `apps/api/src/repositories/ai-model-catalog.test.ts`
- Create: `apps/api/src/services/ai-config/openrouter-model-sync.ts`
- Create: `apps/api/src/services/ai-config/openrouter-model-sync.test.ts`
- Modify: `apps/api/src/schema/ai-config.ts`
- Modify: `apps/api/src/repositories/ai-config.ts`
- Modify: `apps/api/src/services/ai-config.ts`
- Modify: `apps/api/src/controllers/ai-config/index.ts`
- Create: `apps/admin/components/platform-ai/ai-model-catalog-tab.tsx`
- Create: `apps/admin/components/platform-ai/ai-model-catalog-tab.test.ts`
- Modify: `apps/admin/components/platform-ai/ai-config-types.ts`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-panel.tsx`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-sections.tsx`
- Modify: `apps/admin/app/(console)/platform/ai-models/page.tsx`

- [ ] **Step 1: 写 API RED 合同**

覆盖：只有 `platform.ai_config.manage` 能 sync-preview/apply；preview 严格读取目录、保存 run/entry、
返回分页 summary；apply 只接受同一 run 中最多 100 个 entry ID 和 expected catalog hash；下架或
价格变化不自动切路由；余额只返回 credits/usage 数值，不返回 key。

现有 provider/model/route 列表也必须改为分页接口，默认 20、最大 100；`GET /platform/ai-config`
只返回 counts/credits/usage summary，不再无上限嵌入三张完整列表：

```text
GET /platform/ai-config/providers?page=1&pageSize=20
GET /platform/ai-config/models?page=1&pageSize=20&modality=&status=&keyword=
GET /platform/ai-config/routes?page=1&pageSize=20&sceneCode=&qualityTier=
GET /platform/ai-config/catalog-runs?page=1&pageSize=20
GET /platform/ai-config/catalog-runs/:id/entries?page=1&pageSize=20&changeType=
```

```ts
expect(routes).toContainEqual([
  'POST /platform/ai-config/openrouter/models/sync-preview',
  'POST /platform/ai-config/openrouter/models/apply',
  'PATCH /platform/ai-config/models/:id/capability',
  'GET /platform/ai-config/openrouter/credits',
  'GET /platform/ai-config/usage-summary',
]);
```

- [ ] **Step 2: 运行确认 RED**

Run: `cd apps/api && bun test src/repositories/ai-model-catalog.test.ts src/services/ai-config/openrouter-model-sync.test.ts`

Expected: FAIL，缺少 repository/service/路由。

- [ ] **Step 3: 实现 repository/service/controller 分层**

- controller 只做 Zod、权限上下文和 `ResponseHandler.success`；
- service 只允许 OpenRouter provider，比较当前目录、人工 override 和 probe 结果；
- repository 的 provider/model/route/run/entry 列表全部默认 20、最大 100，使用 exact count、
  必要字段 select+range；
- apply 使用 migration 提供的原子 RPC，不做多次普通 UPDATE；
- 现有 provider/model/route create/update 保持现有行为并增加 expected version；catalog apply 和
  capability override 使用新 RPC；
- 本任务不实现 route test；该入口依赖 Task 5–7 的预算任务边界，在 Task 7 才开放。

- [ ] **Step 4: 写 Admin RED 测试**

断言新 tab 显示“同步 OpenRouter 模型”、新增/变化/下架/价格变化、探针状态、credits 与预算摘要；
确认应用要求勾选 entry 且最多 100；加载/空/错误/提交中状态不截断。

- [ ] **Step 5: 实现 Admin UI**

复用现有 `Tabs`、`Card`、`Table`、`Dialog`、`StatusAlert`；不新增依赖。每个 tab 维护独立分页和
筛选 authority，不把所有模型一次加载到浏览器。模型能力只显示严格投影，未知字段不渲染。
页面主容器保留 `min-h-0`，目录表内部滚动，底部确认操作始终可见。

- [ ] **Step 6: focused 与全检查**

Run: `cd apps/api && bun test src/repositories/ai-model-catalog.test.ts src/services/ai-config/openrouter-model-sync.test.ts`

Run: `pnpm --dir apps/admin exec bun test components/platform-ai/ai-model-catalog-tab.test.ts`

Run: `bun run api:check && bun run admin:check`

Expected: 全部 PASS，所有 TS/TSX 文件不超过项目门禁。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/repositories/ai-model-catalog.ts apps/api/src/repositories/ai-model-catalog.test.ts apps/api/src/services/ai-config apps/api/src/schema/ai-config.ts apps/api/src/repositories/ai-config.ts apps/api/src/services/ai-config.ts apps/api/src/controllers/ai-config/index.ts apps/admin/app/\(console\)/platform/ai-models/page.tsx apps/admin/components/platform-ai
git commit -m "feat(ai): 增加OpenRouter模型同步"
```

---

### Task 5: 任务、平台预算预占与费用账本 foundation migration

**Files:**
- Create: `supabase/migrations/20260901101000_create_ai_generation_accounting.sql`
- Create: `apps/api/src/services/ai-generation-accounting-migration-contract.test.ts`

- [ ] **Step 1: 写表结构和安全 RED 合同**

合同必须覆盖：

```text
ai_generation_jobs
ai_budget_policies
ai_usage_reservations
ai_cost_ledger
ai_generation_provider_events
ai_generation_asset_intents
```

所有表必须满足作用域 CHECK：

```sql
(
  scope_type = 'platform'
  AND tenant_id IS NULL
  AND scope_id = '00000000-0000-0000-0000-000000000000'::uuid
)
OR (
  scope_type = 'tenant'
  AND tenant_id IS NOT NULL
  AND scope_id = tenant_id
)
```

测试还要锁定：任务生成状态与计费状态分列；money 使用 `numeric(24,12)`；request snapshot、
供应商 URL 和原始错误不在任何 anon/authenticated 可读表；表 ENABLE+FORCE RLS；service_role
只有 SELECT；账本、provider event append-only；索引覆盖 claim、unknown、overrun、对账和分页。

- [ ] **Step 2: 运行确认 RED**

Run: `cd apps/api && bun test src/services/ai-generation-accounting-migration-contract.test.ts`

Expected: FAIL，缺少 `20260901101000`。

- [ ] **Step 3: 实现表与确定约束**

`ai_generation_jobs` 至少保存：

```text
scope_type, scope_id, tenant_id, scene_code, modality, quality_tier
target_type, target_id, purpose, generation_no
idempotency_key, request_hash, private_request_ciphertext, encryption_key_version
route_id, model_id, model_snapshot, price_snapshot_id
status, billing_status, billing_correlation_id, provider_task_id
estimated_cost_usd, reserved_cost_usd, actual_cost_usd
lease_token, lease_expires_at, attempt_count, submitted_at, completed_at
public_output_payload, private_output_ciphertext, safe_error_code
created_by_employee_id, created_at, updated_at, version
```

唯一约束：

```sql
UNIQUE (scope_type, scope_id, idempotency_key)
UNIQUE (scope_type, scope_id, target_type, target_id, purpose, generation_no)
UNIQUE (billing_correlation_id) WHERE billing_correlation_id IS NOT NULL
UNIQUE (provider_task_id) WHERE provider_task_id IS NOT NULL
```

`ai_cost_ledger` 只追加 `reserve | settle | release | adjust`，每条包含 job、reservation、原币、
金额、price snapshot、provider generation ID、reason 和 actor。数据库 trigger 无条件拒绝账本
UPDATE/DELETE。

`ai_budget_policies` 必须显式保存：`scope_type/scope_id/tenant_id`、政策维度
`platform_month | platform_day | employee_day | project | task`、可空 modality、`limit_usd`、
`confirmation_threshold_usd`、生效区间、enabled、version 和审计字段。唯一约束保证同一 scope、
维度、modality 与生效起点不重复；金额使用 `numeric(24,12)`。阶段一 Admin 只管理 platform scope，
但表和命令从第一天支持 tenant scope，不能靠后续改表补租户能力。

- [ ] **Step 4: 加索引并验证计划**

至少建立：

```sql
(status, lease_expires_at, created_at, id) WHERE status IN ('queued','submitting','submitted','processing')
(billing_status, updated_at, id) WHERE billing_status IN ('overrun','adjusted')
(status, updated_at, id) WHERE status = 'submission_unknown'
(scope_type, scope_id, created_at DESC, id DESC)
(billing_correlation_id)
```

使用本地 10,000 条代表任务执行 `EXPLAIN ANALYZE`，claim 必须使用 pending/lease 索引，平台任务分页必须使用 scope/created 索引；测试后在事务回滚或固定 fixture cleanup 中清零。

- [ ] **Step 5: local migration Gate 与 catalog truth**

Run: `supabase db push --local --dry-run`

Expected: 只列 `20260901101000_create_ai_generation_accounting.sql`。

Run: `supabase db push --local && supabase migration list --local && supabase db push --local --dry-run`

Expected: migration 对齐且 post dry-run up to date。

验证 RLS、ACL、append-only trigger、CHECK validated、索引 valid/ready。

- [ ] **Step 6: 提交**

```bash
git add supabase/migrations/20260901101000_create_ai_generation_accounting.sql apps/api/src/services/ai-generation-accounting-migration-contract.test.ts
git commit -m "feat(ai): 建立生成任务费用账本"
```

---

### Task 6: 原子任务、租约、重确认与结算 RPC

**Files:**
- Create: `supabase/migrations/20260901102000_create_ai_generation_commands.sql`
- Create: `apps/api/src/services/ai-generation-commands-migration-contract.test.ts`
- Create: `apps/api/src/services/ai-generation-database.test.ts`
- Create: `apps/api/src/scripts/ai-generation-database-smoke.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: 写命令签名 RED 合同**

必须创建以下 service-role-only、`SECURITY DEFINER`、固定 `search_path=pg_catalog, public` 的 RPC：

```sql
create_ai_generation_job(jsonb) -> jsonb
claim_ai_generation_job(uuid, timestamptz) -> jsonb
heartbeat_ai_generation_job(uuid, uuid, timestamptz) -> jsonb
mark_ai_generation_submitted(uuid, uuid, text, text, jsonb) -> jsonb
mark_ai_generation_submission_unknown(uuid, uuid, text) -> jsonb
begin_ai_generation_asset(uuid, uuid, jsonb) -> jsonb
bind_ai_generation_asset(uuid, uuid, uuid, jsonb) -> jsonb
mark_ai_generation_asset_orphaned(uuid, text) -> jsonb
mark_ai_generation_asset_deleted(uuid, text) -> jsonb
complete_ai_generation_job(uuid, uuid, jsonb, jsonb, text, numeric) -> jsonb
fail_ai_generation_job(uuid, uuid, text, boolean, numeric) -> jsonb
cancel_ai_generation_job(uuid, uuid, uuid, integer) -> jsonb
reconfirm_ai_generation_budget(uuid, uuid, integer, boolean) -> jsonb
resolve_ai_generation_submission(uuid, uuid, integer, text, jsonb) -> jsonb
list_ai_generation_jobs(jsonb) -> jsonb
get_ai_generation_operations_summary(jsonb) -> jsonb
list_ai_generation_issues(jsonb) -> jsonb
reconcile_ai_generation_cost(uuid, text, numeric, text, jsonb) -> jsonb
apply_openrouter_model_catalog(uuid, uuid[], uuid, integer) -> jsonb
save_ai_budget_policy(jsonb) -> jsonb
```

测试必须证明 PUBLIC/anon/authenticated 全撤权，只有 service_role EXECUTE；历史两个新 migration
SHA-256 锁定；所有失败只返回 `{error:{status_code,code,message}}`，不返回 SQL detail。

- [ ] **Step 2: 写真实并发 RED 测试**

通过 `DOUYIN_BUDGET_DB_INTEGRATION` 现有模式创建新的显式门控测试：

```text
AI_GENERATION_DB_INTEGRATION=1
仅允许 127.0.0.1 或 localhost:54322/postgres
admin + 3 个 max=1 service_role 连接
```

RED 场景：两个连接争抢平台最后额度时都成功；同 job 被两 Worker claim；旧 lease complete 覆盖新
lease；同 key 异 hash 未冲突；价格变化后仍被 claim；unknown 自动重提；overrun 被截断为预占额。

- [ ] **Step 3: 实现创建任务与预算固定锁序**

`create_ai_generation_job` 在同一事务中：

1. 验证平台/租户 scope CHECK；
2. 按 `platform_month -> platform_day -> employee_day -> project -> task` 排序 advisory xact lock；
3. 锁定 route、model、price snapshot 和预算政策；route 必须 active、probe eligible 且
   `cost_guard_status=active`；
4. 用模态硬上限计算 `numeric(24,12)` 预占；
5. 幂等 replay 先于预算扣减，同 key 异 hash返回 409；
6. 服务端在 target advisory lock 内分配 `generation_no`；
7. 同事务写 reservation、reserve ledger 和 `queued` job；
8. 返回严格 public job DTO。

不得接收客户端自报的模型 ID、价格、generation_no 或 reserved amount。

- [ ] **Step 4: 实现 claim/租约/终态 CAS**

- `claim` 使用 `FOR UPDATE SKIP LOCKED`，仅选择有效 reservation 的 queued 或可查询恢复任务；
- claim 返回随机 lease token，所有 heartbeat/submit/complete/fail 必须匹配 job+lease+attempt；
- 旧 Worker、旧 Webhook 和重复完成返回 stale no-op，不改变资产或账本；
- `submission_unknown` 不可被普通 claim 自动提交；
- asset begin/bind/orphan/delete 全部匹配当前 lease 或受控补偿 token；先写 intent，再绑定 private
  file object，同一 asset 重放只能返回同一事实，不能制造重复文件记录；
- `complete` 先校验媒体 file object/输出，再追加 settle/release ledger 并更新 job；
- actual > reserved 时保留生成结果、billing=`overrun`、追加实际费用、原子设置所用 route
  `cost_guard_status=paused_overrun`，阻止该路由新任务和 release package；管理员完成对账并以 expected
  version 明确恢复前不得自动解冻。

- [ ] **Step 5: 实现价格重确认和人工 unknown 恢复**

- 价格 hash 变化时 Worker 命令把 job 置为 `awaiting_budget_reconfirmation` 并释放 lease；
- reject 原子取消并释放旧 reservation；
- confirm 按固定锁序替换/调整 reservation、price snapshot、审计和 version，再回 queued；
- `resolve-submission=provider_accepted` 必须带 capability query 得到的 provider/billing ID；
- `resolve-submission=definitely_not_submitted` 才能回 queued 并复用供应商幂等键；
- `resolve-submission=close_failed` 关闭当前 attempt；新的人工“重新生成”创建新 attempt。

`save_ai_budget_policy` 对 create 要求 ID 为空且 expected version 为空，对 update 要求 ID 与 expected
version；在固定预算锁序内校验 scope、维度、模态、金额、时间区间和重叠政策，返回 strict policy
DTO。它只管理政策，不修改已结算账本；降低额度不得使已有 reservation 消失，而是稳定返回冲突并
提示先处理在途任务。

- [ ] **Step 6: local Gate 与真实 truth**

Run: `supabase db push --local --dry-run`

Expected: 只列 `20260901102000_create_ai_generation_commands.sql`。

Run: `supabase db push --local`

Run: `cd apps/api && AI_GENERATION_DB_INTEGRATION=1 bun test src/services/ai-generation-database.test.ts`

Expected: PASS，至少覆盖：预算并发恰一成功、claim 恰一、旧 lease no-op、idempotency、unknown、
重确认、cancel、settle、overrun、政策 optimistic concurrency/重叠/在途 reservation 冲突、ACL、
cleanup=0。

- [ ] **Step 7: 提交**

```bash
git add supabase/migrations/20260901102000_create_ai_generation_commands.sql apps/api/src/services/ai-generation-commands-migration-contract.test.ts apps/api/src/services/ai-generation-database.test.ts apps/api/src/scripts/ai-generation-database-smoke.ts apps/api/package.json
git commit -m "feat(ai): 增加生成任务原子命令"
```

---

### Task 7: 异步 Gateway、repository 与任务 HTTP 边界

**Files:**
- Create: `apps/api/src/repositories/ai-generation-jobs.ts`
- Create: `apps/api/src/repositories/ai-generation-jobs.test.ts`
- Create: `apps/api/src/services/ai-generation/job-service.ts`
- Create: `apps/api/src/services/ai-generation/job-service.test.ts`
- Create: `apps/api/src/services/ai-generation/private-payload-crypto.ts`
- Create: `apps/api/src/services/ai-generation/private-payload-crypto.test.ts`
- Create: `apps/api/src/services/ai-generation/gateway.ts`
- Create: `apps/api/src/services/ai-generation/gateway.test.ts`
- Create: `apps/api/src/services/ai-generation/index.ts`
- Create: `apps/api/src/schema/ai-generation.ts`
- Create: `apps/api/src/controllers/ai-generation/index.ts`
- Create: `apps/api/src/controllers/ai-generation/controller.test.ts`
- Modify: `apps/api/src/schema/ai-config.ts`
- Modify: `apps/api/src/services/ai-config.ts`
- Modify: `apps/api/src/controllers/ai-config/index.ts`

- [ ] **Step 1: 写四入口 RED 测试**

```ts
const text = await gateway.generateText(baseInput({ maxInputTokens: 500, maxOutputTokens: 300 }));
const image = await gateway.generateImage(baseInput({ count: 1, width: 1024, height: 1792 }));
const video = await gateway.generateVideo(baseInput({ durationSeconds: 5, width: 1080, height: 1920 }));
const speech = await gateway.generateSpeech(baseInput({ characterCount: 120, format: 'mp3' }));

expect([text, image, video, speech].map((job) => job.status))
  .toEqual(['queued', 'queued', 'queued', 'queued']);
expect(fetch).not.toHaveBeenCalled();
```

还要覆盖客户端不能传 model/price/generationNo，公开 DTO 不含 private payload、Prompt、provider
URL、object key、raw error；相同 key 同 hash replay，同 key异 hash 409。

- [ ] **Step 2: 运行确认 RED**

Run: `cd apps/api && bun test src/repositories/ai-generation-jobs.test.ts src/services/ai-generation/private-payload-crypto.test.ts src/services/ai-generation/gateway.test.ts`

Expected: FAIL，缺少模块。

- [ ] **Step 3: 实现 RPC repository 和错误清洗**

repository 只调用 Task 6 RPC；RPC data/error 都经 strict Zod 解析。同步 throw、Promise rejection、
Supabase error、raw `AppError` 全部收口为固定 `AI_GENERATION_DB_ERROR`，不透出 details。

私有 request snapshot 和包含供应商临时 URL 的 output 使用当前 Node/Bun `node:crypto` 实现
AES-256-GCM envelope，AAD 至少绑定 job ID、scope、purpose 和 key version。密钥只从
`AI_GENERATION_ENCRYPTION_KEY_V1` 读取，启动时校验 32 bytes；不得复用支付密钥、写入数据库或日志。
解密只发生在已 claim 的 Worker 内，轮换通过 `encryption_key_version` 选择受控旧 key。

- [ ] **Step 4: 实现四个 service 方法**

```ts
export interface AsyncAiGenerationGateway {
  generateText(input: GenerateTextJobInput): Promise<AiGenerationJob>;
  generateImage(input: GenerateImageJobInput): Promise<AiGenerationJob>;
  generateVideo(input: GenerateVideoJobInput): Promise<AiGenerationJob>;
  generateSpeech(input: GenerateSpeechJobInput): Promise<AiGenerationJob>;
}
```

每个方法只规范化业务输入、计算 request hash、调用 create RPC；保留旧
`apps/api/src/services/ai-gateway.ts` 原样兼容。

- [ ] **Step 5: 实现 Admin 任务路由**

```text
GET  /platform/ai-generation/jobs?page=1&pageSize=20
GET  /platform/ai-generation/jobs/:id
POST /platform/ai-generation/jobs/:id/cancel
POST /platform/ai-generation/jobs/:id/reconfirm-budget
POST /platform/ai-generation/jobs/:id/resolve-submission
POST /platform/ai-config/routes/:id/test
```

list 默认 20、最大 100；read 权限可读，cancel/reconfirm/resolve 需要 manage；Zod-before-service；
controller 不读取数据库、不计算预算、不包装原始错误。route test 只创建受预算约束、
`purpose=route_test` 的异步任务，不在 HTTP 内请求供应商；高费用测试仍先返回确认要求。

- [ ] **Step 6: focused 与兼容性验证**

Run: `cd apps/api && bun test src/repositories/ai-generation-jobs.test.ts src/services/ai-generation/job-service.test.ts src/services/ai-generation/gateway.test.ts src/controllers/ai-generation/controller.test.ts src/services/ai-gateway.test.ts`

Expected: 新接口全绿，旧同步网关测试无回归。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/repositories/ai-generation-jobs.ts apps/api/src/repositories/ai-generation-jobs.test.ts apps/api/src/services/ai-generation apps/api/src/schema/ai-generation.ts apps/api/src/controllers/ai-generation apps/api/src/schema/ai-config.ts apps/api/src/services/ai-config.ts apps/api/src/controllers/ai-config/index.ts
git commit -m "feat(ai): 增加异步多模态Gateway"
```

---

### Task 8: 四模态 OpenRouter Adapters 与未知提交恢复

**Files:**
- Create: `apps/api/src/services/ai-generation/openrouter-client.ts`
- Create: `apps/api/src/services/ai-generation/openrouter-client.test.ts`
- Create: `apps/api/src/services/ai-generation/adapters/types.ts`
- Create: `apps/api/src/services/ai-generation/adapters/text.ts`
- Create: `apps/api/src/services/ai-generation/adapters/image.ts`
- Create: `apps/api/src/services/ai-generation/adapters/video.ts`
- Create: `apps/api/src/services/ai-generation/adapters/speech.ts`
- Create: `apps/api/src/services/ai-generation/adapters/adapters.test.ts`

- [ ] **Step 1: 写 Adapter matrix RED 测试**

表驱动覆盖：

| 模态 | submit | 成功形态 | 恢复 | 费用关联 |
|---|---|---|---|---|
| text | Chat/Responses 合同探针确认的 endpoint | JSON | generation query | response/generation ID |
| image | `/api/v1/images` | JSON URL 或 bytes | generation query | response/generation ID |
| video | `/api/v1/videos` | async task | task query/content | task/generation ID |
| speech | `/api/v1/audio/speech` | audio bytes | generation query | response/generation ID |

测试必须覆盖 AbortController timeout、429、明确 4xx 未受理、网络超时 unknown、供应商 5xx、
malformed JSON、HTML 200、临时 URL 非 allowlisted host、redirect 到私网和缺 billing ID。

- [ ] **Step 2: 运行确认 RED**

Run: `cd apps/api && bun test src/services/ai-generation/openrouter-client.test.ts src/services/ai-generation/adapters/adapters.test.ts`

Expected: FAIL，缺少 adapters。

- [ ] **Step 3: 实现统一 client**

client 只接受 `https://openrouter.ai/api/v1` 基地址；固定 Authorization、HTTP-Referer、X-Title、
供应商幂等键；每次请求有绝对 deadline。错误归类使用 Task 1 合同，未知提交不被普通 retry
包装器重试。日志只记录 local job ID、endpoint kind、HTTP status、duration 和 safe code。

- [ ] **Step 4: 实现四个 Adapter**

所有 Adapter 实现：

```ts
export interface AiGenerationAdapter<Request> {
  validateCapability(model: AiModelCapability, request: Request): void;
  estimateMaximumCost(price: AiPriceSnapshot, request: Request): string;
  submit(input: AdapterSubmitInput<Request>): Promise<AdapterSubmitResult>;
  query(input: AdapterQueryInput): Promise<AdapterQueryResult>;
  cancel(input: AdapterCancelInput): Promise<AdapterCancelResult>;
  normalizeUsage(input: unknown): AdapterUsage;
}
```

能力探针标记 `cancel=false` 时 cancel 返回固定 unsupported 结果，不伪造成功。图片、视频、语音
只返回临时资产描述给 Worker，不直接写数据库或 COS。文本输出限制长度并 strict parse 业务响应。

- [ ] **Step 5: 验证无 fallback 歧义**

测试证明只有“明确未受理且 route 允许”的错误能切换 OpenRouter 内备用模型；
`submission_unknown`、计费已发生、内容安全、预算、能力和输入错误不切换。

同一步还必须锁定 Webhook Gate：只有 Task 1 fixture 明确给出签名算法、签名 header、时间窗与
replay key 且探针验签通过时，才在 controller 注册 raw-body Webhook 并写 provider event；否则构建
中不注册该路由，视频只使用有界轮询。两条分支都要有测试，禁止注册一个不验签的“备用”入口。

- [ ] **Step 6: focused 与 typecheck**

Run: `cd apps/api && bun test src/services/ai-generation/openrouter-client.test.ts src/services/ai-generation/adapters/adapters.test.ts && bun run typecheck`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/services/ai-generation/openrouter-client.ts apps/api/src/services/ai-generation/openrouter-client.test.ts apps/api/src/services/ai-generation/adapters
git commit -m "feat(ai): 增加OpenRouter多模态适配器"
```

---

### Task 9: 私有 COS 生成资产转存与补偿

**Files:**
- Create: `apps/api/src/services/files/platform-file-storage/legacy/generated-private-asset.ts`
- Create: `apps/api/src/services/files/platform-file-storage/legacy/generated-private-asset.test.ts`
- Modify: `apps/api/src/services/files/platform-file-storage/legacy-service.ts`
- Create: `apps/api/src/services/ai-generation/private-asset-store.ts`
- Create: `apps/api/src/services/ai-generation/private-asset-store.test.ts`
- Create: `apps/api/src/services/ai-generation/safe-download.ts`
- Create: `apps/api/src/services/ai-generation/safe-download.test.ts`

- [ ] **Step 1: 写下载安全和私有对象 RED 测试**

必须覆盖：

- 只允许探针 fixture 中的 HTTPS asset host；
- 每次 redirect 重新解析 DNS 并拒绝 loopback/private/link-local/metadata IP；
- Content-Length 缺失时仍以流式累计硬限制中断；
- magic bytes、MIME、最大尺寸/时长不一致失败；
- object key 为 `ai-generation/{scope}/{jobId}/{assetId}.{ext}` 且不含人员/客户文本；
- `platform_file_objects.visibility='private'`、`public_url=null`；
- COS put 成功但 DB bind 失败时写 asset intent `orphaned` 并尝试 delete；
- DB record 存在但 COS head 失败时不签发 URL；
- 签名 URL TTL 最大 600 秒，公开 DTO 不含 object key。

- [ ] **Step 2: 运行确认 RED**

Run: `cd apps/api && bun test src/services/ai-generation/safe-download.test.ts src/services/ai-generation/private-asset-store.test.ts src/services/files/platform-file-storage/legacy/generated-private-asset.test.ts`

Expected: FAIL，缺少新模块。

- [ ] **Step 3: 实现流式下载与媒体校验**

使用 `ReadableStream` 逐块 hash/write，不把视频整体读入 API 内存。下载默认硬限制：图片 20MB、
音频 100MB、视频 500MB；超限通过命名常量失败。临时文件使用 `mkdtemp`，所有路径在
`finally` 清理。媒体深度校验放在 Worker/ffprobe 边界，API 层只处理签名和 DTO。

- [ ] **Step 4: 实现私有 COS 专用方法**

在 `legacy-service.ts` 仅挂接以下方法，不修改 `uploadImage()` 的既有公开行为：

```ts
uploadGeneratedPrivateAsset(input: GeneratedPrivateAssetInput): Promise<PrivateAssetRecord>;
deleteGeneratedPrivateAsset(input: GeneratedPrivateAssetDeleteInput): Promise<void>;
signGeneratedPrivateAsset(input: GeneratedPrivateAssetSignInput): Promise<string>;
```

使用已安装 `cos-nodejs-sdk-v5@2.15.4` 的真实 `putObject/headObject/deleteObject/getObjectUrl` 类型。
先写 asset intent，再 put/head/checksum，再通过 Task 6 RPC 绑定 private file object；任何失败保留
安全补偿状态。

- [ ] **Step 5: focused 与现有上传回归**

Run: `cd apps/api && bun test src/services/ai-generation/safe-download.test.ts src/services/ai-generation/private-asset-store.test.ts src/services/files/platform-file-storage/legacy/generated-private-asset.test.ts src/services/files/platform-file-storage/legacy/direct-upload.test.ts`

Expected: PASS；现有公开图片上传合同不变。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/services/ai-generation/private-asset-store.ts apps/api/src/services/ai-generation/private-asset-store.test.ts apps/api/src/services/ai-generation/safe-download.ts apps/api/src/services/ai-generation/safe-download.test.ts apps/api/src/services/files/platform-file-storage/legacy/generated-private-asset.ts apps/api/src/services/files/platform-file-storage/legacy/generated-private-asset.test.ts apps/api/src/services/files/platform-file-storage/legacy-service.ts
git commit -m "feat(ai): 转存私有生成资产"
```

---

### Task 10: AI Generation Worker、租约与对账服务

**Files:**
- Create: `apps/api/src/services/ai-generation/worker-service.ts`
- Create: `apps/api/src/services/ai-generation/worker-service.test.ts`
- Create: `apps/api/src/services/ai-generation/usage-reconciliation.ts`
- Create: `apps/api/src/services/ai-generation/usage-reconciliation.test.ts`
- Create: `apps/api/src/workers/ai-generation-worker.ts`
- Create: `apps/api/src/workers/ai-generation-worker.test.ts`
- Create: `apps/api/src/workers/ai-generation-worker-health.ts`
- Create: `apps/api/src/workers/ai-generation-worker-health.test.ts`
- Modify: `apps/api/package.json`
- Modify: root `package.json`

- [ ] **Step 1: 写 Worker 生命周期 RED 测试**

通过依赖注入 fake repository/adapter/assetStore/clock/logger，覆盖：

```text
并发按 text/image/video/speech 独立限制
同一 tick 不重入
claim 后定时 heartbeat
SIGTERM 停止 claim 并等待当前任务
明确未受理按策略切备用模型
unknown 不重提
同步 text 完成无需 COS
image/video/speech 必须 COS bind 后完成
迟到 lease complete no-op
最多 3 次本地尝试、指数退避+抖动
临时目录 finally 清理
健康文件包含 last_tick_at、last_success_at、active_count、unknown_count
```

- [ ] **Step 2: 运行确认 RED**

Run: `cd apps/api && bun test src/services/ai-generation/worker-service.test.ts src/workers/ai-generation-worker.test.ts src/workers/ai-generation-worker-health.test.ts`

Expected: FAIL，缺少 Worker。

- [ ] **Step 3: 实现可测试 tick 与配置**

配置必须有界：

```ts
export type AiGenerationWorkerConfig = {
  enabled: boolean;
  pollIntervalMs: number;
  leaseMs: number;
  heartbeatMs: number;
  textConcurrency: number;
  imageConcurrency: number;
  videoConcurrency: number;
  speechConcurrency: number;
  batchSize: number;
};
```

`batchSize` 最大 20；每模态并发最大 8；heartbeat 必须小于 lease/3；无效 env 使用安全默认并记录
一次 warn，不允许无限并发或 0ms 轮询。

- [ ] **Step 4: 实现状态编排**

Worker 处理顺序：claim → 校验价格 hash/能力 → submit/query → safe download → private COS →
complete/settle。同步供应商返回也走同一租约。价格变化进入 awaiting reconfirmation；网络 unknown
只写 unknown；明确失败调用 fail RPC；媒体绑定前不得标 succeeded。

供应商返回中的临时 URL 或恢复 token 在写数据库前先用 Task 7 envelope 加密，provider event 只写
安全状态投影；临时结果最长保留 24 小时且不得超过官方有效期。补偿任务清除密文引用时保留
append-only event/ledger，不把 URL 解密后写入日志。

- [ ] **Step 5: 实现 usage reconciliation**

按 `billing_correlation_id` 每批最多 50 条查询 `/api/v1/generation?id=`，比较供应商金额与 ledger。
一致写对账 event；超过 reservation 标 overrun；缺 generation、币种或费用不合法进入人工列表，
不直接改账。任务列表不做 N+1：先分页取待对账 ID，再有界并发请求供应商。

- [ ] **Step 6: focused 与 typecheck**

Run: `cd apps/api && bun test src/services/ai-generation/worker-service.test.ts src/services/ai-generation/usage-reconciliation.test.ts src/workers/ai-generation-worker.test.ts src/workers/ai-generation-worker-health.test.ts && bun run typecheck`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/services/ai-generation/worker-service.ts apps/api/src/services/ai-generation/worker-service.test.ts apps/api/src/services/ai-generation/usage-reconciliation.ts apps/api/src/services/ai-generation/usage-reconciliation.test.ts apps/api/src/workers/ai-generation-worker.ts apps/api/src/workers/ai-generation-worker.test.ts apps/api/src/workers/ai-generation-worker-health.ts apps/api/src/workers/ai-generation-worker-health.test.ts apps/api/package.json package.json
git commit -m "feat(ai): 增加多模态生成Worker"
```

---

### Task 11: 运行记录、预算异常与 Admin 运维面板

**Files:**
- Create: `apps/api/src/services/ai-generation/operations-service.ts`
- Create: `apps/api/src/services/ai-generation/operations-service.test.ts`
- Modify: `apps/api/src/repositories/ai-generation-jobs.ts`
- Modify: `apps/api/src/repositories/ai-generation-jobs.test.ts`
- Modify: `apps/api/src/controllers/ai-generation/index.ts`
- Modify: `apps/api/src/schema/ai-generation.ts`
- Create: `apps/admin/components/platform-ai/ai-generation-operations-tab.tsx`
- Create: `apps/admin/components/platform-ai/ai-generation-operations-tab.test.ts`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-panel.tsx`
- Modify: `apps/admin/app/(console)/platform/ai-models/page.tsx`

- [ ] **Step 1: 写分页、权限和安全 DTO RED 测试**

API 必须支持：

```text
GET /platform/ai-generation/jobs?page=1&pageSize=20&status=&modality=&dateFrom=&dateTo=
GET /platform/ai-generation/summary?dateFrom=&dateTo=
GET /platform/ai-generation/reconciliation?page=1&pageSize=20&status=
GET /platform/ai-generation/issues?page=1&pageSize=20&kind=&status=
GET /platform/ai-generation/budget-policies?page=1&pageSize=20&dimension=&modality=&enabled=
POST /platform/ai-generation/budget-policies
PUT /platform/ai-generation/budget-policies/:id
POST /platform/ai-generation/jobs/:id/cancel
POST /platform/ai-generation/jobs/:id/reconfirm-budget
POST /platform/ai-generation/jobs/:id/resolve-submission
```

read 可查看，manage 可命令；列表最大 100；summary 由单个 bounded RPC 返回；所有 DTO 不含
private payload、Prompt、provider URL、COS key、raw error、API Key。`submission_unknown` 和
`billing_status=overrun` 分开筛选、分开显示。

summary 必须按 modality/model/scene 返回有界聚合：queue depth、queue age、duration、success/cancel
rate、unknown/expired lease、COS failure/orphan、reserved/actual/reconciliation delta，以及启用时的
Webhook signature failure/duplicate/late/poll recovery。issues 只返回 unknown、expired/stuck lease、
attempt exhausted、orphan asset/file 和 reconciliation mismatch 的安全投影，独立分页，不能只写日志。

阶段一预算端点只接受 platform scope，权限复用 `platform.ai_config.read/manage`；create 的
expected version 必须为空，update 必须携带 expected version。金额使用 decimal string wire，禁止
JS 浮点参与保存或比较。政策列表独立分页，不能塞进 summary 或一次返回全量。

- [ ] **Step 2: 运行确认 RED**

Run: `cd apps/api && bun test src/services/ai-generation/operations-service.test.ts`

Expected: FAIL，缺少 operations service。

- [ ] **Step 3: 实现 API orchestration**

service 复用 Task 7 repository，命令携带 expected version；cancel/reconfirm/resolve 返回当前 job；
列表和 summary 不并行读取每个 job 的 model/ledger/asset，数据库 RPC 直接返回必要安全投影。
预算 create/update 调用 `save_ai_budget_policy`，repository 对 RPC data/error 和分页行做 strict parse，
Supabase 原始错误统一清洗。

开发环境告警阈值使用有界配置并在 summary 中返回判定结果：`submission_unknown` 最老任务超过
5 分钟、expired lease 数量大于 0、reconciliation mismatch 大于 0、overrun 大于 0、orphan asset
大于 0，或 Worker `last_success_at` 超过 `max(60s, 2 * pollInterval)` 均为 warning。生产阈值必须由
运维配置明确提供，不把这些开发默认值悄悄当作生产策略。

- [ ] **Step 4: 写 Admin RED 测试**

测试覆盖任务状态、模态、耗时、预计/预占/实际费用、unknown 处理、overrun 调整提示、运维 issues
分页与处理状态、
平台月/日额度、员工日默认额度、各模态单任务上限与确认阈值、optimistic conflict、
loading/empty/error、reduced motion、长错误不撑破表格。按钮权限与 API 一致；read-only 用户不见
命令按钮。模型路由测试只生成异步 `route_test` job；低于阈值直接排队，高于阈值先展示预计
上限并要求二次确认，按钮提交中不会重复创建任务。

- [ ] **Step 5: 实现 Admin tab**

复用现有 Admin 设计：紧凑 summary、筛选、表格、分页和确认 Dialog；不做宣传 Hero、不使用
虚假进度。unknown 处理对话框只提供“供应商已受理”“有证据确认未受理”“关闭失败”三个受控
选项，并显示各自费用后果。

预算政策放在同一运维 tab 的独立 section：平台月/日额度与员工日默认额度使用结构化表单；
text/image/video/speech 各自配置单任务硬上限和二次确认阈值。提交时展示 decimal 原值、当前在途
预占和变更影响；409 保留编辑值并提示刷新，成功后等待最新分页目标刷新再显示成功。

- [ ] **Step 6: focused 与 Admin check**

Run: `cd apps/api && bun test src/services/ai-generation/operations-service.test.ts src/controllers/ai-generation/controller.test.ts`

Run: `pnpm --dir apps/admin exec bun test components/platform-ai/ai-generation-operations-tab.test.ts`

Run: `bun run api:check && bun run admin:check`

Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/services/ai-generation/operations-service.ts apps/api/src/services/ai-generation/operations-service.test.ts apps/api/src/repositories/ai-generation-jobs.ts apps/api/src/repositories/ai-generation-jobs.test.ts apps/api/src/controllers/ai-generation/index.ts apps/api/src/schema/ai-generation.ts apps/admin/components/platform-ai/ai-generation-operations-tab.tsx apps/admin/components/platform-ai/ai-generation-operations-tab.test.ts apps/admin/components/platform-ai/ai-model-routing-panel.tsx apps/admin/app/\(console\)/platform/ai-models/page.tsx
git commit -m "feat(admin): 增加AI生成运维面板"
```

---

### Task 12: 场景骨架、官方 typegen 与权限回归

**Files:**
- Create: `supabase/migrations/20260901103000_seed_social_media_ai_scenes.sql`
- Create: `apps/api/src/services/social-media-ai-scenes-migration-contract.test.ts`
- Modify: `apps/api/src/types/database.ts`
- Modify: `apps/api/src/services/platform-permission-boundary.test.ts`

- [ ] **Step 1: 写 inactive seed RED 合同**

只插入以下 `scene_code + quality_tier` 骨架，三档均 inactive、model null，不写真实 OpenRouter
model ID、价格或密钥：

```text
social_media_content_plan
social_media_script
social_media_storyboard
social_media_cover_image
social_media_scene_image
social_media_scene_video
social_media_voiceover
```

每个场景必须固定 modality；`ON CONFLICT` 只更新名称和基础安全上限，不覆盖管理员已有模型、
probe、价格、阈值或 status。权限继续复用 `platform.ai_config.read/manage`，不新增内容工作台权限。

- [ ] **Step 2: 运行确认 RED**

Run: `cd apps/api && bun test src/services/social-media-ai-scenes-migration-contract.test.ts`

Expected: FAIL，缺少 `20260901103000`。

- [ ] **Step 3: 实现 migration 并 local apply**

Run: `supabase db push --local --dry-run`

Expected: 只列 `20260901103000_seed_social_media_ai_scenes.sql`。

Run: `supabase db push --local && supabase migration list --local && supabase db push --local --dry-run`

Expected: 对齐且无 pending。

- [ ] **Step 4: 官方 typegen**

Run: `supabase gen types typescript --local > /tmp/gooes-ai-generation-database.ts`

先比较语义，再用项目现有格式替换 `apps/api/src/types/database.ts`；只允许本阶段表/RPC/列变化和
生成器尾空行差异。禁止手写 generated types。

- [ ] **Step 5: focused 与权限边界**

Run: `cd apps/api && bun test src/services/social-media-ai-scenes-migration-contract.test.ts src/services/platform-permission-boundary.test.ts && bun run typecheck`

Expected: PASS；inactive 场景调用稳定 `AI_MODEL_ROUTE_UNAVAILABLE`，不会落 legacy model。

- [ ] **Step 6: 提交**

```bash
git add supabase/migrations/20260901103000_seed_social_media_ai_scenes.sql apps/api/src/services/social-media-ai-scenes-migration-contract.test.ts apps/api/src/types/database.ts apps/api/src/services/platform-permission-boundary.test.ts
git commit -m "feat(ai): 增加自媒体AI场景骨架"
```

---

### Task 13: AI Worker 独立部署与路径感知发布

**Files:**
- Modify: `deploy/docker-compose.api.yml`
- Modify: `deploy/docker-compose.dev.yml`
- Modify: `.github/workflows/build-docker-images.yml`
- Modify: `.github/workflows/deploy-dev.yml`
- Modify: `.github/workflows/deploy-docker-services.yml`
- Modify: `scripts/resolve-dev-change-plan.mjs`
- Modify: `scripts/resolve-admin-release-services.mjs`
- Modify: `scripts/resolve-web-deployment.mjs`
- Modify: `scripts/verify-production-release-candidate.mjs`
- Modify: `apps/api/src/schema/release-deployments.ts`
- Modify: `apps/admin/components/ops/ops-types.ts`
- Modify: `apps/admin/components/ops/release-candidate-evidence.tsx`
- Create: `apps/api/src/workers/ai-generation-worker-release-contract.test.ts`
- Modify: `apps/web/tests/dev-change-plan.test.ts`
- Modify: `scripts/release-orchestration-contract.test.ts`
- Modify: `scripts/deploy-dev-workflow-contract.test.ts`

- [ ] **Step 1: 写服务枚举与路径映射 RED 测试**

必须证明：

```text
apps/api/src/services/ai-generation/** -> build api image, deploy ai-generation-worker
apps/api/src/workers/ai-generation-worker* -> build api image, deploy ai-generation-worker
apps/api/src/controllers/ai-generation/** -> build/deploy api，不自动重启 ai-generation-worker
无关 admin/web/domain/docs/tests -> 不部署 ai-generation-worker
选择 ai-generation-worker 发布时使用 GOOES_API_IMAGE，不新构建重复镜像
```

不要把所有 `apps/api/**` 再映射为所有 Worker；相关共享文件必须用显式 allowlist，未知 runtime
路径继续失败关闭为全量，而不是静默漏部署。

- [ ] **Step 2: 运行确认 RED**

Run: `bun test apps/web/tests/dev-change-plan.test.ts scripts/deploy-dev-workflow-contract.test.ts scripts/release-orchestration-contract.test.ts apps/api/src/workers/ai-generation-worker-release-contract.test.ts`

Expected: FAIL，服务枚举缺少 `ai-generation-worker`。

- [ ] **Step 3: 配置 production/dev Compose**

新增 profile worker：

```yaml
gooes-ai-generation-worker:
  image: ${GOOES_API_IMAGE:?set GOOES_API_IMAGE}
  restart: unless-stopped
  profiles: [workers]
  env_file:
    - ${GOOES_API_ENV_FILE:-./.env.api}
  environment:
    SERVICE_NAME: gooes-ai-generation-worker
    AI_GENERATION_WORKER_HEALTH_FILE: /tmp/gooes-ai-generation-worker-health
  command: ["bun", "src/workers/ai-generation-worker.ts"]
```

dev 使用 `gooes-ai-generation-worker-dev` 和既有 dev networks/env files。healthcheck 运行
`ai-generation-worker-health.ts`，不以“进程存在”冒充健康。

- [ ] **Step 4: 更新 release service 联合与 build/deploy workflow**

Admin/Schema/GitHub options 均增加中文“AI 生成 Worker”。生产候选和 rollback 必须能独立选择；
运行证据绑定 API image digest、commit SHA 和 container revision。Worker 源码未变时不得因普通 API
controller 变更自动 force-recreate。同步更新 release schema 的服务数组最大值，使其等于全部可选
非 `all` 服务数量；不得因仍写死 5 导致新服务组合被 Zod 拒绝。

- [ ] **Step 5: focused release tests**

Run: `bun test apps/web/tests/dev-change-plan.test.ts scripts/deploy-dev-workflow-contract.test.ts scripts/release-orchestration-contract.test.ts apps/api/src/workers/ai-generation-worker-release-contract.test.ts`

Expected: PASS。

- [ ] **Step 6: Compose config smoke**

Run: `docker compose -f deploy/docker-compose.api.yml --profile workers config --quiet`

Run: `docker compose -f deploy/docker-compose.dev.yml --profile workers config --quiet`

Expected: PASS；不启动或重启真实服务。

- [ ] **Step 7: 提交**

```bash
git add deploy/docker-compose.api.yml deploy/docker-compose.dev.yml .github/workflows/build-docker-images.yml .github/workflows/deploy-dev.yml .github/workflows/deploy-docker-services.yml scripts/resolve-dev-change-plan.mjs scripts/resolve-admin-release-services.mjs scripts/resolve-web-deployment.mjs scripts/verify-production-release-candidate.mjs apps/api/src/schema/release-deployments.ts apps/admin/components/ops/ops-types.ts apps/admin/components/ops/release-candidate-evidence.tsx apps/api/src/workers/ai-generation-worker-release-contract.test.ts apps/web/tests/dev-change-plan.test.ts scripts/release-orchestration-contract.test.ts scripts/deploy-dev-workflow-contract.test.ts
git commit -m "ci(ai): 增加AI生成Worker发布链路"
```

---

### Task 14: 阶段一完整 Gate、开发环境 smoke 与评审

**Files:**
- Create: `apps/api/src/scripts/ai-generation-live-smoke.ts`
- Create: `apps/api/src/scripts/ai-generation-live-smoke.test.ts`
- Modify: `apps/api/package.json`
- Verify: all Phase 1 files

- [ ] **Step 1: 写 live smoke 安全门控 RED 测试**

脚本必须拒绝：未设置 `AI_GENERATION_LIVE_SMOKE=1`、production deploy env、非开发 Supabase ref、
非 allowlisted OpenRouter/COS host。脚本使用固定无 PII 的 1 条文本、1 张 256/最小支持图片、1 段
最短视频和 1 段短配音；总预算硬上限由 `AI_GENERATION_LIVE_SMOKE_MAX_USD` decimal string 提供。

- [ ] **Step 2: 实现 smoke 与确定 cleanup**

smoke 流程：

1. 读取阶段一 capability fixture 与当前 active route；
2. 创建四任务并等待 Worker；
3. 验证 billing correlation、ledger、private file object、COS head、signed URL；
4. 对视频验证 submit/query/content；
5. 调 `/api/v1/generation?id=` 对账；
6. 删除临时 smoke COS 对象、把对应 file object 标记 deleted，并释放仍 active 的 reservation；
7. 保留带 `purpose=live_smoke` 的 job、provider event 与费用账本作为审计事实，不新增可删除账本的
   高危 cleanup RPC；
8. 任何异常都在 `finally` 执行可恢复清理，最后断言 active reservation、orphan asset intent 和
   临时 COS 对象均为 0，并打印不含密钥/URL/Prompt 的 JSON summary。

- [ ] **Step 3: fresh local database Gate**

Run: `supabase db reset --local`

Expected: 从空库完整重放至 `20260901103000`。

Run: `supabase migration list --local && supabase db push --local --dry-run`

Expected: 全部对齐、up to date。

Run: `cd apps/api && AI_GENERATION_DB_INTEGRATION=1 bun test src/services/ai-generation-database.test.ts`

Expected: PASS，fixture 和临时对象为 0、trigger 恢复 enabled。

- [ ] **Step 4: direct dev migration Gate**

只在开发项目已连接且 preflight 确认不是 production 后执行：

```bash
supabase db push --db-url "$DEV_DATABASE_URL" --include-all --dry-run
supabase db push --db-url "$DEV_DATABASE_URL" --include-all
supabase migration list --db-url "$DEV_DATABASE_URL"
supabase db push --db-url "$DEV_DATABASE_URL" --include-all --dry-run
```

Expected: pre-dry-run 精确列本阶段四条 migration，apply 成功，Local/Remote 对齐，post dry-run up to
date。若项目 paused、DNS 或连接失败，报告 blocker，不声称远端对齐，不绕过 migration 手工修库。

- [ ] **Step 5: 运行真实开发 smoke**

Run: `cd apps/api && AI_GENERATION_LIVE_SMOKE=1 bun --env-file=../../.env src/scripts/ai-generation-live-smoke.ts`

Expected: 四模态成功或按 capability fixture 明确跳过未启用模态；每个成功媒体均 private COS；总
actual cost 不超过 smoke 上限；OpenRouter generation 对账一致；可恢复资源 cleanup 成功且审计事实
仍可追溯。

- [ ] **Step 6: 全量静态与 focused 验证**

```bash
cd packages/domain && bun test src/ai-generation.test.ts && bun run build && bun run verify:packed-consumer
cd ../../apps/api && bun test src/services/ai-generation src/repositories/ai-generation-jobs.test.ts src/repositories/ai-model-catalog.test.ts src/controllers/ai-generation src/workers/ai-generation-worker.test.ts
cd ../../ && bun run api:check
pnpm --dir apps/admin exec bun test components/platform-ai
bun run admin:check
bun run check:permission-boundaries
bun run audit:supabase-writes
git diff --check
```

Expected: 全部 PASS；生产 TS/TSX 文件低于门禁；没有新增 `any/as any`、raw error、secret、debug
输出、无分页列表或 service-role 表直写。

- [ ] **Step 7: 独立 spec review 与 quality review**

先做规格审查，逐条对照总设计阶段一 8 项独立验收；修复后再做质量审查，重点检查外部调用
幂等、未知提交、预算并发、计费 overrun、COS 隐私、RPC ACL、Worker 关停和发布路径。Critical/
Important 必须清零；Minor 有明确非阻塞理由或在本阶段关闭。

- [ ] **Step 8: 提交 smoke 与最终证据**

```bash
git add apps/api/src/scripts/ai-generation-live-smoke.ts apps/api/src/scripts/ai-generation-live-smoke.test.ts apps/api/package.json
git commit -m "test(ai): 增加多模态生成发布门禁"
```

- [ ] **Step 9: 阶段一交付报告**

报告必须包含：commit 列表、RED→GREEN、local/direct migration 对齐、capability fixture hash、四模态
smoke、预算/账本 truth、COS private truth、ACL/RLS、EXPLAIN、Worker health、路径感知部署证据、
已知外部限制和阶段二前置条件。不得以“测试通过”替代真实 Gate 逐项证据。

---

## 阶段一完成定义

只有同时满足以下条件才可以把阶段一标记完成：

1. 四模态合同均由开发环境能力探针证明，无法证明的模态保持 disabled 且有明确 blocker；
2. 四个业务入口只创建异步本地任务，现有同步 `aiGateway.chat()` 无回归；
3. 平台预算预占、job 创建和 generation_no 在一个 RPC 内原子完成；
4. 真实并发证明预算不超卖、任务不双 claim、旧 lease 不覆盖；
5. unknown 不自动重提，价格变化必须重新确认，overrun 不污染生成状态；
6. 供应商费用能以 billing correlation ID 与账本对账；
7. 所有媒体只进入 private COS，签名访问、孤儿补偿和删除通过测试；
8. Admin 可同步预览/确认模型、配置质量路由、查看任务/unknown/overrun/对账；
9. AI Worker 可独立发布、独立健康检查，普通 API/Admin/Worker 无关变更不会重启它；
10. local migration 从空库重放成功，direct dev Gate 对齐或明确外部 blocker；
11. domain/API/Admin/permission/write-audit/diff 全绿，独立 spec/quality 无 Critical/Important；
12. 没有修改 orange、没有手工远端 DDL/DML、没有自动启用真实收费模型。

阶段一完成后，回到已批准的总设计，为“阶段二：内容项目与分镜”单独编写实施计划。不得在
阶段一顺手创建内容项目或自媒体生产页面。
