# 平台自媒体内容生产工作台与多模态 AI Gateway 设计

**日期：** 2026-09-01

**状态：** 产品决策与技术书面评审已通过，待阶段一实施计划

**适用范围：** Gooes API、Admin、Supabase migrations、现有短视频转写 Worker、
新增媒体生成与合成 Worker

## 1. 执行结论

本项目采用“内容生产工作台 + 多模态 AI Gateway 2.0”方案。

一期只向平台工作人员开放，但数据库、权限、任务、资产、用量和费用归属从第一天按
平台与租户双作用域设计。后续向租户开放时，复用同一套生产链路，由平台统一购买
OpenRouter 额度，按租户套餐或积分计量，不允许租户直接接触平台密钥或具体模型。

本文所称“一期产品范围”由第 16 章的阶段一至阶段三组成；阶段四租户开放不属于一期。

核心产品决策如下：

- 抖音链接同时提取原发布标题/描述和视频语音转写，分别标记来源和状态；
- 一期目标是自动生成并合成完整视频，由运营人员审核后下载，不自动发布；
- 同时支持真实素材混合生产与全 AI 生成，默认使用真实素材混合生产；
- 使用结构化分镜编辑，不建设多轨时间轴或低配版专业剪辑器；
- OpenRouter 承担文字、图片、视频片段和配音生成，最终视频由公司媒体 Worker 合成；
- 图片、视频、音频、字幕和导出文件完成后必须转存腾讯 COS，不能把供应商临时地址作为
  长期资产；内容方案、分镜等结构化文本保存在版本化数据库记录中；
- 模型按业务场景和质量档位路由，运营人员不直接选择模型 ID；
- 每次生成都具备幂等、预算预占、费用结算、权限、审计和失败恢复边界；
- 一期所有生成请求统一先落本地异步任务，文字生成也不在业务 HTTP 中直接等待供应商；
- 新增媒体素材只能进入私有 COS 存储，通过短期签名地址访问。

## 2. 背景与当前事实

仓库已经具备一部分可复用能力：

1. `social-video` 模块可以接收抖音链接，创建转写任务，并通过 Worker 执行链接解析、
   音视频下载、FFmpeg 音频提取和 ASR；
2. Apify Gateway 已能读取视频标题、媒体地址、时长、转写文本和分段结果；
3. `social_video_scripts` 已保存 AI 生成的标题、钩子、改写文案、分镜、封面文案和
   发布文案；
4. 现有 AI Gateway 支持场景路由、主备文字模型、OpenRouter Headers、调用日志、
   token 用量和失败记录；
5. 超管 Admin 已有 AI 模型路由页面和自媒体脚本列表；
6. `platform_file_objects` 与腾讯 COS 上传链路可以作为统一媒体资产索引；
7. 平台已存在 `platform.social_video.manage`、`platform.ai_config.read` 和
   `platform.ai_config.manage` 等权限基础；
8. 租户积分和 AI 调用日志已经提供未来费用归因的基础。

现有能力不能直接满足目标：

- 当前 AI Gateway 只实现 OpenAI-compatible Chat Completions；
- 现有脚本列表是结果查看页，不是可编辑的内容项目工作台；
- 图片、视频和配音具有不同的请求、响应、费用和任务生命周期；
- 视频生成是长耗时异步任务，不能放在同步 HTTP 请求中等待；
- 当前缺少分镜版本、媒体资产、生成任务、最终合成和人工审核事实；
- 当前转写结果不能保证同时取得抖音原发布描述，不能把语音转写冒充发布描述；
- 当前模型表没有能力、尺寸、时长、音色、价格和发现来源等多模态元数据。

### 2.1 统一术语

- **OpenRouter：** 本项目直接调用的聚合服务；
- **上游模型供应商：** OpenRouter 背后的模型提供方，不直接向业务暴露；
- **本地任务：** Gooes 持久化并负责状态机、权限、预算和恢复的任务；
- **供应商任务：** OpenRouter 接受请求后返回的同步结果或异步任务；
- **生成尝试：** 运营人员主动发起的一次新生成；
- **幂等重试：** 对同一次生成尝试的网络或客户端重试，不创建新的供应商任务；
- **重新生成：** 运营人员显式创建新的生成尝试，可以产生新费用和新资产。

## 3. 目标

本项目最终实现：

1. 平台运营人员从抖音链接或公司素材创建内容项目；
2. 系统分别呈现原发布标题/描述与语音转写；
3. AI 生成可编辑的内容方案、脚本和结构化分镜；
4. 分镜可以使用真实素材、AI 图片、AI 视频片段和 AI 配音；
5. 运营人员可逐镜头修改、排序、替换和重新生成；
6. 媒体 Worker 合成字幕、配音和视频片段，输出标准 MP4；
7. 人工审核通过后下载视频、封面和发布文案；
8. 超管按文字、图片、视频和配音能力配置 OpenRouter 模型路由；
9. 全链路记录模型、供应商、费用、耗时、状态和输出资产；
10. 数据与服务合同能够在后续安全开放给租户；
11. 所有列表分页，所有大文件和长任务不阻塞 API 进程；
12. 单个步骤失败时保留已完成事实，只重试失败步骤。

## 4. 非目标

一期不包含：

- 自动登录或自动发布到抖音账号；
- 真人声音克隆；
- 多轨时间轴、关键帧、滤镜和专业级裁剪；
- AI 背景音乐生成；
- 数字人；
- 多人实时协作编辑；
- 租户自带 OpenRouter Key；
- 自动启用 OpenRouter 新模型；
- 将外部抖音内容自动声明为公司原创；
- 未经人工审核直接对外发布；
- 在一期向租户开放生产入口。

背景音乐一期只允许选择公司已取得使用权的音乐资产。

## 5. 方案选择

### 5.1 采用方案

采用独立内容生产工作台，并将现有 AI Gateway 扩展为多模态 Gateway。

该方案把内容项目、素材、分镜、生成任务和最终成片作为独立事实，能够同时满足平台
运营和未来租户使用，不会把长任务和媒体资产塞进现有脚本记录。

### 5.2 未采用方案

#### 直接扩展现有自媒体脚本列表

开发量较小，但脚本、资产、任务和成片会相互耦合；无法可靠处理逐镜头重试、版本、
费用和未来租户隔离，因此不采用。

#### 一期建设完整在线视频剪辑平台

会引入多轨时间轴、裁剪、关键帧和复杂状态同步，并与专业剪辑软件重叠。投入明显超过
首版运营目标，因此不采用。

#### 一键生成并自动发布

无法满足内容审核、事实准确性、侵权风险和品牌控制要求，因此不采用。

## 6. 总体架构

```text
Admin 内容生产工作台
  -> Platform Social Media API
       -> 内容项目与分镜 Service
       -> 素材提取 Service
       -> Multi-modal AI Gateway
            -> OpenRouter Text Adapter
            -> OpenRouter Image Adapter
            -> OpenRouter Video Adapter
            -> OpenRouter Speech Adapter
       -> Generation Job Repository / Claim RPC
       -> Media Generation Worker
       -> Render Worker (FFmpeg)
       -> Tencent COS / platform_file_objects
       -> 用量、费用与审计日志
```

### 6.1 API 进程职责

- 校验请求、权限、作用域、额度和幂等；
- 创建内容、分镜、生成和合成任务；
- 返回稳定状态和分页结果；
- 在能力探针确认已启用且签名可验证时，接收 OpenRouter 视频 Webhook；
- 不在 HTTP 请求中等待视频生成或 FFmpeg 合成完成；
- 不下载或转码大文件。

### 6.2 Worker 职责

- 现有短视频转写 Worker 继续负责抖音解析与 ASR；
- AI 生成 Worker 负责文字、图片、视频和配音任务；文字、图片和配音即使供应商接口同步
  返回，也由 Worker 在本地异步任务内执行；
- 视频任务由同一 Worker 提交后进入供应商异步状态，通过轮询恢复，只有在官方合同和
  签名能力探针通过时才启用 Webhook；
- 合成 Worker 负责 FFmpeg 拼接、字幕、音轨、输出校验和成片转存；
- 不同任务使用独立 claim 类型与并发上限，合成任务不能阻塞转写任务；
- AI 生成 Worker 只处理数据库已授权且已完成预算预占的任务；提取和合成 Worker 处理已
  授权并通过内部资源上限的任务，不伪造供应商预算预占。

### 6.3 OpenRouter 官方接口边界

实现以 OpenRouter 官方接口为准：

- 图片：`POST /api/v1/images`；
- 视频：`POST /api/v1/videos`，通过任务 ID、轮询 URL或签名 Webhook 获取结果；
- 配音：`POST /api/v1/audio/speech`，响应为音频字节流；
- 模型发现：通用 Models API、图片模型 API 和视频模型 API；
- 视频输出是异步临时结果，完成后由 Worker 下载并转存；
- 视频生成不具备 Zero Data Retention，敏感素材默认禁止进入全 AI 视频任务。

阶段一编码前必须针对开发配置执行只读能力探针并保存脱敏 fixture，固定当前官方合同下的：

- 请求与响应严格 schema；
- 同步或异步模式、任务状态与结果下载方式；
- 是否支持供应商幂等键、取消和任务查询；
- Webhook 是否存在可验证签名；
- 错误分类、价格字段、能力字段与临时 URL 生命周期。

未由能力探针证明的能力一律视为不支持。若没有可验证的 Webhook 签名，阶段一只使用有界
低频轮询；若供应商不支持幂等提交，提交结果未知时禁止自动再次提交，进入
`submission_unknown` 并等待查询恢复或人工确认。

参考：

- <https://openrouter.ai/docs/guides/overview/multimodal/image-generation>
- <https://openrouter.ai/docs/guides/overview/multimodal/video-generation>
- <https://openrouter.ai/docs/guides/overview/multimodal/tts>
- <https://openrouter.ai/docs/guides/overview/models>
- <https://openrouter.ai/docs/guides/features/zdr>

## 7. 内容生产流程

### 7.1 创建项目

每个内容项目至少包含：

- 目标平台；
- 内容目标；
- 目标画幅；
- 目标时长；
- 生产模式；
- 质量档位；
- 预算上限；
- 平台或租户作用域；
- 创建人与负责人。

一期目标平台默认为抖音，画幅默认为 `9:16`，时长提供 15、30、60、90 秒选项。

### 7.2 导入来源

支持：

- 抖音分享链接或分享口令；
- 运营人员上传的图片、视频或音频；
- 从平台图片库选择的素材；
- 从公司项目实景和施工日志选择的已授权素材。

每项来源记录授权声明、原始来源、导入人和导入时间。

抖音链接能力只处理运营人员主动提交且公开可访问的内容，不绕过登录、私密状态、地域
限制或平台风控。解析服务无法合法取得原发布描述或媒体时，工作台提供手工粘贴文案和
上传原视频的降级入口，并保留人工输入来源标识。

### 7.3 抖音内容提取

提取结果分开保存：

- 原发布标题；
- 原发布描述；
- 视频语音转写；
- 带时间信息的分段文本；
- 视频封面、时长和基础元数据；
- 各字段提取来源与状态。

任一项缺失时显示具体缺失状态。原发布描述缺失时不能回填语音转写，语音转写失败时
也不能把发布描述作为转写结果。

### 7.4 内容方案与分镜

AI 根据经过长度限制和安全投影的来源生成：

- 选题和内容目标；
- 标题候选；
- 开场钩子；
- 口播稿；
- 发布标题与描述；
- 结构化分镜。

每个镜头包含：

- 镜头目的；
- 口播文案；
- 屏幕字幕；
- 素材策略；
- 素材或生成资产引用；
- 时长；
- 配音选择；
- 转场；
- 生成状态；
- 预计和实际费用。

真实视频素材还必须保存最低限度的非破坏性裁剪参数：

- 入点和出点毫秒；
- `cover | contain` 适配方式；
- 可选焦点位置；
- 原声静音或音量；
- 只读原始时长与裁剪后时长。

这些参数足以选择长视频片段，不扩展为多轨时间轴、关键帧或专业调色。

分镜支持增删、排序、编辑、替换素材和单镜头重新生成。

内容方案包含两种不同状态，不能混为最终审核：

- 自动内容安全检查：机器检查输入和生成文本，失败关闭；
- 运营确认：具有 create/manage 权限的运营人员确认该版本可用于生成分镜。

最终成片审核仍由 review/manage 权限在阶段三执行。只有“自动安全检查通过且运营已确认”的
内容方案版本可以生成分镜。

### 7.5 两种生产模式

#### 真实素材混合生产（默认）

公司真实工地、案例和产品素材为主体；AI 负责脚本、补充画面、配音、字幕和转场。

#### 全 AI 生成

所有画面由 AI 图片或 AI 视频生成。提交前明确展示预计费用和素材处理提示。

### 7.6 合成与审核

合成 Worker：

1. 读取已确认的不可变分镜版本；
2. 下载并校验所有输入资产；
3. 统一画幅、帧率、编码、采样率和响度；
4. 拼接视频片段；
5. 混合配音和已授权背景音乐；
6. 烧录或封装字幕；
7. 输出 MP4、封面和媒体信息；
8. 转存 COS 并写入 `platform_file_objects`；
9. 进入待审核状态。

审核通过后可以下载成片、封面、发布文案和素材包。审核拒绝必须填写原因，并允许从
当前分镜版本复制出新版本继续修改。

## 8. 多模态 AI Gateway 2.0

### 8.1 稳定业务接口

Gateway 对业务提供四个稳定接口：

```text
generateText
generateImage
generateVideo
generateSpeech
```

业务只传场景编码、作用域、结构化输入、质量档位和幂等键，不传任意 Endpoint、API Key
或未经允许的模型 ID。

四个接口都创建本地 `ai_generation_jobs` 并立即返回任务 DTO。业务 HTTP 不直接调用
OpenRouter。Adapter 在 Worker 内执行：文字、图片、配音可把同步供应商结果转成相同本地
状态机；视频使用供应商异步任务。这样预算、租约、重试、审计和公开响应保持一致。

### 8.2 场景编码

首期至少包含：

- `social_media_content_plan`
- `social_media_script`
- `social_media_storyboard`
- `social_media_cover_image`
- `social_media_scene_image`
- `social_media_scene_video`
- `social_media_voiceover`

每个场景分别配置快速、均衡和高质量档位。均衡是业务默认值。

### 8.3 模型能力

模型记录需要具备：

- 输出类型：文字、图片、视频或语音；
- 输入类型；
- 支持尺寸、画幅、时长和格式；
- 是否支持参考图片、首尾帧和输入参考素材；
- 是否支持生成音频；
- 可用音色和语速范围；
- OpenRouter 上游供应商允许透传的参数白名单；
- 当前价格快照；
- 模型目录同步时间；
- 启用、停用或下架状态。

能力不能只保存在无约束 JSON 中。数据库保存严格的基础能力字段；不同模态的扩展参数
使用按模态校验的结构化 payload，并在 API 层用 Zod 做严格解析。

### 8.4 模型目录同步

超管操作流程：

1. 点击“同步 OpenRouter 模型”；
2. 服务端读取当前模型目录与能力；
3. 展示新增、变化、下架和价格变化；
4. 超管选择需要导入或更新的模型；
5. 系统写入新的能力与价格快照；
6. 不自动修改正在使用的业务路由；
7. 已下架模型不能创建新任务，历史任务继续显示原模型快照。

模型目录同步是预览后确认的命令，不允许定时任务自动启用新模型。

### 8.5 质量档位

每个业务场景配置：

- 主模型；
- 备用模型；
- 允许的 OpenRouter 上游供应商；
- 分辨率、画幅、时长或音频格式；
- 单次费用上限；
- 超时；
- 并发上限；
- 是否允许敏感素材；
- Provider 数据策略；
- 重试策略。

运营人员只选择快速、均衡或高质量，不直接看到或修改模型参数。

### 8.6 Adapter 可执行合同

每个 Adapter 必须实现与模态匹配的最小合同：

```text
validateCapability(modelSnapshot, request)
estimateCost(modelSnapshot, request)
submit(localJob, request)
query(providerTaskId)       # 仅异步供应商能力
cancel(providerTaskId)      # 仅能力探针确认支持时
normalizeUsage(response)
normalizeError(response)
```

Adapter 不直接更新业务表，只返回严格内部结果，由带租约校验的完成/失败 RPC 持久化。
目录同步结果、管理员修订和能力探针冲突时，优先级为：

`人工停用 > 能力探针不支持 > 管理员收紧 > 官方目录声明`。

目录变化不能自动扩大已启用能力；能力减少会阻止新任务，但不改变历史任务快照。

## 9. 数据模型

所有数据库变化使用 forward migration，不修改已应用 migration，不在远端手工建表或修数。

### 9.1 `social_media_content_projects`

内容项目主记录：

- `scope_type`：`platform | tenant`；
- `tenant_id`：平台项目为空，租户项目必填；
- 目标平台、目标、画幅、时长、模式和质量档位；
- 状态、预算上限、预计费用和实际费用；
- 创建人、负责人、创建时间和更新时间；
- 乐观并发版本。

### 9.2 `social_media_source_items`

保存抖音链接、上传文件、图片库、项目实景等来源，包含来源类型和文件引用。授权不是单个
布尔值，至少包含授权主体、证明文件、允许渠道、用途、地域、有效期、导入人、确认时间和
撤回状态；手工粘贴/上传必须保留 `manual` 来源，不能伪装为自动提取。

### 9.3 `social_media_source_extractions`

保存原发布标题/描述、语音转写、分段文本、来源 Provider、状态、错误码和提取版本。

### 9.4 `social_media_extraction_jobs`

保存来源提取任务、租约、尝试次数、状态和现有 `social_video_transcriptions` 引用。现有转写
记录继续负责抖音解析/ASR 的底层事实；本表负责内容项目作用域、授权、幂等和统一状态。

### 9.5 `social_media_content_plan_versions`

版本化保存选题、标题候选、开场钩子、口播稿、发布标题、发布描述、内容审核结果和生成任务
引用。已确认或已用于分镜的版本不可原地修改，编辑时复制新版本。最终导出只读取审核通过
的明确版本，不能从最新草稿临时推导。

### 9.6 `social_media_storyboard_versions`

保存分镜版本与生成来源。已用于生成或合成的版本不可原地修改；编辑时复制为新版本。

### 9.7 `social_media_storyboard_scenes`

保存镜头顺序、文案、字幕、素材策略、时长、转场、配音配置和当前资产引用。
真实素材同时保存入点、出点、适配方式、焦点和原声音量，参数受原始媒体时长约束。

### 9.8 `ai_generation_jobs`

统一保存文字、图片、视频和配音任务：

- 作用域与创建人；
- 场景、模态和质量档位；
- 请求哈希和幂等键；
- 模型、Provider、能力和价格快照；
- Provider 任务 ID；
- `awaiting_budget_reconfirmation | queued | submitting | submission_unknown | submitted |
  processing | succeeded | failed | canceled` 生成状态；
- `estimated | reserved | settled | overrun | adjusted` 独立计费状态；
- 预计费用、冻结费用和实际费用；
- 安全错误码、尝试次数、租约和时间戳；
- 输入和输出引用。

不把 API Key、完整原始 Provider 错误或未受控敏感 Prompt 写入公开 payload。

唯一约束区分三种语义：

- `(scope, idempotency_key)` 保证同一次客户端命令重放；
- 相同幂等键但请求哈希不同返回稳定冲突；
- `(target_type, target_id, purpose, generation_no)` 标识运营人员显式创建的新生成尝试；
  `generation_no` 由创建任务 RPC 在目标行锁内原子分配，客户端不能指定。

请求哈希不单独阻止重新生成。只有运营人员发起“重新生成”命令并由服务端增加
`generation_no`，才会产生新任务、新预算预占和新供应商调用。

### 9.9 `ai_usage_reservations` 与 `ai_cost_ledger`

阶段一即建立平台与租户共用的预算接口：

- `ai_usage_reservations` 原子预占项目、员工、平台日/月与未来租户额度；
- 一期只使用 `scope_type=platform`，平台预算仍必须预占，不能只在调用后记账；
- `ai_cost_ledger` 是费用事实唯一来源，记录预估、预占、供应商实际消费、释放、调整和币种；
- 项目、镜头、任务和 `ai_call_logs` 只保存展示快照或 ledger 引用，不各自成为财务真相；
- 预占、创建任务、claim 授权、结算或释放由 service-role-only 原子 RPC 完成；
- 创建任务 RPC 在同一事务中写入有效 reservation 和初始 `queued` job；不存在独立的
  `reserved -> queued` 窗口；
- Worker 只能 claim 具有有效 reservation 的 `queued` 任务，不能绕过预算；
- OpenRouter Activity 与 ledger 做周期对账，差异进入人工处理队列，不能静默改账。

阶段四只增加租户套餐、积分换算、加价、税费与余额来源，不改变预占/结算接口。具体商业
定价可以延期，但币种、最小单位、价格快照、舍入方式和供应商成本必须从阶段一固定。

### 9.10 `social_media_assets`

保存业务资产类型、来源、分镜引用、生成任务引用和 `platform_file_objects` 引用。
底层文件信息继续由 `platform_file_objects` 负责。

### 9.11 `social_media_render_jobs`

保存不可变输入分镜版本、输出文件、媒体信息、状态、失败码和当前审核状态快照；独立追加
的 `social_media_reviews` 才是审核事实来源。

### 9.12 `social_media_reviews`、`social_media_release_packages` 与审计

- `social_media_reviews` 追加保存审核人、时间、结果、理由、规则版本和被审核的 render；
- `social_media_release_packages` 固定审核通过的成片、封面、字幕与内容方案版本，作为下载
  清单事实；
- `social_media_audit_events` 追加记录素材授权、项目编辑、Prompt/路由版本、预算确认、
  生成、审核、下载、归档、撤回和删除；
- 审核拒绝不修改旧 render，必须基于新分镜版本创建新 render。

### 9.13 索引、RLS 与 service role

- 所有项目、来源、分镜、任务和资产按作用域启用并强制 RLS；
- 每个作用域表使用数据库 CHECK 固定
  `(scope_type='platform' AND tenant_id IS NULL) OR
  (scope_type='tenant' AND tenant_id IS NOT NULL)`；
- 项目、内容版本、分镜、生成任务、预算、资产、审核和导出等业务写入只允许通过带
  `scope_type/tenant_id` 断言的 service-role-only RPC；撤销 service role 对这些表的直接
  INSERT/UPDATE/DELETE，不能以普通 repository 过滤替代数据库作用域；
- Worker claim RPC 返回已绑定作用域的任务；complete/fail/cancel/settle RPC 必须匹配任务
  ID、作用域、租约和尝试号，旧 Worker 或跨租户调用稳定失败；
- 列表索引以 `tenant_id/scope_type + status + created_at DESC + id DESC` 为主；
- Worker claim 使用状态、租约和创建时间索引；
- Provider 任务 ID、幂等键和请求哈希建立必要唯一约束；
- 幂等唯一键显式包含 `scope_type` 和规范化的非空 `scope_id`（平台使用固定 sentinel），
  不依赖 PostgreSQL 的 NULL 唯一语义；
- 大表列表使用分页，不返回无上限任务或资产。

涉及索引的 migration 在本地使用代表性数据执行 `EXPLAIN ANALYZE`，确认列表、claim 和
项目详情路径，不为猜测场景新增索引。

### 9.14 私有文件存储

- 新增素材、供应商输出、字幕、音频和成片只能写入私有 COS bucket/prefix；
- `platform_file_objects.visibility` 必须显式为 `private`，禁止依赖现有默认值；
- 前端只通过短期、绑定权限与对象的签名 URL 访问，不保存永久公网 URL；
- 对象 key 使用不可猜测 ID，不包含手机号、客户名或项目地址；
- COS 上传先记录上传意图，完成后校验大小、类型与 checksum 再原子绑定文件记录；
- 上传成功但数据库绑定失败的对象进入垃圾回收清单；悬空记录不向前端签发 URL；
- 删除或授权撤回时可以清除媒体字节，但保留最小审计 tombstone、哈希和删除原因。

## 10. API 边界

### 10.1 内容项目

```text
GET    /platform/social-media/projects
POST   /platform/social-media/projects
GET    /platform/social-media/projects/:id
PATCH  /platform/social-media/projects/:id
POST   /platform/social-media/projects/:id/archive
```

列表默认 `page=1&pageSize=20`，最大 `100`。

### 10.2 来源与提取

```text
GET    /platform/social-media/projects/:id/sources
POST   /platform/social-media/projects/:id/sources
POST   /platform/social-media/uploads
POST   /platform/social-media/uploads/:id/complete
POST   /platform/social-media/sources/:id/extract
GET    /platform/social-media/extraction-jobs/:id
```

单个项目最多 50 项来源；接口仍使用默认 20、最大 50 的分页，不因总量有上限而返回无界数组。

### 10.3 分镜与生成

```text
POST   /platform/social-media/projects/:id/storyboard/generate
GET    /platform/social-media/projects/:id/storyboards
GET    /platform/social-media/projects/:id/content-plans
POST   /platform/social-media/projects/:id/content-plans/generate
POST   /platform/social-media/content-plans/:id/copy
PATCH  /platform/social-media/content-plans/:id
POST   /platform/social-media/content-plans/:id/confirm
POST   /platform/social-media/storyboards/:id/copy
PATCH  /platform/social-media/scenes/:id
POST   /platform/social-media/scenes/reorder
POST   /platform/social-media/scenes/:id/generations
GET    /platform/social-media/generation-jobs
GET    /platform/social-media/generation-jobs/:id
POST   /platform/social-media/generation-jobs/:id/cancel
POST   /platform/social-media/generation-jobs/:id/resolve-submission
```

重排和批量生成使用受控命令与预期版本，不能依赖多次普通 UPDATE 形成原子业务边界。

### 10.4 合成与审核

```text
POST   /platform/social-media/projects/:id/renders
GET    /platform/social-media/render-jobs
GET    /platform/social-media/render-jobs/:id
POST   /platform/social-media/render-jobs/:id/approve
POST   /platform/social-media/render-jobs/:id/reject
GET    /platform/social-media/render-jobs/:id/reviews
GET    /platform/social-media/assets
POST   /platform/social-media/assets/:id/sign-download
PATCH  /platform/social-media/sources/:id/rights
POST   /platform/social-media/sources/:id/revoke
GET    /platform/social-media/projects/:id/audit-events
GET    /platform/social-media/projects/:id/export
```

生成任务、合成任务和资产列表均支持分页与状态、项目、创建人、模态和日期筛选。导出
接口返回成片、封面、字幕、发布文案和原始资产的受控下载清单，不在一期同步打包 ZIP，
也不让 API 把完整大文件读入内存。

内容方案、review、audit、generation、render 和 asset 查询全部分页；签名下载是单对象命令。
`resolve-submission` 仅接受经过能力查询或 Activity 对账支持的受控决策，不接收任意 Provider
状态或 URL。授权撤回和强制关闭任务属于 `manage` 权限。

下载清单固定分组为 `video`、`cover`、`subtitles`、`release_copy`、`licensed_sources` 和
`rights_manifest`；字幕首版输出 UTF-8 SRT，文案输出 UTF-8 JSON，权利清单列出来源、授权
范围和有效期。每个文件只返回文件 ID、类型、大小、checksum 和短期下载操作，不返回 COS
永久地址或内部对象 key。

### 10.5 模型配置

```text
POST   /platform/ai-config/openrouter/models/sync-preview
POST   /platform/ai-config/openrouter/models/apply
PATCH  /platform/ai-config/models/:id/capability
POST   /platform/ai-config/routes/:id/test
GET    /platform/ai-config/openrouter/credits
GET    /platform/ai-config/usage-summary
```

同步预览与确认应用分开；余额读取不得向前端返回管理密钥。

### 10.6 Webhook

```text
POST /ai/openrouter/video/events
```

该入口只有在阶段一能力探针确认 OpenRouter 当前合同提供可验证签名后才注册；否则生产环境
不暴露入口，只使用有界轮询。启用后 Webhook 必须：

- 使用原始请求字节验证签名；
- 校验时间戳窗口；
- 使用常量时间比较；
- 幂等处理重复事件；
- 校验 Provider 任务 ID 和本地任务作用域；
- 不根据回调 URL 或 payload 下载任意非允许来源；
- 成功响应不能早于持久化事实。

低频轮询作为 Webhook 丢失时的恢复路径，不与 Webhook 竞争覆盖终态。

### 10.7 后端分层

```text
controller
  只处理 HTTP、Zod 校验、授权上下文和 ResponseHandler.success

service
  编排权限、作用域、状态机、额度、幂等和领域转换

repository / gateway
  访问 Supabase、RPC、OpenRouter、COS 或 FFmpeg 任务边界
```

所有业务错误通过 `error-factory.ts` 创建，禁止直接 `throw new Error()`，禁止向前端透出
原始 Provider 响应、SQL detail、API Key 或内部对象路径。

每个阶段在 domain 中维护版本化中文业务码目录，至少区分权限/作用域、预算、能力、输入、
内容安全、供应商未受理、提交未知、供应商失败、转存失败和状态冲突。已发布 code 不改变
既有 HTTP 语义；新增原因使用新 code，不把供应商 message 直接当业务码。

## 11. Admin 信息架构

### 11.1 导航

将现有“自媒体脚本”升级为“自媒体运营”，包含：

- 内容生产；
- 内容资产；
- 生产记录。

模型维护继续放在现有“AI 模型路由”，避免运营任务与技术配置混在一起。

### 11.2 内容项目列表

使用标准 Admin 列表工作台：

- 顶部紧凑标题与“创建内容项目”；
- 状态、目标平台、生产模式、负责人和日期筛选；
- 表格展示项目、状态、模式、分镜进度、费用、负责人和更新时间；
- 固定分页与明确加载、空、错误状态；
- 不使用宣传页式 Hero、渐变或装饰卡片。

### 11.3 内容项目详情

使用阶段式工作区：

```text
内容来源 | 内容方案 | 分镜编辑 | 素材生产 | 视频预览 | 审核导出
```

顶部固定展示项目名称、状态、生产模式、质量档位、费用和当前主要操作。

分镜编辑采用：

- 左侧镜头列表；
- 中间当前镜头预览；
- 右侧属性编辑；
- 页面底部生成当前镜头或全部待生成镜头。

窄屏时改为顺序面板，不压缩成不可读的三列。所有按钮、标签和错误使用中文业务文本。

### 11.4 AI 模型路由页

在现有供应商、模型和场景路由基础上增加：

- 模态与能力筛选；
- OpenRouter 模型同步预览；
- 能力和价格变化对比；
- 质量档位配置；
- 场景连通性测试；
- OpenRouter 余额和预算摘要。

超管必须人工确认模型导入、能力变化和路由切换。

### 11.5 状态反馈

- 内容区加载使用与最终结构一致的 Skeleton；
- 长任务显示阶段、已用时间和安全状态，不显示虚假百分比；
- 失败就地展示原因和可执行的重试操作；
- 已完成镜头继续可见，不因其他任务刷新消失；
- 高费用操作使用明确确认对话框，展示预计费用和影响；
- 动效只用于状态变化，并遵循 reduced motion；
- 页面、表格和底部操作区必须处理 `min-h-0` 与内部滚动，避免内容截断。

## 12. 权限与未来租户开放

### 12.1 平台权限

新增：

- `platform.social_media.read`
- `platform.social_media.create`
- `platform.social_media.review`
- `platform.social_media.manage`

继续复用：

- `platform.ai_config.read`
- `platform.ai_config.manage`

现有 `platform.social_video.manage` 在迁移期映射到新的内容管理能力，完成菜单、API 和角色
迁移后再通过单独 forward migration 停用，不直接删除历史权限。

### 12.2 角色边界

- 运营人员：查看、创建和编辑内容；
- 审核人员：审核成片；
- 内容负责人：归档和管理项目；
- AI 配置人员：维护模型和场景，不自动获得内容编辑权限；
- 平台超管：显式获得所有有效 `platform.*` 权限。

操作权限固定如下，不能只依赖菜单可见性：

| 操作 | read | create | review | manage | ai_config.manage |
|---|---:|---:|---:|---:|---:|
| 查看项目、任务、资产 | ✓ | ✓ | ✓ | ✓ | — |
| 创建、编辑、生成、重试 | — | ✓ | — | ✓ | — |
| 确认高费用生成 | — | ✓ | — | ✓ | — |
| 审核通过/拒绝 | — | — | ✓ | ✓ | — |
| 下载审核通过的发布包 | ✓ | ✓ | ✓ | ✓ | — |
| 归档、授权撤回、强制取消 | — | — | — | ✓ | — |
| 同步模型、修改路由 | — | — | — | — | ✓ |

### 12.3 租户开放

一期所有项目使用 `scope_type=platform`。数据模型与 service 合同同时支持
`scope_type=tenant` 和非空 `tenant_id`，但没有租户入口。

阶段四开放租户时：

- 复用同一套内容生产组件；
- 租户只能访问自己的项目、素材和任务；
- 租户只能选择业务质量档位，不能选择具体模型；
- 平台按套餐开放文字、图片、视频和配音能力；
- 租户品牌资料进入经过允许的 Prompt 和输出模板；
- 租户额度不足时在创建供应商任务前失败关闭。

## 13. 费用与额度

### 13.1 计量单位

- 文字：输入、输出和缓存 token；
- 图片：张数、尺寸、质量和模型 SKU；
- 视频：秒数、分辨率、画幅、是否生成音频和模型 SKU；
- 配音：字符数或音频秒数；
- 内部合成：记录计算耗时，首版不计入 OpenRouter 费用。

不同模态不能统一伪装为 token。

供应商原币费用使用受控 decimal string 写入 PostgreSQL `numeric(24,12)`，TypeScript 不使用
浮点数计算费用。账本同时保存原币、币种、价格快照和可选报表币种换算快照；预计与实际
费用展示保留供应商精度，最终状态明确区分 `estimated | reserved | settled | adjusted`。

### 13.2 平台控制

- OpenRouter 余额预警；
- 平台单日和单月预算；
- 员工每日生成上限；
- 单项目预算；
- 单任务费用上限；
- 图片、视频和配音分别设置并发上限；
- 预计供应商费用达到按模态配置的阈值时二次确认；路由启用前必须明确配置单次上限和确认
  阈值，缺失时该路由不可用；高质量视频无论是否达到阈值都二次确认；
- 余额或预算不足时不创建 Provider 任务。

平台额度不是展示性检查。创建任务 RPC 必须在同一事务中按固定顺序锁定平台月、平台日、
员工日、项目和任务预算桶，在同一事务写入预占和 `queued` 任务。并发请求只能有一方消费
最后可用额度；失败、取消或结算通过账本追加记录释放，不能直接覆盖余额。

预占使用任务硬上限计算，而不是平均估价：文字固定最大输入/输出 token，图片固定数量、尺寸
和质量，视频固定最大秒数/分辨率，配音固定最大字符数。任务创建后若模型价格快照变化，
Worker 不得沿用旧预估提交，必须重新估价并要求重新确认。正常实际费用必须小于等于预占；
若供应商账单异常超过预占，账本仍按实际成本追加结算，任务生成状态保持真实结果，计费状态
标记 `overrun`，冻结该路由的新任务并告警人工对账，禁止通过截断账单维持表面预算不超限。
存在 `overrun` 的项目可查看生成资产，但在 manage 权限完成账务调整前不能创建 release package。

Worker 提交前若发现价格快照变化，将任务原子改为 `awaiting_budget_reconfirmation` 并释放 claim，
此状态不可被 Worker claim。运营人员拒绝时，RPC 取消任务并释放原预占；确认时，RPC 按固定
预算锁序原子释放/调整旧预占、写入新价格快照和确认审计，再把任务变为 `queued`。确认请求
必须携带任务预期版本，不能在普通 PATCH 中分步完成。

### 13.3 租户结算

后续租户使用采用平台统一额度：

```text
费用预估 -> 冻结租户额度 -> 创建任务 -> 按实际费用结算 -> 释放差额
```

失败任务释放未消费额度；重复幂等请求返回首次结果，不重复冻结或扣费。平台任务记录费用，
但归入平台运营预算，不扣租户额度。

### 13.4 供应商提交、未知结果与对账

外部调用不能与数据库事务形成原子提交，因此采用持久化提交意图和补偿：

1. 原子创建任务、预算预占、不可变请求快照与 `submit_intent`；
2. Worker 以租约 claim 意图，若供应商支持幂等键则传稳定的供应商幂等键；
3. 收到供应商任务 ID 或同步结果后，以租约匹配 RPC 持久化；
4. 网络超时且无法判断是否已受理时进入 `submission_unknown`，不得自动切备用模型或重提交；
5. 能按供应商幂等键/任务查询恢复时完成绑定；不能查询时由运营人员核对 Activity 后决定
   “已受理绑定”“确认未受理后重试”或“计费异常关闭”；
6. 主模型明确返回“未受理”的可重试错误时，才允许使用新的受控 attempt 切备用模型；
7. Webhook、轮询和取消竞态都通过同一 provider task ID、generation attempt 和租约完成；
8. 供应商已消费但本地任务失败时仍记实际成本，不伪装为零费用；
9. 对账任务比较 Activity、provider task、ledger 和资产，差异只追加调整记录并保留审计。

每种模态的 Adapter 必须规范化一个非空 `billing_correlation_id`：优先使用供应商 task ID，
同步接口使用 OpenRouter response/generation/request ID。能力探针无法获得能与 Activity 稳定关联
的 ID 时，该模型不能启用付费生产路由。原始 ID 只存内部任务和账本，不进入公开 DTO。

供应商不支持取消时，“取消”只停止后续处理并明确展示可能已产生费用；供应商返回的已完成
资产仍进入隔离区完成对账，未经人工恢复不绑定到项目。

## 14. 安全、隐私与内容合规

- API Key 只保存在现有加密系统配置边界，永不返回前端；
- 不在前端或数据库公开 payload 保存原始 Provider 错误；
- 只向 OpenRouter 发送当前任务所需的最小素材与文本；
- 抖音描述、转写、上传文本和素材元数据全部视为不可信输入：与系统指令分区传递，长度和
  字段白名单限制，不允许其改变工具、模型、作用域、密钥或系统 Prompt；
- 外部链接内容标明来源，不自动声明为公司原创；
- 上传或选择人物、客户、工地、声音、音乐素材前必须保存授权主体、证明文件、允许渠道、
  用途、地域、起止时间和撤回状态；缺失、过期或已撤回时禁止新生成与导出；
- 从项目、施工日志或图片库选材时，API 重新校验来源租户、项目读取权限、媒体授权和用途，
  平台身份不默认获得跨租户宣传使用权；
- 素材敏感级别综合人工声明、客户/项目隐私字段和自动安全扫描，取最严格结果；只有 manage
  权限可以在保留理由和审计的前提下收紧或处理误判，不能放宽法务授权限制；
- 一期只使用供应商授权音色，不支持真人声音克隆；
- 全 AI 视频任务明确提示视频生成不具备 ZDR；
- 敏感客户素材默认禁止进入全 AI 视频场景；
- AI 生成资产保存模型、Provider、提示词版本、生成时间和审核状态；
- 输入前和输出后执行严格文本/媒体安全检查；安全服务不可用、结果未知或命中高风险时失败
  关闭并进入人工审核，禁止虚假承诺、违法内容、侵权内容和未经允许的联系信息；
- 最终发布前必须人工审核；
- Provider 临时下载 URL 不写入对外 DTO，不长期保存为最终资产；
- 文件下载只允许经过校验的 HTTPS Host、Content-Type 和流式大小硬限制；每次重定向重新
  校验 Host 和解析后的 IP，拒绝私网、环回、链路本地、元数据地址和 DNS 重绑定；媒体解析
  在受限 Worker 中执行，并限制时长、像素、解码资源、工作目录和执行时间；
- Webhook、Worker claim、重试和终态更新都必须具备幂等和租约保护。
- 上传文件在绑定业务前校验 magic bytes、扩展名、媒体结构和恶意内容，剥离非必要 EXIF/GPS；
  扫描服务不可用、格式伪造或扫描失败时进入隔离区，不能用于生成或下载。

### 14.1 保留、撤回与删除

- 临时供应商 URL 加密、仅 Worker 可读，最多保留 24 小时；若官方有效期更短则采用更短值；
- 失败/取消的临时媒体按配置的短保留期清理，阶段一默认 7 天；
- 草稿项目和私有资产保留期由平台策略配置，审核通过的发布包按内容授权期限约束；
- 用户隐私删除、客户授权撤回、版权撤回或合同到期可以物理删除 COS 字节；
- 不物理删除仅适用于费用、审核和审计最小事实，不适用于必须清除的原始个人媒体；
- 删除后保留不可逆 hash、对象类型、删除时间、原因和操作人 tombstone，不保留可还原内容；
- 已导出内容在授权撤回后标为“禁止继续使用”，工作台保留历史导出审计并提示人工下架。

授权撤回按派生成果矩阵执行：若授权仅允许特定成片且未要求衍生删除，则冻结新生成并保留
已获授权发布包；若授权覆盖原素材及所有衍生使用的权利一并撤回，则原媒体、AI 参考生成物、
封面和包含该素材的成片全部冻结导出并进入删除/人工下架流程。系统以授权记录的
`derivative_rights` 与 `revocation_scope` 为准，不由操作人临时猜测。

## 15. 状态机与失败恢复

### 15.1 内容项目

```text
draft -> extracting -> planning -> storyboarding -> producing -> ready_to_render
      -> rendering -> pending_review -> approved -> archived
      -> attention_required
```

- 项目状态是各子任务事实的汇总快照，不替代子任务状态；
- 任一步失败进入 `attention_required`，恢复后回到由子任务推导的阶段；
- 只有已确认内容方案和分镜版本可以生产，只有资产齐备的确认分镜可以合成；
- `approved` 绑定不可变 release package；任何修改必须复制内容方案/分镜并创建新 render；
- `archived` 不接受新任务，具有 manage 权限的操作人可以恢复为 `draft`。

### 15.2 生成任务

```text
awaiting_budget_reconfirmation -> queued
queued -> submitting -> submitted -> processing -> succeeded
                  -> submission_unknown
awaiting_budget_reconfirmation/queued/submitting/submission_unknown/submitted/processing
  -> failed | canceled
```

`submission_unknown` 只能通过供应商查询/Activity 对账迁移为 `submitted/processing/succeeded`，
或在获得“明确未受理”证据后迁移回同一 attempt 的 `queued` 并复用供应商幂等键。无法证明
是否受理时只能人工关闭为 `failed`；后续主动重生成必须创建新的 generation attempt。终态不
允许被迟到回调或旧 Worker 覆盖。

生成状态与计费状态正交；生成成功后发现费用超额只更新账本和计费状态，不把可用资产伪装为
生成失败，也不允许计费状态绕过 release package 的财务门禁。

### 15.3 合成与审核

```text
queued -> preparing -> rendering -> validating -> pending_review
       -> failed
pending_review -> approved | rejected
```

`succeeded` 不再作为审核前中间态；技术合成成功即进入 `pending_review`。审核事实写入独立追加
表，拒绝后复制新版本并创建新的 render job，不能把旧 render 改回 queued。

### 15.4 恢复、备用模型与取消

- 只重试失败步骤；
- 保留已成功资产；
- 同一镜头新生成结果不会静默覆盖已审核资产；
- 只有明确“供应商未受理”的可重试失败才按路由切换备用模型；超时未知、已开始计费、内容
  安全、余额、权限、能力不匹配和请求非法均不自动切换；
- 费用上限触发时暂停并等待人工确认；
- Webhook 丢失时由低频轮询恢复；
- Worker 租约过期后允许安全重领；
- 旧租约、旧回调和重复事件均不产生第二份资产或第二次计费。

Worker 默认最多 3 次本地处理尝试，指数退避并带抖动；租约必须心跳续期，超过运行时限进入
卡死检测。耗尽后进入人工可见的失败队列，不无限重试。Worker 必须限制并发、磁盘、下载、
FFmpeg 时间和工作目录，`finally` 清理临时文件；优雅停机先停止 claim，再等待或安全释放租约。

### 15.5 音频、字幕与成片标准

- 目标 MP4：H.264 High、AAC-LC、`yuv420p`、9:16 默认 1080×1920、默认 30fps；
- 目标时长允许相对项目配置误差不超过 500ms，超出即校验失败；
- 音频目标综合响度 `-16 LUFS`、true peak 不高于 `-1 dBTP`；
- TTS 先取得实际音频时长，镜头不足时默认延长静态/可循环画面，不通过加速语音强塞；
- 字幕时间优先使用 TTS word/segment timing；缺失时运行受控 forced alignment，不按字符平均
  分配冒充真实时间；
- 背景音乐默认 duck 到人声之下，具体阈值在阶段三 fixture 中固定；
- 供应商音频、字幕和最终媒体都经 `ffprobe`/解码 smoke 后才绑定业务资产。

## 16. 分阶段交付

该项目不作为一个大提交实现。每个阶段分别形成规格、实施计划、TDD、数据库 Gate 和独立
评审。

### 阶段一：多模态 AI Gateway 2.0

- 开发配置能力探针和严格脱敏 fixture；
- OpenRouter 配置与模型目录同步；
- 四类 Adapter；
- 场景、质量档位、主备模型和费用边界；
- `ai_generation_jobs`、平台预算预占、费用账本与 Worker claim；
- 视频 Webhook、轮询兜底和 COS 转存；
- 平台调用日志和用量摘要。

独立验收：

1. 四个业务接口都只创建异步本地任务，HTTP 不等待外部生成；
2. 平台日/月、员工、项目和任务预算通过真实并发测试证明不会超卖；
3. 同幂等命令不重复供应商调用，主动重新生成可创建新 attempt；
4. 模拟提交超时进入 `submission_unknown`，不会自动重提或切备用模型；
5. 文字、图片、配音同步供应商结果与视频异步结果都通过租约 RPC 完成；
6. 新资产只写私有 COS，并只能取得短期授权 URL；
7. OpenRouter Activity 与本地 ledger 能按 provider task 对账；
8. Adapter fixture、能力变化、错误脱敏、ACL、RLS、claim 和类型检查全部通过。

### 阶段二：内容项目与分镜

- 内容项目与来源；
- 抖音标题/描述与转写分离；
- 内容方案与结构化分镜；
- 分镜版本和逐镜头生产；
- 真实素材混合与全 AI 模式。

独立验收：

1. 原发布标题/描述、语音转写和手工降级来源分别保存、分别展示；
2. extraction job 与现有 transcription 可恢复关联，项目刷新不丢状态；
3. 内容方案和发布文案有不可变版本，运营确认与后续消费只读取明确版本，不读取临时草稿；
4. 分镜增删、排序、复制、并发版本和单镜头重生成通过状态机测试；
5. 真实长视频可设置合法入点/出点、适配、焦点和原声音量；
6. 项目/客户素材必须通过来源权限与有效授权，跨租户反例稳定拒绝；
7. 所有列表分页，详情批量读取有上限且无 N+1。

### 阶段三：视频合成与审核

- 合成 Worker；
- 字幕、配音、背景音乐和转场；
- 媒体校验与 COS 成片；
- 预览、审核、下载和素材包导出。

独立验收：

1. 固定 fixture 合成的 codec、画幅、帧率、时长、音频响度和字幕时间均达标；
2. 合成失败只重试当前 render，不覆盖分镜或已成功资产；
3. 审核人、时间、理由、规则版本和每次决策均可追溯；
4. 拒绝后从新版本创建新 render，旧审核事实保持不可变；
5. release package 只引用审核通过的成片、封面、字幕和内容方案版本；
6. 权限、授权到期、撤回、短期下载 URL 和字节删除/tombstone 行为通过测试；
7. 成片和素材导出不由 API 进程缓冲大文件。

### 阶段四：租户开放

- 租户套餐开关；
- 租户额度冻结与结算；
- 品牌与素材隔离；
- 租户入口和平台用量管理。

独立验收：

1. 经产品、财务和法务批准的租户计价规格已版本化落库，并通过套餐、积分换算、币种、
   加价、税费、舍入和价格快照合同测试；
2. 租户只能选择套餐开放的能力与质量档位，不能读取模型 ID 或平台密钥；
3. 租户余额沿用阶段一预占/结算接口，并通过并发、失败释放和对账测试；
4. 跨租户项目、素材、任务、费用和签名 URL 均在数据库与 service 双层拒绝；
5. 租户入口发布不改变平台项目和历史任务合同。

## 17. 测试与验证

### 17.1 自动化测试

- Zod 输入、响应与 Provider payload 严格合同；
- 抖音原描述与语音转写分离；
- 项目、分镜和任务状态机；
- 幂等键、请求哈希、generation attempt 和预算预占；
- 平台预算并发超卖、结算、释放、账本和 Activity 对账；
- 提交成功但本地确认超时、`submission_unknown`、人工恢复与重复回调；
- 主备模型切换；
- Webhook 签名、时间窗口、重复事件和迟到事件；
- Worker claim、租约过期和并发重领；
- 大文件大小、类型、Host 与下载超时；
- COS 转存和 `platform_file_objects` 引用；
- 私有 COS、短期签名 URL、孤儿对象清理和删除 tombstone；
- 租户和平台作用域隔离；
- service role 表直写拒绝、带租约/作用域 RPC 和跨租户 Worker 反例；
- 权限矩阵；
- 分页和批量查询边界；
- FFmpeg 最小固定样本合成与媒体探测；
- 原始错误、API Key、临时 URL 和敏感输入不进入公开响应。
- Prompt 注入、不可信描述、重定向、DNS 重绑定、私网 IP 和解码资源限制。

### 17.2 数据库 Gate

- migration dry-run 精确列出本阶段文件；
- local apply、migration list 对齐和 post dry-run up to date；
- catalog 验证 RLS、ACL、SECURITY DEFINER、固定 search_path 和索引；
- 本地真实并发验证幂等、claim、租约和费用；
- 代表性数据 `EXPLAIN ANALYZE`；
- 官方 local typegen 无语义漂移；
- direct dev Gate 只在开发项目可连接并完成 preflight 后执行；
- 已应用 migration 不回改，缺陷使用 forward repair。

### 17.3 媒体 Smoke

- 一条可公开使用的短抖音链接；
- 一套公司授权图片和视频；
- 一条全 AI 30 秒、9:16 内容；
- 一条真实素材混合内容；
- 图片、视频、配音和最终 MP4 全部转存 COS；
- 视频、音频、字幕和封面可正常预览；
- 失败任务可只重试失败步骤；
- 输出费用与 OpenRouter Activity 对账。

## 18. 一期验收标准

1. 抖音链接提取结果分别展示原发布标题/描述与语音转写；
2. 任一来源失败时明确降级，不互相冒充；
3. 能生成默认 9:16、30 秒的结构化分镜；
4. 镜头可以编辑、增删、排序、替换素材和单独重试；
5. 真实素材混合模式可以选择公司图片或视频；
6. 全 AI 模式可以生成图片、视频片段和配音；
7. 图片、视频、音频、字幕和导出文件全部转存私有 COS；结构化文字保存在版本化数据库记录；
8. 能合成带字幕和配音的标准 MP4；
9. 人工审核后可下载视频、封面、发布标题与描述；
10. 页面刷新后状态、已完成镜头和费用不丢失；
11. 重复提交不重复生成或计费；
12. 权限、余额、模型和内容错误返回稳定中文业务码；
13. 平台可以按项目、员工、模型和日期查看费用；
14. 平台与租户作用域在数据库和 service 合同中可验证隔离；
15. 未经审核不能进入可导出终态；
16. 不存在自动发布、声音克隆或未授权模型直连入口。

## 19. 发布、回滚与运维

- 每个阶段独立 migration、API、Admin 和 Worker 发布；
- 模型路由变更不要求重新部署业务代码；
- 新模型导入与场景切换保留审计和旧快照；
- 模型异常时可停用新任务并切回上一条已验证路由；
- Worker 发布使用路径感知构建，不因无关服务变更全量构建；
- 内容项目默认采用归档与状态停用；费用、审核和最小审计事实不物理删除，但隐私删除、授权
  撤回和版权到期按第 14.1 节清除可还原媒体字节；
- 破坏性回滚先停用新入口与任务 claim，再切回旧路由；
- 已生成和已审核资产继续保留；
- 数据库结构缺陷使用新的 forward repair migration，不回改已应用 migration；
- 自媒体工作台的主备路由都通过 OpenRouter；“备用供应商”仅指 OpenRouter 内另一个已验证
  上游模型供应商，不绕到现有 DeepSeek/OpenAI 直连密钥。OpenRouter 整体不可用或任一模态
  无可用兼容模型时暂停对应能力，不伪造成功。现有其他 AI 场景的直连路由不在本项目改动。

### 19.1 可观测性和运维门禁

阶段一开始即记录并按模态/模型/场景聚合：

- 本地队列深度、排队时间、总时延、成功率和取消率；
- `submission_unknown` 数量和最长停留时间；
- Worker 活跃租约、过期租约、尝试耗尽和工作目录清理失败；
- COS 转存失败、孤儿对象、悬空文件记录和签名 URL 失败；
- 预算预占、供应商实际费用和 Activity 对账差异；
- Webhook（如启用）签名失败、重复、迟到和轮询恢复量。

阶段实施计划必须为以上指标给出开发环境告警阈值和运维页面，不在本总设计中凭空固定生产
SLO。任何对账差异、长期 unknown、孤儿租约或孤儿对象都进入明确待处理列表，不能只写日志。

## 20. 实施顺序决策

书面评审通过后，先为“阶段一：多模态 AI Gateway 2.0”编写独立实施计划。

阶段一验收通过后，再分别为内容项目与分镜、视频合成与审核、租户开放编写后续计划。
禁止把四个阶段合并为一次大规模实现或一次大 migration。
