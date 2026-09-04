# OpenRouter 目录分类与搜索设计

**日期：** 2026-09-04
**状态：** 待评审
**范围：** Gooes API、Supabase migration、平台超管 Admin

## 1. 背景

平台超管的“OpenRouter 目录”已经支持同步预览、分页查看和选择应用，但目录预览缺少功能分类与搜索。OpenRouter 当前目录规模超过 400 个模型，每页只显示 20 条，仅依靠翻页难以找到目标模型。

现有实现还有两个数据边界：

1. `openrouter-model-sync.ts` 只保留文本输出模型，并把所有目录条目的 `modality` 固定为 `text`。
2. `ai_model_catalog_entries` 和目录托管的 `ai_models` 都按上游模型 ID 唯一，无法表达同一个上游模型在不同输出能力下的独立配置、价格和探针状态。

因此不能只在前端对当前页做分类。分类、搜索、分页和多模态目录同步必须使用同一套服务端事实。

## 2. 目标

- 目录预览按“全部、文本、图片生成、视频生成、语音生成”筛选。
- 支持按模型名称或 OpenRouter 模型 ID 搜索。
- 搜索、功能类型和变化状态在数据库分页及 `total` 统计前执行。
- 同一个 OpenRouter 模型可按不同输出功能形成独立目录条目和模型配置。
- 只允许应用能够生成完整、安全能力投影的目录条目。
- 保持现有权限、单次最多应用 100 条、目录哈希和乐观并发规则不变。

## 3. 非目标

- 不把目录预览建设成 OpenRouter 官网的完整模型百科。
- 不根据模型名称、描述或供应商名称猜测功能类型。
- 不自动把新模型切换到业务路由。
- 不改变现有模型状态和业务路由门禁规则。
- 不在浏览器一次加载全部目录后进行本地过滤。
- 不改变租户侧 AI 能力或小程序接口。

## 4. 功能分类规则

### 4.1 用户可见分类

| 内部值 | 用户可见名称 | 目录来源 |
|---|---|---|
| `text` | 文本 | `/api/v1/models` 中支持文本输出的模型 |
| `image` | 图片生成 | `/api/v1/images/models` |
| `video` | 视频生成 | `/api/v1/videos/models` |
| `speech` | 语音生成 | `/api/v1/models?output_modalities=speech` |

分类依据官方目录端点和结构化输出能力，不使用关键词推断。列表不得直接展示 `text/image/video/speech`，统一映射为中文标签。

2026-09-04 使用开发环境密钥进行只读核查时，四个端点均返回 HTTP 200，分别返回 427、48、28、18 条记录；不同端点可能包含同一上游模型，因此这些数量不能直接相加作为去重后的模型数。正式验收只校验响应结构和分类逻辑，不把该数量写成固定业务规则。

### 4.2 多功能模型

`ai_models.modality` 和 `capability_payload` 都以单一输出功能为边界。若同一上游模型同时存在于多个功能目录，则形成多条逻辑记录：

```text
(provider_id, external_model_id, modality)
```

例如同一模型既能生成文本又能生成图片，应分别出现“文本”和“图片生成”条目。两条记录独立维护能力投影、价格快照、探针状态和业务路由，不在前端复制同一条记录伪装分类。

文本模型现有编码保持 `openrouter.<model>`，避免破坏既有引用。新增非文本记录使用：

```text
openrouter.image.<model>
openrouter.video.<model>
openrouter.speech.<model>
```

### 4.3 输入能力

功能分类表示主要输出类型。`input_modalities` 继续表达模型可接收文本、图片、视频或语音输入。例如“支持图片输入、输出文本”的模型归入“文本”，可在后续模型详情中展示“支持图片输入”，不新增“多模态”主分类。

## 5. 多端点同步

### 5.1 同步流程

同步服务以最多 4 个并行请求读取上述官方目录，分别使用项目现有严格 Zod 契约解析。全部端点解析成功后才生成一个目录 run；任何端点失败或格式变化时，整个同步失败且不保存部分预览，避免把暂时缺失的模型误判为已下架。

归一化后按以下顺序稳定排序：

```text
text -> image -> video -> speech -> external_model_id
```

目录哈希必须包含 `external_model_id`、`modality`、结构化能力字段和价格投影。同一响应顺序变化不得造成虚假的目录变化。

`source_endpoint` 保留主目录地址用于兼容；实际读取的端点列表和各分类数量写入 `summary_payload`，Admin 将来源显示为“OpenRouter 多模态目录”，不直接向用户展示内部端点拼接文本。

### 5.2 能力投影与应用门禁

目录同步只能从官方结构化字段生成能力，不得根据模型名称或描述补默认能力。

每个目录条目增加：

```text
apply_status: eligible | blocked
apply_block_code: null | CAPABILITY_METADATA_INCOMPLETE
```

- 能力投影通过 `AiModelCapabilitySchema` 严格校验时为 `eligible`。这里表示目录数据可以安全应用，不等同于运行时探针已经通过。
- 官方目录缺少当前领域契约要求的尺寸、时长、声音或输出格式等字段时为 `blocked`。
- `blocked` 条目仍可搜索和查看，但复选框禁用，显示“能力信息不足，暂不可应用”。
- Apply RPC 必须再次拒绝任何 `blocked` 条目，不能只依赖前端禁用。
- 未知价格和 OpenRouter `-1` 哨兵不写入价格快照，也不阻断目录展示。

本次不在目录预览内增加人工填写能力参数。`blocked` 条目只能在后续官方目录提供完整结构化字段、平台契约补充有官方依据的适配规则并重新同步后转为 `eligible`；不得通过手工填入猜测值解除门禁。这样目录浏览能力与可用于生产路由的模型配置保持分离。

真实目录核查还发现图片目录包含 `input_references`，视频目录包含 `creativity`、`hugging_face_id` 和 `upscale_factor` 等当前严格契约尚未声明的字段。实施时必须先依据 OpenRouter 官方 OpenAPI 更新对应 strict schema，并用真实目录做脱敏解析 smoke，不能通过 `.passthrough()` 放宽整个对象。

应用成功后模型继续沿用现有行为标记为 `stale`。平台运营应先完成能力复核或探针，再人工配置业务路由；本次不扩大范围修改模型状态或路由门禁。目录应用不自动修改任何现有路由。

## 6. 数据库变更

通过新 migration 完成以下变更：

1. `ai_model_catalog_entries` 增加 `apply_status` 和 `apply_block_code`，历史数据回填为 `eligible`。
2. 目录条目唯一约束从 `(run_id, external_model_id)` 调整为 `(run_id, external_model_id, modality)`。
3. 目录托管模型唯一索引从 `(provider_id, model_name)` 调整为 `(provider_id, model_name, modality)`。
4. 新增目录筛选索引 `(run_id, modality, change_type, entry_position)`；保留现有变化状态索引。
5. 更新保存预览和应用目录 RPC，所有当前模型匹配、冲突检查和锁定均包含 `modality`。
6. Apply RPC 原子校验 `apply_status = 'eligible'`，否则返回稳定业务错误码。

Migration 必须先移除旧唯一约束/索引，再建立新约束；既有文本记录的 `modality='text'`，无需重写业务数据。迁移应用后使用 `supabase migration list` 验证 Local/Remote 对齐。

关键词搜索限定单个 run，单批最多 10,000 条。先使用现有 `run_id` 索引缩小范围并在开发库执行 `EXPLAIN ANALYZE`；只有执行计划不满足要求时，才通过后续 migration 增加 trigram 索引，避免为低频平台操作提前增加全历史目录的 GIN 写入成本。

## 7. API 契约

保持接口路径不变：

```http
GET /platform/ai-config/catalog-runs/:id/entries
  ?page=1
  &pageSize=20
  &keyword=claude
  &modality=text
  &changeType=new
```

新增查询参数：

- `keyword`：可选，去除首尾空格后 1–120 字符；匹配 `model_name` 和 `external_model_id`。
- `modality`：可选，只接受 `text | image | video | speech`。
- `changeType`：保持现有 `new | changed | removed | unchanged`。

规则：

- 所有筛选在 `count` 和 `.range()` 前组合。
- 关键词进入 PostgREST 组合过滤前必须转义过滤表达式元字符，不能直接拼接原始用户输入。
- 默认 `page=1&pageSize=20`，`pageSize` 最大 100。
- 查询只选择 Admin 列表需要的字段，不增加 N+1 查询。
- 未提供新参数时，旧调用行为保持兼容。
- 响应条目增加 `apply_status` 和 `apply_block_code`；错误继续由 `error-factory.ts` 包装。

## 8. Admin 交互

### 8.1 工具栏

“目录预览”标题和操作按钮下方增加一行紧凑工具栏：

```text
[搜索模型名称或 OpenRouter ID] [全部 | 文本 | 图片生成 | 视频生成 | 语音生成] [变化状态] [重置]
```

- 搜索使用放大镜图标，输入 300ms 防抖后请求服务端。
- 功能分类使用分段控件或 Tabs，不使用多个大按钮。
- 变化状态使用 Select，选项为全部变化、新增、能力或价格变化、未变化、已下架。
- 任一筛选变化后回到第 1 页，并清空已勾选条目，防止应用不可见选择。
- 请求竞态继续使用现有 sequence 机制，旧响应不得覆盖新条件。
- 加载时保持表格和分页区域尺寸稳定，不整页闪烁。

### 8.2 表格

- “模态”列改名为“功能”，显示中文 Badge。
- 模型列保留模型名称和 OpenRouter ID，便于平台管理员定位真实供应商模型。
- `blocked` 条目禁用复选框，并在功能或变化信息旁显示简短阻断原因。
- 空状态区分“当前目录为空”和“没有符合筛选条件的模型”。
- 分页文案中的总数必须是完整筛选结果总数。
- 不增加嵌套 Card，不改变当前双栏工作台结构。

## 9. 错误与一致性

- 任一官方目录读取失败：不保存 run，返回固定中文错误和稳定错误码。
- 严格契约解析失败：不吞掉异常，不把 OpenRouter 原始响应或密钥返回浏览器。
- 用户切换同步记录、搜索或分类：取消旧结果的 UI authority，保留最新查询状态。
- 应用时目录哈希、模型版本或条目状态变化：保持现有 409 冲突语义，提示刷新后重试。
- 多端点中出现重复 `(external_model_id, modality)`：服务端确定性去重；内容冲突时同步失败，不静默覆盖。
- 旧目录 run 没有新字段时由 migration 回填，可继续查看和应用。

## 10. 验证

### API 与数据库

- 文本、图片、视频、语音目录分别严格解析。
- 同一模型跨功能生成独立记录，同功能重复记录确定性去重。
- 任一端点失败时不保存部分 run，也不产生错误下架条目。
- 不完整能力条目可查看但 Apply RPC 拒绝。
- `keyword + modality + changeType` 在分页前过滤，`total` 与列表一致。
- migration 约束、索引、RPC 和历史回填合同测试通过。
- 开发库对组合筛选执行 `EXPLAIN ANALYZE`，确认命中 run 范围索引且无全历史目录扫描。

### Admin

- 搜索名称和 OpenRouter ID 均能命中。
- 分类、变化状态、搜索、重置和分页可组合使用。
- 切换筛选会清空隐藏选择，阻断条目无法勾选。
- 加载、空、错误、无结果和提交中状态均可识别。
- 中英文功能映射正确，窄屏工具栏换行且不遮挡表格。

### 回归

- OpenRouter 供应商选择、余额读取、同步记录切换和应用上限保持正常。
- 现有文本模型编码、模型 ID、价格快照和业务路由不变。
- `bun` 相关单测、API typecheck、Admin 检查、文件体量门禁和真实 OpenRouter 目录 smoke 通过。

## 11. 发布顺序与回滚

发布顺序：

1. 应用兼容性 migration。
2. 部署 API，并验证旧 Admin 请求仍可读取目录。
3. 部署 Admin。
4. 创建一次真实多模态预览，验证分类数量、搜索、阻断状态和分页。
5. 仅选择少量 `eligible` 条目执行应用 smoke，不修改业务路由。

数据库变更采用前向修复回滚：若新同步逻辑异常，先关闭多端点同步入口并恢复只读查看；保留 run 和 entry 审计数据。不得回退唯一约束到不支持多功能记录的旧结构，除非先确认没有同模型跨功能数据并导出审计记录。
