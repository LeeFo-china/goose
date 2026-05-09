# 阶段 3G Admin 对接说明：AI Provider 与场景路由

日期：2026-05-09

## 1. 对 admin 的影响

本阶段主要是后端内部改造，admin 现有 AI 功能接口不变。

已接入统一 AI 网关的 admin 相关能力：

- H5 活动页面模块配置 AI 回填。
- H5 活动页面整体配置 AI 回填。
- 自媒体短视频脚本生成相关接口。
- 装修问答非流式接口。

admin 不需要新增请求参数，也不需要改现有页面调用方式。

## 2. 新增后端配置能力

后端新增平台级配置表：

- `ai_providers`
- `ai_models`
- `ai_scene_routes`
- `ai_call_logs`

当前阶段 admin 还没有 provider/model 管理页面。平台运维或后端可通过数据库配置不同场景使用的模型。

## 3. 场景编码

当前已初始化的 `scene_code`：

| scene_code | 用途 |
| --- | --- |
| `marketing_page_block_fill` | H5 活动页模块配置回填 |
| `marketing_page_settings_fill` | H5 活动页整体配置回填 |
| `social_video_script` | 短视频文案生成 |
| `customer_log_share_copy` | 客户施工日志分享文案 |
| `decoration_qa` | 装修问答 |
| `decoration_qa_title` | 装修问答推荐问题 |

## 4. 后续 admin 可做事项

后续建议新增“平台 AI 配置”页面：

- 管理 provider。
- 管理 provider 下的 model。
- 配置每个业务场景的 primary model 和 fallback model。
- 查看 `ai_call_logs` 的调用量、失败率和 token 用量。

该页面属于平台超管能力，不应开放给普通租户管理员。

## 5. 注意事项

- 本阶段不支持租户自带 AI Key。
- AI API Key 仍属于平台级敏感配置。
- 如果某个供应商不返回 token usage，日志中的 token 字段会为空，admin 统计时不能把空值当真实 0 计费。
