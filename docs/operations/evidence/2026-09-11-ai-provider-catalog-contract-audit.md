# 供应商目录与系统场景 P0 核验

日期：2026-09-11。结论：本地场景/凭证边界核验完成；中国区基础模型元数据与签名已核实，目录版本到推理 Model ID 的自动映射仍受阻。没有实现模型同步或修复线上选择器。

## 范围与基线

- 工作区：`/Users/leefo/Public/work/gooes/.worktrees/customer-rendering-library`，分支 `feature/customer-rendering-library`，起点 `31f597bf8c81fce0e339f591429dcd6d62cf2fd8`；开始时干净，确认是 linked worktree、不是 submodule。
- 已读取根、Supabase、API controller/schema 的 AGENTS.md 及已批准设计。只读官方公开文档、仓库、开发数据库必要元数据；未读取用户凭证、调用模型、修改 IAM/接入点、安装依赖、应用 migration 或发布。主工作区及 Orange 未修改。
- 实际已安装：OpenAI `6.35.0`、Zod `4.4.2`、Supabase JS `2.101.1`。`bun.lock` 分别记录 `6.34.0`、`4.4.2`、`2.100.0`，不能把锁文件版本当成本机已安装版本；没有火山 SDK。未修改两份锁文件或重新安装。
- 分工：独立子代理核验官方合同、业务调用链；主代理核对凭证边界与开发库，并独立离线复算签名。未将代理报告当成已执行的线上验收。

## 官方来源与合同矩阵

下述是中国站 Ark 管控接口，而非 OpenAI 兼容推理协议。已核实公共配置为 `POST https://ark.cn-beijing.volcengineapi.com/`，query 使用 `Action` 与 `Version=2024-01-01`，JSON body；签名 service 为 `ark`、region 为 `cn-beijing`，使用 Access Key。[官方鉴权说明](https://www.volcengine.com/docs/82379/1298459?lang=zh)

| 项目 | 已核实内容 | 仍不能推导的内容 |
| --- | --- | --- |
| [ListFoundationModels](https://www.volcengine.com/docs/82379/1262849?lang=zh) | PageNumber 默认 1；PageSize 默认 10、范围 1–100；响应 Items/PageNumber/PageSize/TotalCount。可投影 Name、DisplayName、VendorName、AccessType、PrimaryVersion、FoundationModelTag、ProjectName；List 不返回 Introduction | Name 是基础模型唯一名，不是已核实的推理 Model ID；公共目录可见不等于推理 Key 已授权 |
| [GetFoundationModel](https://www.volcengine.com/docs/82379/1257587?lang=zh) | 必填 Name，无分页；基础元数据另含 RegionWhiteList、ShortName、DisplayDescription | 不提供具体版本配置；不能为补字段逐条调用详情造成 N+1 |
| [ListFoundationModelVersions](https://www.volcengine.com/docs/82379/1262847?lang=zh) | 必填 FoundationModelName；分页默认 1/10、最大 100；Items 含 FoundationModelName、ModelVersion、Status、ActiveConfigurationId、时间及 Description | Unpublished/Published/Retiring 是版本发布状态，不是推理授权；ActiveConfigurationId 不能当成调用 ID |
| [GetFoundationModelVersion](https://www.volcengine.com/docs/82379/1262848?lang=zh) | 必填 FoundationModelName/ModelVersion，无分页；ActiveConfigurationId 表示当前配置，Configuration 是体验应用/精调相关配置 | 未取得版本级真实推理 ID、参考图数量/尺寸等可靠能力合同 |
| [ListEndpoints / GetEndpoint SDK](https://github.com/volcengine/volcengine-python-sdk/blob/3b116781c5b8bb648f215b29587f2ec74d9e5d02/volcenginesdkark/api/ark_api.py) | volcengineSign；列表请求 PageNumber/PageSize/ProjectName/Filter/TagFilters，响应 Items/PageNumber/PageSize/TotalCount；条目含 Id/Name/Status/StatusReason/ModelReference/EndpointModelType/ProjectName/RateLimit。ModelReference.FoundationModel 含 Name/ModelVersion | SDK 未注明分页默认和上限，本项不能标完整合同通过；接入点只覆盖已有账号资源，不能替代全部基础模型目录 |
| [权限](https://www.volcengine.com/docs/82379/1263493?lang=zh) | IAM 示例含 ark:ListFoundationModels、ark:ListFoundationModelVersions、ark:ListEndpoints、ark:GetEndpoint；AccessType 区分公共/授权元数据可见性 | 未核实两个 GetFoundation 动作的最小策略/资源约束；不证明用户 IAM 已只读，也不证明独立推理 Key 授权 |
| 模态 | FoundationModelTag.TaskTypes 可包含 TextToImage、ImageToImage、VisualQuestionAnswering 等 family 标签 | 标签不保证每个版本的输入组合、图片编辑、多图及尺寸能力。未知项不可绑定，不能把图片输入文本模型标成生图模型 |

分页可利用总数、页码与页大小判断结束，但这是实现策略，官方没有承诺跨页快照一致。空页提前出现、重复页、总数变化等必须有界失败，不能保存截断目录为完整快照。既定总上限 10,000 条、100 请求、60 秒、单请求 10 秒、单响应 8 MiB/总响应 32 MiB 保持不变。

`ListFoundationModelVersions` 按单一 family 查询；若要遍历全部 family 的所有版本，会形成逐 family 扇出。不能在尚无调用 ID 映射时先加入这条昂贵链路，也不能突破既定请求上限。缺少批量能力元数据时保留 unknown。

公共错误合同包含参数/时间问题、401 密钥或签名错误、403 权限不足、404 动作/版本无效、429 FlowLimitExceeded，以及 5xx 服务错误。动作专属 QPS、Retry-After 和错误全集未核实；模型 RPM/TPM 不是目录 QPS。鉴权失败不能变成空目录。[公共错误码](https://www.volcengine.com/docs/6369/68677?lang=zh)

### 推理调用 ID 门禁

[鉴权文档](https://www.volcengine.com/docs/82379/1298459?lang=zh)区分 API Key 调用使用 Model ID、数据面 Access Key 调用使用 Endpoint ID；[模型列表](https://www.volcengine.com/docs/82379/1330310?lang=zh)展示明确 Model ID，但它不是已验证的分页 discovery API。

不能用 `Name + ModelVersion` 拼接 ID，不能拿 PrimaryVersion 或 ActiveConfigurationId 充当调用 ID。已有 Endpoint 的 Id 是接入点标识，但其全集不等于所有模型，也没有验证当前推理 Key 是否有权调用它。

没有取得 `/api/v3/models` 的正式产品合同。固定版本 [runtime client](https://github.com/volcengine/volcengine-python-sdk/blob/3b116781c5b8bb648f215b29587f2ec74d9e5d02/volcenginesdkarkruntime/_client.py) 没有 models resource；这不能反向证明端点不存在。搜索结果中的用户文章未用作技术依据。

待取得的确切证据：哪个中国站只读 API 字段能直接作为推理 `model` 的 Model ID；该字段和版本/能力之间的关联规则；接入点分页上限及必要只读权限。可由官方 API Explorer 无凭证响应导出、正式 OpenAPI schema 或火山技术支持说明补齐，不要求用户在聊天中提供 AK/SK。

### 官方文档读取方式与固定版本

网页检索器对部分中国站页面重定向失败；正常公开 HTML 中的 JSON `MDContent` 可直接读取。无正文壳页面必须视为读取失败，不无限重试；没有登录、读取 cookie 或执行远程脚本。API Explorer 本轮只取得页面壳，不能作为响应 schema 证据。未照搬 BytePlus 国际区合同。

- Python SDK `master@3b116781c5b8bb648f215b29587f2ec74d9e5d02`；无 ListFoundation 系列方法，官方文档证明动作存在，SDK 缺失不等于 API 不存在。
- Node SDK `main@6e8d98cfca31b83f2f920570882785b3283b57ce`，核对 [sign.ts](https://github.com/volcengine/volc-sdk-nodejs/blob/6e8d98cfca31b83f2f920570882785b3283b57ce/src/base/sign.ts)。query 编码排序、header 规范化、请求体 hash、签名 scope/派生都须复用真实合同；不是换名后的 AWS 签名，没有 AWS4 前缀。
- 官方 demo `main@29029d67db5b335b986b047f288988cc344ceeb7`，[Node crypto 示例](https://github.com/volcengine/volc-openapi-demos/blob/29029d67db5b335b986b047f288988cc344ceeb7/signature/nodejs/sign.js)。只读该文件，未运行其顶层 doRequest。

## 签名离线验证

Node SDK 的 test/sign.test.ts 删除 X-Signature 后比较，不足以证明完整签名。另取[官方固定签名样例](https://www.volcengine.com/docs/6369/67270?lang=zh)，主代理和研究代理各自用 Node 内置 crypto 离线复算，使用的是公开文档样例、不是用户密钥，没有请求 IAM。

主代理实际命令退出 0，输出：

```text
officialPublicExample: true
networkCalls: 0
canonicalHash: 5ed5bca3905e1fcbf789abb56a17c2d819674a3bcfa468ae476bd1ea80d135cb
signature: e31c4558bcfe08a286001f59cedbf0791ffd0b2362f10e55ee2627467bcdde93
passed: true
```

只证明该固定样例复算一致，不证明未来 Ark POST 签名实现、网络权限或目录同步已经通过。后续测试仍须覆盖 JSON body 字节一致、特殊字符、header/query 排序及重定向禁用；无须新增依赖即可使用 node:crypto。

## 运行时链路与系统场景清单

以下业务路径相对 `apps/api/src/services/`。9 个文本场景有生产调用；消息合同 `ai-gateway-types.ts` 的 content 是 string。中文名由 migration 及本轮开发库查询核对。

| 固定编码 | 中文名 | 输出 | 实际调用证据 |
| --- | --- | --- | --- |
| customer_log_share_copy | 客户施工日志分享文案 | text | customer-project-log-shares/legacy/share-campaign-core.ts:150，aiGateway.chat；输入是文字，不因业务含图片而宣称图片输入 |
| decoration_qa | 装修问答 | text | decoration-qa/legacy/chat.ts:183,247；douyin-miniapp/qa.ts:124。含 resolveChatConfig 后的流式路径 |
| decoration_qa_title | 装修问答标题生成 | text | decoration-qa/legacy/suggestions.ts:100；实际用于推荐问题，保留历史编码不重命名 |
| decoration_raw_drawing | 装修生图 | image | 仅开发库现有配置，无本地业务调用；运行时未接入 |
| douyin_budget_explanation | 抖音预算初算解释 | text | douyin-budget/ai-explanation.ts:225 |
| marketing_page_block_fill | H5 活动页模块 AI 回填 | text | marketing-page-ai/legacy/fill-actions.ts:23,45 |
| marketing_page_create_fill | H5 活动页创建 AI 回填 | text | marketing-page-ai/legacy/fill-actions.ts:169,190 |
| marketing_page_settings_fill | H5 活动页配置 AI 回填 | text | marketing-page-ai/legacy/fill-actions.ts:94,114 |
| project_operational_risk_summary | 项目运营风险摘要 | text | project-operational-risk-ai.ts:196；无风险时固定返回、不调用模型 |
| social_video_script | 短视频脚本生成 | text | social-video-scripts/legacy/ai-generation.ts:47,68,96；输入标题与转写文字，不是视频生成 |

首六场景来源 `20260509183000_create_ai_provider_routing.sql`；新增 create fill、risk、budget 分别来自 `20260512183000_extend_ai_routing_and_usage.sql`、`20260716093000_seed_project_operational_risk_ai_route.sql`、`20260821103100_seed_douyin_budget_ai_route.sql`。本地 migration 无 raw drawing 种子，后续必须用新 migration 注册并保留其已有身份。

Ark 两个函数全量检索只出现定义、barrel、README 和测试，没有生产调用方。gateway 合同要求原房间图、风格图及 prompt；若 registry 登记双参考图需求，须标注是已批准的待接入适配器要求，不是现有业务调用已验证。不能因此宣称图片端到端可用。

排除：douyin_transcription、SMS purpose 是计费归因，不自动注册成可调用场景。旧 requestAiResult/requestQaResult 仅残留定义；OpenRouter 能力 probe 是显式 CLI，不是业务路由，未运行。

### 已定位的路由身份缺口

- `schema/ai-config.ts:86` 允许任意 scene_code、name、modality；PATCH partial 同样能改身份。
- `services/ai-config/index.ts:296–308` 创建/更新只检查本次请求；PATCH 未读取原路由合并。省略 modality 换模型可绕过模态检查；只改 modality 无模型字段会提前返回。
- `repositories/ai-config.ts:415–435` 原样 insert/update，保留 expected_version 但没有身份保证；重复 scene+tier 仍包装成通用 dbError。
- 后续须固定 registry、创建时后端派生身份、编辑时先读存量并合并完整主备状态，拒绝改 scene/modality；重复配置返回领域冲突。未知历史编码保留 legacy，不能开放新建。
- 已有风险单独保留：AiGateway 只按 scene_code/status 调用 maybeSingle，没有 quality_tier 筛选；与数据库多档位唯一键存在差异。本次不扩大为档位运行时或 legacy fallback 重构。

## 开发库只读证据

2026-09-11 主代理通过 SSH 先断言 hostname=`VM-0-11-ubuntu`（43.165.126.30），再使用容器 supabase-db 的 psql，`-X -v ON_ERROR_STOP=1`、`BEGIN READ ONLY` 执行以下有限查询；均退出 0。没有连接 URL、环境值、密钥列输出。

- ai_scene_routes 查询 scene_code/modality/quality_tier/status，ORDER BY scene_code,quality_tier LIMIT 100：上述 10 行，均 balanced/active，9 text、1 image。
- 按 scene_code 分组 count(DISTINCT modality)>1 LIMIT 100：0 行。
- 精确 model_name=`doubao-seedream-5-0-pro-260628`，ORDER BY id LIMIT 20：1 行，id=`70e7d459-9c2c-4c6b-9788-6a6756893a5d`，provider_id=`365575c2-cb01-4cc7-92d4-698e00f99e59`，text/active。
- pg_constraint 查询 ai_models 入向外键，LIMIT 100：4 项，分别为目录 current_model_id、价格 model_id、路由 primary_model_id/fallback_model_id。
- 对以上真实列按该模型 ID 查询关联行、ORDER BY id LIMIT 100：路由 0 行、目录 0 行、价格 0 行。均未达 LIMIT。
- 另查询场景 name/response_format LIMIT 100，中文名如上，现有 10 行 response_format 都为 json_object；这不证明 image 场景格式配置正确，不复制成可信生图要求。

这些是此刻外键关联检查，不证明全部 JSON/文本历史引用已穷尽，不证明 Seedream 名称是有效官方型号。因此没有修复该模型模态；P5 仍须精确官方型号及能力证据，并在应用前重新确认引用。

## 权限与加密边界

- `schema/ai-secret-settings.ts` 的四项只用于推理引用；目录凭证必须独立。`services/ai-config/secret-settings.ts:32` 已有平台身份及 AI/系统设置双权限模式可复用。
- `system-settings/legacy/crypto.ts:56` 使用 AES-256-GCM；`settings.ts:316` 单值加密写入。AK/SK 应编码为一个值，不能拆成两次更新。
- 元数据仓储 `repositories/system-settings.ts:154` 实际读取 value_text 再投影 has_value；只能说 HTTP 不回显，不能说数据库查询没有读密文。
- 通用 updateSetting 目前仅阻断支付秘密配置；通用平台 controller 仅查系统设置管理权限。新增目录键必须在通用读写路径显式保护，专用 API 再做双权限及成对校验。
- `records.ts:147` 的 toEffective 展开原记录，会保留 value_text，即使 stored_value/effective_value 遮罩。不能假设泛用响应已完全脱敏；新目录键必须避免通过该路径返回原值或密文。
- `getSecretString` 是通用 getString 的别名，不是用途隔离边界。后续目录 resolver 要固定键，供应商引用仍只能接受四项推理键；不能给请求参数任意解密能力。
- 设置修改和 change log 不是同一个事务：单次值写入能成对保存，但后续日志失败时结果可能不明。专用入口返回固定错误、不自动重试；禁止把原始异常或凭证放入审计。
- Admin proxy 当前只识别 `/platform/ai-config/secret-settings`。新目录秘密入口必须同等 no-store、日志路径脱敏、错误响应隔离；不能只加后端控制器。

## 分项结论与下一步

| Gate | 结论 | 后续影响 |
| --- | --- | --- |
| china_foundation_metadata | PASS（文档） | family/版本列表鉴权与分页可据此规划；尚未实连 |
| signing_public_vector | PASS（离线样例） | 可用既有 node:crypto；后续实现仍须完整测试 |
| ark_endpoints_contract | PARTIAL | 签名与字段已核实，分页上限等仍缺证据 |
| ark_catalog_contract | BLOCKED | 未取得目录版本到推理 ID 的正式映射，不能交付完整可绑定目录 |
| scene_runtime_inventory | PASS（代码+开发库） | 可继续共享 registry 与 P3 身份管理，不随机改码 |
| credential_storage_boundary | PASS（设计输入） | 可继续 P1 成对凭证实现；不是当前已安全接通目录的声明 |
| historical_model_repair | BLOCKED | 官方精确型号/版本能力未核实，保持数据原状 |
| live_ark_readonly_smoke | 未执行 | 用户尚未通过新安全入口配置目录凭证；没有调用云端列表 |

先继续独立可验证的系统场景共享定义；其后按完整代码子计划推进注册 migration、后端派生/兼容、Admin 只读身份。目录官方映射未解决不应卡住这些本地工作，也不允许用假目录绕过门禁。发布、收费调用和云端写操作仍不在本轮范围。

## 审查与验证界限

本地 Task 1/3/4 的独立 SPEC 审查、整体 SPEC 和质量审查均通过，无 Critical/Important 问题。整体 SPEC 独立核对了固定 SDK 的 Endpoint、runtime client 与签名结构；中国站正文在复审时抓取失败，因此基础模型分页及 Model ID 文档条款未再次独立重读。质量审查另抽查了调用链和秘密路径，没有重新执行数据库或签名验证。

保留一项非阻断可复现性限制：签名复算只有执行输出和官方输入来源，未将公开样例 AK/SK 或完整脚本存入仓库。网页不可用时需要重新取得官方公开样例；这不等于签名测试已在项目中落地。后续适配器实现须补齐可重复运行的安全测试夹具，不将长 token 样例误当成真实凭证提交。

后续完整代码子计划：[P3-A 共享定义](../../superpowers/plans/2026-09-11-system-ai-scenes-domain.md)。P0 审计完成不代表其中的代码步骤已经执行。

本轮 P0 验证为只读查询、代码检索、官方文档和离线签名复算。没有将它作为业务构建、目录实连、数据库迁移或页面修复通过的证据。
