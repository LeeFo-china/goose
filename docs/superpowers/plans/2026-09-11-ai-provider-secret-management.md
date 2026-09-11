# AI 供应商密钥管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** 实施已确认的供应商密钥管理设计，提供安全录入和只读配置状态。

**Architecture:** 继续引用四项登记的 AI system_settings，通过聚焦 service 复用既有加密写入链路。Admin 独立管理引用与密钥；所有状态不代表真实模型验证。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Next.js、现有 shadcn/Radix。

## Task 1: 后端密钥边界

Files: 新增 `apps/api/src/schema/ai-provider-secrets.ts`、`services/ai-config/provider-secrets.ts` 及邻近测试；修改 `controllers/ai-config/index.ts`、`services/ai-config/index.ts`，按需扩展 `repositories/system-settings.ts` 的有界查询。

- [x] 先补失败测试，再实现下列 HTTP 合同：

```ts
// GET /platform/ai-config/secret-settings
type SecretSetting = {
  key: string;
  name: string;
  source: 'database' | 'env' | 'empty';
  status: 'configured' | 'empty' | 'invalid';
};
// ResponseHandler.success({ list: SecretSetting[] })
// PATCH /platform/ai-config/secret-settings/:key
// strict body: { value: nonempty trimmed string (max 8192) }
// ResponseHandler.success({ key, saved: true })
```

- [x] 元数据只返回四项登记 AI 敏感配置，不解密，单次有界读取；验证平台身份与 AI/system_setting 双权限。写入复用 updateSetting，不回传其完整记录；错误和审计不得携带值。
- [x] 供应商新增／显式变更引用验证允许集合，省略引用不改变历史值；已有异常值不向客户端原样回传。旧供应商其他操作兼容。
- [x] 运行 `cd apps/api && bun test ./src/services/ai-config ./src/schema/ai-provider-secrets.test.ts ./src/controllers/ai-config`，确认正向、越权、空输入、脱敏与异常行为。

## Task 2: Admin 密钥编辑

Files: 新增 `apps/admin/components/platform-ai/ai-provider-secret-editor.tsx` 及测试；修改 `ai-model-routing-sections.tsx`、`ai-model-routing-panel.tsx`、`ai-model-routing-shared.ts`，新增必要的纯状态/请求模块。

- [x] 先补请求和状态失败测试；元数据契约与 Task 1 一致。
- [x] 使用已安装 Select 替代自由文本引用；OpenRouter 固定引用。保存引用后，独立 Dialog 发送非空 PATCH。
- [x] 核心请求语义：

```ts
const value = input.trim();
if (!value) return;
await requestBackend(`/platform/ai-config/secret-settings/${encodeURIComponent(key)}`, {
  method: 'PATCH', body: JSON.stringify({ value }),
});
```

- [x] 状态加载失败独立展示；403 不影响原列表；切换供应商/关闭时清空秘密，未保存引用不允许写密钥。显示共享影响及“已配置（未验证）”。不自动重试写操作。
- [x] 运行 Admin 对应 Bun 测试和 `pnpm --dir apps/admin exec tsc --noEmit`。

## Task 3: 系统配置 AI 空输入防护

Files: `apps/admin/components/settings/settings-actions.tsx`、新增邻近纯规则模块及测试。

- [x] 先写回归测试：上述四项 AI secret 空白不得发送 null；非 AI 配置仍允许旧清空行为。
- [x] AI 编辑器空白时禁用保存并在 submit 内提前返回，文案明确留空不修改；保留非 AI 路径。
- [x] 运行规则测试及既有 settings 回归。

## Task 4: 审查与发布准备

- [x] 先做设计符合性独立审查，再做安全/质量审查，修复并复审。
- [x] API/Admin 静态检查通过后做浏览器 mock 验收；不把 mock 计为真实联调。
- [x] 将旧测试完整凭据形态替换成明确合成的负例，并保留原用例语义；不绕过 GitHub 保护，不强推共享历史。
- [x] 运行相关测试、`git diff --check`，记录通过项和剩余阻塞。开发迁移和部署必须另行满足既有备份、精确迁移及固定版本门禁，本轮不能越过。

执行方式：当前会话逐项实施，不重复索取已确认设计的批准。所有外部真实凭据均由用户在后台录入。

## 执行结果

- [x] Task 1 后端实现、失败先行回归、双权限与加密／审计验证完成。
- [x] Task 2 Admin 引用选择、密钥弹窗、状态和失败路径完成。
- [x] Task 3 AI 空白防护与非 AI 兼容回归完成。
- [x] Task 4 本地规格／质量复审、类型检查、API 构建、相关测试及浏览器 mock 验证完成；源码夹具已清理。
- [x] 后续运维：保留原功能分支，使用同树独立发布历史推送固定版本；开发备份、精确两条 migration、614 条 CLI 对齐及 API/Admin 部署完成，未填写真实密钥或调用模型。见 `docs/operations/evidence/2026-09-11-rendering-library-ai-secrets-dev-release.md`。

实际文件及验证命令／结果见 `docs/superpowers/specs/2026-09-11-ai-provider-secret-management-progress.md`。任务分解中的源文件名允许按职责使用实际命名 `schema/ai-secret-settings.ts` 和 `services/ai-config/secret-settings.ts`，未改变合同或范围。
