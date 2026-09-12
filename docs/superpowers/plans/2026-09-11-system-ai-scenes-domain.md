# 系统场景共享定义 P3-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在共享 domain 包中提供经过 P0 核验的固定场景身份与运行时状态，供后续 API/Admin 和注册 migration 使用。

**Architecture:** 一个只读常量注册集合、一个精确查找函数，复用已有 AiModality 类型，不添加数据库读写或第二套配置。已连接文本场景与待接入生图场景分开；本阶段仅交付共享包能力，不宣称路由防篡改或 UI 已接入。

**Tech Stack:** 现有 TypeScript、Bun test、@gooes/domain 构建；无新增依赖。

---

## 范围与先决条件

[P0 证据](../../operations/evidence/2026-09-11-ai-provider-catalog-contract-audit.md)的本地场景 SPEC 已通过；正式实施在该证据整体审查通过后开始。方舟目录映射受阻不影响该独立包功能。

使用已有 customer-rendering-library worktree，起点为 `31f597bf8`。P3-A 只涉及下列 4 个源码文件及本计划；后续 P3-B 负责注册 migration、legacy、后端身份派生和合并状态校验，P4 负责界面。不能将 P3-A 常量导出等同于后端已限制自由编码。

当前九个文本调用只传文字；decoration_qa 另有流式路径。raw drawing 仅有开发库配置，名称“装修生图”、输出 image；其两张参考图要求来自已批准的待接入 gateway 合同。元数据必须记录要求依据，不冒充已连接业务证据。

## 文件职责

- Create: `packages/domain/src/ai-scenes.ts`：固定身份、中文名称、输入/输出模态、运行时状态、输入要求依据及精确查找。
- Create: `packages/domain/src/ai-scenes.test.ts`：十个固定编码、模态、运行时/要求、不可变性、导出一致性和未知输入。
- Modify: `packages/domain/src/index.ts`、`packages/domain/src/shared.ts`：公开相同定义。
- Modify: 本计划：执行后记录证据，保持未做的阶段明确。

## Task 1：共享场景注册集合（单个独立实现任务）

- [x] **Step 1：写失败测试。** 使用 apply_patch 创建 `packages/domain/src/ai-scenes.test.ts`：

```ts
import { describe, expect, test } from 'bun:test';
import * as domain from './index';
import * as shared from './shared';

const expectedCodes = [
  'customer_log_share_copy', 'decoration_qa', 'decoration_qa_title',
  'decoration_raw_drawing', 'douyin_budget_explanation',
  'marketing_page_block_fill', 'marketing_page_create_fill',
  'marketing_page_settings_fill', 'project_operational_risk_summary',
  'social_video_script',
] as const;

describe('system AI scene definitions', () => {
  test('keeps the code type closed to registered identities', () => {
    const isClosed: string extends domain.SystemAiSceneCode ? false : true = true;
    expect(isClosed).toBe(true);
  });

  test('publishes the exact stable identities without billing-only scenes', () => {
    expect(Array.isArray(domain.SYSTEM_AI_SCENES)).toBe(true);
    expect(domain.SYSTEM_AI_SCENES.map(scene => scene.code).sort())
      .toEqual([...expectedCodes].sort());
    expect(new Set(domain.SYSTEM_AI_SCENES.map(scene => scene.code)).size).toBe(10);
    expect(domain.SYSTEM_AI_SCENES.length).toBeLessThanOrEqual(50);
  });

  test('keeps nine text runtimes distinct from the unconnected rendering scene', () => {
    const textScenes = domain.SYSTEM_AI_SCENES.filter(scene => scene.modality === 'text');
    expect(textScenes.length).toBe(9);
    for (const scene of textScenes) {
      expect(scene.runtime_status).toBe('connected');
      expect(scene.required_input_modalities).toEqual(['text']);
      expect(scene.requirements_source).toBe('runtime');
      expect(scene.min_reference_images).toBe(0);
    }
    expect(domain.findSystemAiScene('decoration_raw_drawing')).toEqual({
      code: 'decoration_raw_drawing', name: '装修生图', modality: 'image',
      required_input_modalities: ['text', 'image'], runtime_status: 'not_connected',
      requirements_source: 'planned_adapter', requires_streaming: false,
      min_reference_images: 2,
    });
  });

  test('retains historical names and only QA requires streaming', () => {
    expect(domain.findSystemAiScene('decoration_qa_title')?.name).toBe('装修问答标题生成');
    expect(domain.findSystemAiScene('social_video_script')?.modality).toBe('text');
    expect(domain.SYSTEM_AI_SCENES.filter(scene => scene.requires_streaming).map(scene => scene.code))
      .toEqual(['decoration_qa']);
  });

  test('uses exact code identity and never derives it from a label', () => {
    expect(typeof domain.findSystemAiScene).toBe('function');
    for (const code of ['装修问答', 'DECORATION_QA', ' decoration_qa ', '',
      'douyin_transcription', 'unknown_legacy', '__proto__']) {
      expect(domain.findSystemAiScene(code)).toBeUndefined();
    }
    const scene = domain.findSystemAiScene('decoration_qa');
    expect(scene?.code).toBe('decoration_qa');
    expect(scene).toBe(domain.SYSTEM_AI_SCENES.find(item => item.code === 'decoration_qa'));
  });

  test('exposes immutable definitions consistently through both barrels', () => {
    expect(shared.SYSTEM_AI_SCENES).toBe(domain.SYSTEM_AI_SCENES);
    expect(shared.findSystemAiScene).toBe(domain.findSystemAiScene);
    expect(Object.isFrozen(domain.SYSTEM_AI_SCENES)).toBe(true);
    for (const scene of domain.SYSTEM_AI_SCENES) {
      expect(Object.isFrozen(scene)).toBe(true);
      expect(Object.isFrozen(scene.required_input_modalities)).toBe(true);
    }
  });
});
```

- [x] **Step 2：运行 RED。** 从 packages/domain 执行 `bun test ./src/ai-scenes.test.ts`。预期首项在“数组导出不存在”断言失败，其他测试可能因尚未导出而失败；不是导入第三方 API 或环境错误。记录退出码与失败原因后才写生产实现。

- [x] **Step 3：最小实现。** 创建 `packages/domain/src/ai-scenes.ts`，完整内容：

```ts
import type { AiModality } from './ai-generation';

export interface SystemAiSceneDefinition {
  readonly code: string;
  readonly name: string;
  readonly modality: AiModality;
  readonly required_input_modalities: readonly AiModality[];
  readonly runtime_status: 'connected' | 'not_connected';
  readonly requirements_source: 'runtime' | 'planned_adapter';
  readonly requires_streaming: boolean;
  readonly min_reference_images: number;
}

const TEXT_INPUT = Object.freeze(['text'] as const);
const RENDERING_INPUT = Object.freeze(['text', 'image'] as const);

function textScene<const Code extends string>(
  code: Code,
  name: string,
  requiresStreaming = false,
) {
  return Object.freeze({
    code, name, modality: 'text' as const,
    required_input_modalities: TEXT_INPUT,
    runtime_status: 'connected' as const,
    requirements_source: 'runtime' as const,
    requires_streaming: requiresStreaming,
    min_reference_images: 0,
  });
}

// 固定十项内部注册信息（<= 50），不是无上限业务列表；扩展时同步检查容量测试。
// 名称是展示文案，code 是已有调用身份，不得由名称重新生成。
export const SYSTEM_AI_SCENES = Object.freeze([
  textScene('customer_log_share_copy', '客户施工日志分享文案'),
  textScene('decoration_qa', '装修问答', true),
  textScene('decoration_qa_title', '装修问答标题生成'),
  Object.freeze({
    code: 'decoration_raw_drawing', name: '装修生图', modality: 'image',
    required_input_modalities: RENDERING_INPUT,
    runtime_status: 'not_connected', requirements_source: 'planned_adapter',
    requires_streaming: false, min_reference_images: 2,
  } as const),
  textScene('douyin_budget_explanation', '抖音预算初算解释'),
  textScene('marketing_page_block_fill', 'H5 活动页模块 AI 回填'),
  textScene('marketing_page_create_fill', 'H5 活动页创建 AI 回填'),
  textScene('marketing_page_settings_fill', 'H5 活动页配置 AI 回填'),
  textScene('project_operational_risk_summary', '项目运营风险摘要'),
  textScene('social_video_script', '短视频脚本生成'),
] as const satisfies readonly SystemAiSceneDefinition[]);

export type SystemAiSceneCode = (typeof SYSTEM_AI_SCENES)[number]['code'];

export function findSystemAiScene(code: string): SystemAiSceneDefinition | undefined {
  return SYSTEM_AI_SCENES.find(scene => scene.code === code);
}
```

在两个现有 barrel 各添加一行 `export * from './ai-scenes';`，不改其他导出、不替换业务调用、不访问数据库。

- [x] **Step 4：GREEN 与构建。** 从 packages/domain 执行：

```bash
bun test ./src/ai-scenes.test.ts ./src/ai-generation.test.ts ./src/customer-rendering.test.ts
bun run build
```

预期 19 tests pass / 0 fail，构建执行 TypeScript 与包内 verify-build，均退出 0。编译期检查必须保证 SystemAiSceneCode 不是宽泛 string；不得为满足 matcher 类型而给注册集合添加宽泛数组注解。追加只读 dist 消费检查：

```bash
node --input-type=module -e 'import {SYSTEM_AI_SCENES,findSystemAiScene} from "./dist/index.js"; if(SYSTEM_AI_SCENES.length!==10 || findSystemAiScene("decoration_raw_drawing")?.runtime_status!=="not_connected") process.exit(1); console.log("scene exports verified");'
```

如果构建发现库/API 真实类型问题，先查已安装导出，不猜类型、不跳过检查。dist 是构建输出，不提交；不运行 clean、prepack 或任意递归删除。

- [x] **Step 5：自审并提交。** 从 worktree 根：

```bash
git diff --check
git add packages/domain/src/ai-scenes.ts packages/domain/src/ai-scenes.test.ts packages/domain/src/index.ts packages/domain/src/shared.ts
git diff --cached --check
git commit -m 'feat(ai): 增加固定系统场景共享定义'
```

仅提交上述源码。实现者汇报红绿输出及 SHA；主代理再派独立 SPEC 和质量审查，修复后复审。若审查指出需求超出 P3-A，明确归属后续阶段，不能把未实现的 API/UI 标成完成。

## 后续阶段边界

- P3-B：用 migration 建注册表、兼容 legacy、限制身份修改；后端创建派生与 PATCH 合并完整主备状态后验证；列表分页与权限。此处没有这些实现，不部署本阶段声称其生效。
- P4：将后台自由编码输入换成系统场景选择，只读编码/模态；候选自动加载与竞态处理。
- P1/P2：独立目录凭证、目录适配与快照；方舟调用 ID 门禁按 P0 保留。

## 执行记录

基线最小回归：13 pass / 0 fail / 52 assertions（ai-generation + customer-rendering，2026-09-11）。

实施已完成：`c34921b26` 增加四个约定源码文件的变更，`e2db8614a` 修复编码类型扩宽。初次测试 RED 为 0 pass / 5 fail（缺少导出）。实现者曾为满足 matcher 类型给集合添加宽泛数组注解，主代理检查发现这使 SystemAiSceneCode 退化为 string；新增编译期测试先取得 TS2322，再移除宽泛注解、将 expectedCodes fixture 固定为 as const，恢复字面量联合。计划测试已同步补上该回归。

主代理独立复跑：19 pass / 0 fail / 131 assertions；domain build（含 TypeScript 和 verify-build，dist 159651 bytes）、构建产物导出检查、`bun run api:typecheck` 均退出 0。SPEC 及最终质量审查通过，无 Critical/Important/Minor；审查者另独立运行 19 项测试及 domain tsc。

只提交源码与记录，未提交 dist、修改依赖或执行数据库/云端/发布操作。P3-A 可交付，P3-B 后端与 migration、P4 界面尚未实现；现有供应商下拉问题不能据此宣布修复。
