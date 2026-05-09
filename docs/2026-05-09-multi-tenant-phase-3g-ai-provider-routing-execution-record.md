# 多租户改造阶段 3G 执行记录：AI Provider 与场景路由

日期：2026-05-09

## 1. 本阶段目标

把后端非流式 AI 调用从“业务代码直连 DeepSeek/OpenAI 兼容接口”改成统一 `aiGateway`，并为后续平台级多供应商、多模型、按业务场景路由和租户用量统计打基础。

## 2. 已完成内容

### 2.1 数据结构

新增 migration：

```text
supabase/migrations/20260509183000_create_ai_provider_routing.sql
```

新增表：

- `ai_providers`：平台级 AI 供应商配置。
- `ai_models`：供应商下可用模型。
- `ai_scene_routes`：业务场景到模型的路由配置。
- `ai_call_logs`：AI 调用审计和 token 用量归因。

初始化默认数据：

- provider：`deepseek`、`openai`
- model：`deepseek-chat`
- scene：
  - `marketing_page_block_fill`
  - `marketing_page_settings_fill`
  - `social_video_script`
  - `customer_log_share_copy`
  - `decoration_qa`
  - `decoration_qa_title`

### 2.2 统一网关

新增：

```text
apps/api/src/services/ai-gateway.ts
```

能力：

- 按 `sceneCode` 读取 `ai_scene_routes`。
- 按路由选择 primary model。
- primary 调用失败时，如果配置了 fallback model，会自动尝试 fallback 一次。
- 支持场景级 `temperature`、`response_format`、`timeout_ms`。
- 兼容原有 `DEEPSEEK_API_KEY`、`AI_API_KEY`、`AI_MODEL`、`AI_CHAT_COMPLETIONS_URL`。
- 统一记录 `ai_call_logs`。
- 标准化记录 `prompt_tokens`、`completion_tokens`、`total_tokens`。
- 供应商未返回 token 时字段保留为空，不影响业务响应。

### 2.3 已迁移业务

以下非流式调用已迁移到 `aiGateway`：

- H5 活动页面模块 AI 回填。
- H5 活动页面整体配置 AI 回填。
- 客户施工日志分享文案生成。
- 自媒体短视频脚本生成。
- 装修问答非流式回答。
- 装修问答推荐问题生成。

## 3. 租户归因

`ai_call_logs.tenant_id` 用于记录本次 AI 调用归属：

- 自媒体短视频脚本：从 `social_video_transcriptions.tenant_id` 归因。
- 客户施工日志分享文案：从项目归属租户归因。
- 无明确租户上下文的 admin/H5 配置类 AI 调用暂记为空，后续 admin 完整租户上下文接入后再传入。

## 4. 未完成和后续项

- admin 系统配置页暂未提供 provider/model 可视化切换，本阶段只完成后端配置表和路由能力。
- 租户自带 AI Key 暂不支持，MVP 仍使用平台级 AI 配置。
- 装修问答流式接口仍保留现有直连实现；后续需要扩展 `aiGateway` 支持 stream 后再迁移。
- AI 用量日报表未实现；当前先落原始调用日志，后续可基于 `ai_call_logs` 汇总。

## 5. 验证

已执行：

```bash
bun run api:typecheck
bun run api:build
git diff --check
```

均通过。
