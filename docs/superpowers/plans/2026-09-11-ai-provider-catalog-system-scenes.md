# 供应商目录与系统场景实施总览

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后端维护供应商模型目录，Admin 自动加载匹配模型，业务场景编码由系统注册且不可被运营改写。

**Architecture:** 复用现有目录快照、模型、路由、密钥加密及权限机制。目录获取通过供应商 gateway 隔离；系统场景在 domain 定义、通过 migration 注册。先完成官方合同和运行时接入核验，再编写受这些结果约束的具体实现，禁止预先猜测第三方 API。

**Tech Stack:** Bun、TypeScript、Fastify、Supabase/PostgreSQL、Next.js、现有 shadcn/local 组件、Bun test、Playwright。当前项目没有安装火山 SDK，不假设可直接导入；不新增依赖。

---

## 已批准设计与实施边界

- [设计](../specs/2026-09-11-ai-provider-catalog-system-scenes-design.md) 已获用户“确认”；目录 AK/SK 独立安全配置已获“允许”。
- 使用现有 `/Users/leefo/Public/work/gooes/.worktrees/customer-rendering-library`、`feature/customer-rendering-library`，不新建嵌套 worktree，不操作 main/Orange。
- 本次批准进入实施计划，不包含新的开发/生产发布、真实凭证录入、收费模型调用、IAM 修改或云端接入点创建。
- 该设计有可分离交付批次，按 writing-plans 的 scope check 拆成分阶段计划。此文件是依赖与验收总览；当前可执行的首阶段为 [合同与运行时核验计划](2026-09-11-ai-provider-catalog-contract-audit.md)。后续代码计划必须基于首阶段证据编写，不能将本总览当成可直接执行的代码补丁。

## 阶段依赖与完成条件

| 阶段 | 内容 | 开始条件 | 独立完成证据 |
| --- | --- | --- | --- |
| P0 | 中国区模型目录、签名、运行时及历史数据核验 | 设计批准 | 有来源的合同矩阵、运行时调用链、明确 PASS/BLOCKED 判定 |
| P1 | 目录 AK/SK 成对加密配置 | P0 已确认凭证用途；不依赖目录全量成功 | 原子保存、用途隔离、权限/脱敏测试和迁移执行证据 |
| P2 | 通用目录快照、同步适配和分页查询 | 对应 driver 的 P0 合同通过 | 完整快照、限额/并发/失败保留、旧 OpenRouter 回归 |
| P3 | 系统场景注册与后端防篡改 | P0 场景清单核验完成，可与 P2 分开交付 | 注册 migration、固定编码兼容、派生模态与权限测试 |
| P4 | Admin 自动候选、同步/凭证入口、只读场景身份 | P1/P2/P3 接口稳定 | 自动加载、分页、过期响应、加载/空/错、权限和窄屏 E2E |
| P5 | 精确历史修复与联合验收 | 官方型号精确确认，全部引用核对完成 | 条件化 migration、真实 PG、类型/构建及回归；未确认则不修数据 |
| P6 | 开发 migration 与固定版本发布 | 联合验收通过且用户另行授权发布 | 备份、Local/Remote 对齐、API/Admin digest/revision/health 与 smoke |

P0 的方舟基础目录合同未通过，不阻止已经核实的安全凭证或系统场景工作；但 P2 的方舟实现不能用假数据、国际区合同或账号接入点列表替代全部模型目录后宣称完成。

## 代码边界地图

以下是后续子计划应覆盖的文件职责，不是本轮创建源码文件的授权步骤。第三方字段和具体代码必须来自 P0，子计划须提供完整补丁与测试代码。

### P1：目录凭证

- 新增 `apps/api/src/schema/ai-catalog-credentials.ts`：严格 AK/SK 请求合同及加密值编码/解码，独立于推理密钥引用 allowlist。
- 新增 `apps/api/src/services/ai-config/catalog-credentials.ts`：平台权限、元数据、成对一次替换、固定错误响应；不返回密钥片段。
- 修改 `apps/api/src/controllers/ai-config/index.ts`：独立目录凭证 HTTP 入口，权限前置、private/no-store。
- 修改 `apps/api/src/services/system-settings/legacy/definitions-ai-social.ts`、`settings.ts`：注册 `ARK_CATALOG_CREDENTIALS`，阻止通用设置入口绕过结构/权限校验，复用一次加密写入。
- 修改 `apps/api/src/repositories/system-settings.ts`：只查询必要元数据，不把凭证加入推理引用列表。
- 新增对应同目录 `.test.ts`；扩展 `apps/api/src/controllers/ai-config/secret-settings.test.ts` 验证原功能保持。
- 通过 `supabase migration new add_ark_catalog_credentials` 创建种子 migration，真实文件名记录到子计划；不预造时间戳、真实值或未经检查的写入。

### P2：目录获取与存储

- 新增 `apps/api/src/gateways/ai-catalog/`：按 P0 决定的中国区合同拆分签名、HTTP 限额、响应校验及各 driver 获取；不得复制独立一套模型表。
- 新增 `apps/api/src/schema/ai-catalog.ts` 和 `services/ai-config/catalog-sync.ts`：driver、同步命令、规范化快照、状态和权限。
- 修改 `repositories/ai-model-catalog.ts`：复用已有表，通用 RPC 与必要字段分页查询；旧 OpenRouter 入口继续受限。
- 修改 `schema/ai-config.ts`、`services/ai-config/index.ts`、`controllers/ai-config/index.ts`：目录配置/同步/候选/落实模型时的强制复验。
- `openrouter-model-sync.ts`、`openrouter-catalog-projection.ts`：提取必要共用部分，旧目录接口与行为回归，不顺手重构整个 AI 服务。
- 通过 `supabase migration new generalize_ai_provider_catalog` 管理 driver、未知模态的目录层表示、并发和完整快照保护、索引/RPC/授权。
- 新增 gateway/service/repository 单测和 `supabase/tests/ai_provider_catalog.sql`，覆盖 P0 的真实合同夹具，不能只靠字符串匹配测试验证 SQL。

### P3：系统场景

- 新增 `packages/domain/src/ai-scenes.ts`、`ai-scenes.test.ts` 并修改 `src/index.ts`：稳定编码、中文名、输出模态、必要能力；未知历史编码不能直接冒充系统场景。
- 新增 `apps/api/src/repositories/ai-scenes.ts`、`services/ai-config/system-scenes.ts`：有界注册场景查询、按服务端场景身份派生值、legacy 兼容。
- 修改 `schema/ai-config.ts`、`controllers/ai-config/index.ts`、`services/ai-config/index.ts`：禁止篡改已有路由身份/模态，拒绝重复 scene+tier 和无效新场景。
- 通过 `supabase migration new register_system_ai_scenes` 创建注册表、历史保留、固定种子和约束，冲突模态预检失败即停止。
- 新增单测和 `supabase/tests/ai_system_scenes.sql`。引用场景的业务服务仅替换为已验证的共享常量，值不变，不改计费、档位选择或任务流程。

### P4：交互

- 新增 `apps/admin/components/platform-ai/ai-catalog-credential-editor.tsx` 与状态/测试文件：独立 AK/SK 弹窗，成对保存，关闭清空，禁止部分更新和自动重试。
- 新增 `ai-route-model-selector.tsx` 与状态/测试文件：候选加载、分页、状态提示及主备独立的请求序号/取消；具体第三方导出先查已安装类型。
- 修改 `ai-model-route-tab.tsx`、`ai-model-routing-panel.tsx`、`ai-model-routing-sections.tsx`、`ai-config-types.ts`、`ai-model-routing-shared.ts`：系统场景选择、只读身份/模态、driver/同步入口，复用既有组件。
- 修改 `apps/admin/app/api/backend/[...path]/route.ts` 及其测试：新密钥入口与既有密钥同等不缓存/不泄密，禁止改变其他代理请求语义。
- 新增 `apps/admin/e2e/ai-provider-catalog-scenes.spec.ts`；扩展现有 `ai-provider-secrets-mock-backend.mjs` 与 `playwright.ai-provider-secrets.config.ts`，保持原删除/密钥 11 项回归。

## 统一验证要求

后续每个代码子计划必须逐任务列出：准确改动文件、完整测试/实现补丁、先红后绿、最小静态检查、提交命令。核验失败不带入下一任务，不把记录状态替代已执行证据。

基础命令（从 worktree 根执行，运行后记录真实输出）：

```bash
bun run api:typecheck
pnpm --dir apps/admin check
bun run api:build
bun scripts/check-api-file-size.ts
```

API 回归（从 `apps/api` 执行）：

```bash
bun test ./src/services/ai-config ./src/controllers/ai-config ./src/schema/ai-config.test.ts ./src/repositories/ai-config.test.ts ./src/repositories/ai-provider-delete.test.ts ./src/gateways/ark-rendering/client.test.ts
```

Admin 回归（从 `apps/admin` 执行）：

```bash
bun test ./components/platform-ai ./components/settings './app/api/backend/[...path]/route.test.ts'
env -u NO_COLOR pnpm exec playwright test --config=playwright.ai-provider-secrets.config.ts
```

新增测试必须加入相应子计划命令，不以这些既有测试代替新功能验收。数据库测试只在隔离实例执行 fixture，应用库仅受审阅 migration 修改。所有列表默认 20、最大 100，目录 10,000 项/100 请求/60 秒总时限/10 秒单请求/8 MiB 单响应/32 MiB 总响应，超限保留旧快照。

## 计划进度与交付界限

- [x] 用户批准设计和目录 AK/SK 配置范围。
- [x] 完成分阶段依赖、文件职责及验收总览。
- [x] 编写可执行的 P0 合同/运行时核验计划。
- [x] 执行 P0，提交有证据的判定。
- [ ] 按 P0 结果逐批编写并执行 P1–P5 的代码计划。
- [ ] 联合验收后报告结果，等待独立发布授权。

未完成的阶段是明确的实施依赖，不代表已经写好或已经实现。不能跳过 P0 直接给方舟适配器编造完整实现。

2026-09-11 P0 已完成且通过 SPEC/质量审查，见[核验证据](../../operations/evidence/2026-09-11-ai-provider-catalog-contract-audit.md)。基础模型元数据与公开签名样例已核实；方舟完整目录仍受“版本到推理 Model ID 映射未核实”门禁限制，接入点分页合同仅部分核实，历史模型未改。独立进入 [P3-A 共享定义代码计划](2026-09-11-system-ai-scenes-domain.md)，不将 P3-A 等同于整个 P3 或 Admin 修复。

P3-A 已实现并经 SPEC/质量审查：十个稳定编码、已接入/计划能力区分、不可变导出与精确查找；19 项测试、domain 构建、产物消费与 API 类型检查通过。代码提交 `c34921b26`、`e2db8614a`。下一批 P3-B 仍须编写并实施注册 migration、legacy 兼容及后端派生/合并状态校验的具体计划；目录、凭证和 UI 阶段没有因此完成。未发布。
