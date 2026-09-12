# 供应商目录 P0 合同与运行时核验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在写方舟目录适配器前，取得可追溯的中国区目录/签名合同及场景运行时证据，明确可实现与受阻边界。

**Architecture:** 只读仓库、官方文档/SDK及必要的开发库元数据，输出一个审计文档；不新增依赖、业务代码、测试伪接口或 migration。核验分项通过后再为独立交付批次写完整代码计划。

**Tech Stack:** Git、rg、gh、官方文档浏览、现有 Supabase/PostgreSQL 只读检查；不调用收费模型。

---

关联：[已批准设计](../specs/2026-09-11-ai-provider-catalog-system-scenes-design.md)、[整体依赖与文件地图](2026-09-11-ai-provider-catalog-system-scenes.md)。本计划只有核验和文档任务，因此没有实现代码步骤；不以未经验证的伪代码填充第三方合同。

## 文件职责

- Create: `docs/operations/evidence/2026-09-11-ai-provider-catalog-contract-audit.md`：来源、核验日期、版本、合同矩阵、调用链、只读结果和最终判定。
- Modify: `docs/superpowers/plans/2026-09-11-ai-provider-catalog-contract-audit.md`：仅在得到对应证据后勾选任务。
- Modify: `docs/superpowers/plans/2026-09-11-ai-provider-catalog-system-scenes.md`：记录分项 gate 对后续阶段的影响。
- Read: `apps/api/src/gateways/ark-rendering/README.md`、`client.ts`、`types.ts`；`services/ai-gateway.ts`；`services/ai-config/openrouter-model-sync.ts`；`repositories/ai-model-catalog.ts`；`services/system-settings/legacy/settings.ts`、`crypto.ts`；`schema/ai-secret-settings.ts`。

## Task 1：锁定本地基线与授权范围

- [x] **Step 1：核对隔离工作区与现有改动。**

```bash
pwd
git branch --show-current
git rev-parse HEAD
git status --short
```

预期位于现有 customer-rendering-library worktree、功能分支。脏文件必须识别归属，不 reset/checkout 覆盖，不操作 Orange。

- [x] **Step 2：重读设计及本地相关 AGENTS.md，记录授权界限。**

```bash
cat AGENTS.md supabase/AGENTS.md apps/api/src/controllers/AGENTS.md apps/api/src/schema/AGENTS.md
cat docs/superpowers/specs/2026-09-11-ai-provider-catalog-system-scenes-design.md
```

审计文档开头明确：只读核验，无密钥输出、无云写入、无收费调用、无发布。

- [x] **Step 3：核对真实依赖和已安装 API，禁止猜 SDK。**

```bash
rg -n 'volcengine|openai|zod|supabase' apps/api/package.json bun.lock pnpm-lock.yaml
rg -n 'createHmac|volcengineSign|ListEndpoints|ListFoundationModels' apps/api/src packages/domain/src
```

预期：当前没有火山 SDK 依赖；仓库其他云签名不等同于火山签名。将此事实记录，不执行安装。

## Task 2：核对中国区目录和凭证合同

- [x] **Step 1：获取官方来源，明确产品与地域。**

入口为中国区方舟官方文档和 API Explorer：

- `https://www.volcengine.com/docs/82379/1262849?lang=zh`
- `https://www.volcengine.com/docs/82379/1262847?lang=zh`
- `https://www.volcengine.com/docs/82379/1298459?lang=zh`
- `https://api.volcengine.com/api-docs/view?action=ListFoundationModels&serviceCode=ark&version=2024-01-01`
- `https://github.com/volcengine/volcengine-python-sdk`
- `https://github.com/volcengine/volc-sdk-nodejs`

这些是核验入口，不表示其中每个 Action/版本当前有效。记录实际标题、产品、版本及能够读取的内容。不可访问时记录失败，不循环请求相同失败 URL；可换官方 SDK、官方 API Explorer 或向用户请求不含凭证的文档导出。禁止用 BytePlus 国际区字段或第三方博客作为中国区合同。

- [x] **Step 2：只读核对官方 SDK 精确提交和目录。**

```bash
gh api repos/volcengine/volcengine-python-sdk --jq '{default_branch,pushed_at}'
gh api repos/volcengine/volc-sdk-nodejs --jq '{default_branch,pushed_at}'
gh api repos/volcengine/volc-sdk-nodejs/contents --jq '.[].name'
```

使用返回的真实默认分支/目录继续读取，固定精确 commit 后引用源码。不得把没有出现的类名/方法名写进实现计划。至少核对 ListEndpoints 的签名、分页和响应语义；分别寻找基础目录与版本列表，不将前者替代后者。

- [x] **Step 3：逐项填写合同判定，缺失项写具体受阻原因。**

审计矩阵逐行包含：基础模型列表、模型版本、账号接入点、模型开通/可见状态、输入输出模态、签名。每行写实际 host、region、Action/version/method 或路径、鉴权方式、必要 IAM List/Get 动作、分页字段/上限、总数/终止条件、允许投影的响应字段、限流/错误语义、官方来源及已验证/未验证结论。

必须区分官方模型族名、版本调用 ID、Endpoint ID；不能通过拼接名称猜调用 ID。缺少账号权限字段时状态必须是 unknown，不能由目录存在推导授权。

- [x] **Step 4：核对签名测试向量与依赖决策。**

在官方 Node SDK 当前源码中核对 request canonicalization、query/body/header 编码及签名示例，记录精确源文件/commit。若能用项目现有 Node crypto 实现，后续计划须提供官方向量先红后绿；若需要新增依赖，记录包名、真实导出、用途及替代方案，获得用户批准前不安装。

不创建 IAM 策略，不推测最小策略已生效，不发送现有推理 Key 测试管控接口。只读 AK/SK 尚未由用户安全配置时，明确实连未完成，不要求聊天中粘贴密钥。

- [x] **Step 5：决定目录分项 gate。**

仅当中国区基础目录、版本调用 ID、分页及鉴权均有官方证据时，标记 `ark_catalog_contract=PASS`。能力字段缺失可以保留 unknown，但不得宣称图片模型可绑定。只确认 ListEndpoints 时结果为 `ark_endpoints_contract=PASS`、`ark_catalog_contract=BLOCKED`，说明缺失证据，不能把它改名为完整目录交付。

## Task 3：核对场景到运行时的真实调用链

- [x] **Step 1：检索 Ark gateway 的业务使用。**

```bash
rg -n 'generateArkRendering|requestArkVision' apps/api/src
rg -n 'decoration_raw_drawing|sceneCode:|AI_SCENE_CODE|AI_SUMMARY_SCENE_CODE' apps/api/src/services apps/api/src/gateways --glob '!*.test.ts'
```

预期：目前 Ark 导出只有定义、测试和 README 引用；若执行时仍如此，记录未有业务调用链，不把单测成功当端到端接入。

- [x] **Step 2：读取调用方与路由解析，不根据名称推断功能。**

```bash
cat apps/api/src/gateways/ark-rendering/README.md apps/api/src/gateways/ark-rendering/types.ts
sed -n '100,230p' apps/api/src/services/ai-gateway.ts
sed -n '200,302p' apps/api/src/services/ai-config/index.ts
```

记录每个场景的固定编码、实际调用文件、输出模态、所需能力、运行时是否已接入。仅计费日志中的 scene_code 不能自动注册成可调用路由。待接入生图场景保留中文入口及“运行时未接入”状态；本 P0 不增加任务或运行时业务流程。

- [x] **Step 3：形成系统场景清单。**

核对设计首批 10 个编码；有额外实际调用点时列出证据并加入后续注册计划。中文名不作为身份，保留编码和值。区分系统场景、历史配置、仅计费用途，不混为一张可选清单。

## Task 4：只读核对历史数据与安全存储边界

- [x] **Step 1：核对真实列名和引用，再访问开发数据库。**

```bash
sed -n '1,165p' apps/api/src/repositories/ai-model-catalog.ts
sed -n '200,345p' apps/api/src/services/system-settings/legacy/settings.ts
cat apps/api/src/schema/ai-secret-settings.ts
```

记录单个配置值加密写入路径、generic 设置入口的权限/验证调用点，确认目录凭证不能加入推理引用 allowlist。

- [x] **Step 2：通过既有开发数据库只读通道执行有界核验。**

仅验证开发目标 `VM-0-11-ubuntu` / `43.165.126.30`；不打印连接 URL、环境或密钥。下面 SQL 不包含密钥列，只在确认目标后执行：

```sql
BEGIN READ ONLY;
SELECT scene_code, modality, quality_tier, status
FROM public.ai_scene_routes ORDER BY scene_code, quality_tier LIMIT 100;
SELECT scene_code, count(DISTINCT modality)
FROM public.ai_scene_routes GROUP BY scene_code
HAVING count(DISTINCT modality) > 1 LIMIT 100;
SELECT id, provider_id, model_name, modality, status
FROM public.ai_models
WHERE model_name = 'doubao-seedream-5-0-pro-260628'
ORDER BY id LIMIT 20;
SELECT conrelid::regclass AS referencing_table, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'f' AND confrelid = 'public.ai_models'::regclass
ORDER BY conrelid::regclass::text, conname LIMIT 100;
COMMIT;
```

到达 LIMIT 时继续分页，不宣称扫描完整。初步列出引用后按真实结构补充必要的只读引用检查；不得直接 UPDATE。此查询不证明型号真实存在，型号仍需官方目录精确确认。

- [x] **Step 3：记录历史处理结论。**

官方未找到该调用 ID 时不改 modality；有不兼容历史引用时不自动修复。若证据充分，给 P5 记录明确目标、现状断言、引用集合和安全修复条件，由后续 migration 完成。

## Task 5：自审、提交与后续计划选择

- [x] **Step 1：用 apply_patch 创建审计文档并写明分项结论。**

文档固定章节：范围/基线、官方来源矩阵、目录与签名 gate、运行时链路、场景清单、只读数据库证据、权限/加密边界、分项结论、后续允许的工作。

每个 BLOCKED 都须附具体证据缺口和可采取的下一步；不得写成项目永久不支持。没有执行的核验明确标记“未执行”，不能抄计划中的预期作为结果。

- [x] **Step 2：验证文档不含占位、密钥或无来源推断。**

```bash
git diff --check
rg -n 'TODO|TBD|待定|填入真实|Authorization:|Bearer ' docs/operations/evidence/2026-09-11-ai-provider-catalog-contract-audit.md
git status --short
```

预期第一条成功；第二条无匹配，出现匹配必须人工核对并消除秘密/占位。仅文档变更不运行无关构建，不报告应用测试通过。

- [x] **Step 3：仅提交本任务文件。**

```bash
git add docs/operations/evidence/2026-09-11-ai-provider-catalog-contract-audit.md docs/superpowers/plans/2026-09-11-ai-provider-catalog-contract-audit.md docs/superpowers/plans/2026-09-11-ai-provider-catalog-system-scenes.md
git diff --cached --check
git commit -m 'docs(ai): 记录供应商目录合同与场景运行时核验'
```

- [x] **Step 4：按证据进入下一子计划，不跳过门禁。**

P1 凭证计划与 P3 场景计划可以分别编写；P2 的每个 driver 需要对应合同通过。使用 writing-plans 为选定子计划提供准确文件、完整代码/测试补丁、TDD 步骤和最小验证，不能把本轮总览直接交给实现者猜 API。

如运行时缺口需要超出已批准范围的任务/计费流程，报告影响并请求范围确认；如果只是目录读取能力未核验，先继续可独立完成的本地工作。发布与收费调用继续要求单独授权。
