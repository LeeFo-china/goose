# 多租户改造阶段 3 Todo：业务模块租户化

日期：2026-05-09

## 目标

将核心业务闭环中的费用、施工日志、工序验收、摄像头、任务中心、自媒体脚本等模块纳入租户隔离。

## 前置条件

- 阶段 2 完成。
- 客户、项目、员工隔离已稳定。
- 业务模块使用的项目、客户、员工关联都可校验租户归属。

## Todo

### 1. 施工日志

- [x] `project_logs` 增加或回填 `tenant_id`。
- [x] 日志创建时从项目继承 `tenant_id`。
- [x] 日志列表按 `tenant_id` 过滤。
- [x] 日志详情校验所属租户。
- [x] 日志评论按 `tenant_id` 或通过日志归属隔离。
- [x] 客户侧日志接口校验客户与项目同租户。

### 2. 费用审批

- [x] `expense_requests` 增加或回填 `tenant_id`。
- [x] 创建费用申请时写入当前租户。
- [x] 项目费用申请校验项目属于当前租户。
- [x] 审批人只能来自当前租户员工。
- [x] 费用列表、详情、审批操作全部加租户边界。
- [x] 费用统计按租户统计。

### 3. 工序验收

- [x] `project_acceptances` 增加或回填 `tenant_id`。
- [x] 验收项、操作记录、open ticket 关联租户上下文。
- [x] 发起验收时从项目继承租户。
- [x] 领导复核只能操作当前租户项目。
- [x] 客户确认校验客户与验收单同租户。
- [x] 短信 ticket 持久化 `tenant_id`。
- [x] 异步短信发送带租户上下文。

### 4. 工地摄像头

- [x] `project_cameras` 增加或回填 `tenant_id`。
- [x] 绑定摄像头时校验项目属于当前租户。
- [x] 腾讯云 IoT Video SIP 配置保持平台级配置，不写入租户业务表。
- [x] 后端从环境变量或 `system_settings(tenant_id is null)` 读取 SIP 参数。
- [x] 摄像头列表按租户过滤。
- [x] 播放地址获取校验租户边界。
- [x] 租户创建设备时，腾讯云设备编码写入 `project_cameras` 并绑定 `tenant_id`。
- [x] `/admin/cameras` 只返回当前租户设备。
- [ ] `/platform/cameras` 预留给平台超管查看全量设备。

### 5. 任务中心

- [x] 待办聚合全部按 `tenant_id` 过滤。
- [x] 客户跟进待办只返回当前租户客户。
- [x] 项目日志待办只返回当前租户项目。
- [x] 费用审批待办只返回当前租户单据。
- [x] 工序验收待办只返回当前租户验收单。

### 6. 自媒体脚本

- [x] `social_video_transcriptions` 增加或回填 `tenant_id`。
- [x] `social_video_scripts` 增加或回填 `tenant_id`。
- [x] 创建转写任务时写入当前租户。
- [x] worker 领取任务时保留租户上下文。
- [x] 脚本生成、历史列表、admin 列表按租户过滤。
- [x] 保留并校验 `audio_duration_seconds`，用于统计识别时长。
- [x] 确认腾讯云 ASR 和 Apify 解析结果都能尽量写入音视频时长。
- [x] `audio_duration_seconds` 允许为空；无法获取时长时不阻塞转写完成。
- [x] 统计识别时长时只聚合有值记录，并记录无时长任务数。
- [x] 按租户统计：
  - 转写任务数
  - 成功任务数
  - 失败任务数
  - 总识别时长
  - 平均单条时长
  - 无时长任务数
  - AI 脚本生成次数
  - provider 分布
- [ ] 如需用量报表，设计 `tenant_social_video_usage_daily` 汇总表。
- [ ] 平台超管如需查看全局脚本，走 `/platform/*`。

### 7. 系统配置

- [x] `system_settings` 支持平台级和租户级。
- [x] 配置读取优先租户，缺失回退平台默认。
- [x] 腾讯云 SIP、AI API Key、AI endpoint、默认模型、对象存储基础配置保持平台级。
- [x] 短信签名、H5 品牌色、自定义 Logo、租户文案偏好属于租户级配置。
- [x] 配置审计记录 `tenant_id`。

### 8. 多 AI Provider 与场景路由

- [x] 保留当前 DeepSeek 配置兼容。
- [x] 抽象统一 `aiGateway`。
- [x] 非流式业务调用统一走 `aiGateway`。
- [ ] 装修问答流式接口迁移到支持流式响应的 `aiGateway`。
- [x] 新增或设计 `ai_providers`。
- [x] 新增或设计 `ai_models`。
- [x] 新增或设计 `ai_scene_routes`。
- [x] 支持按 `scene_code` 选择 primary model。
- [x] 支持 fallback model。
- [x] 支持场景级参数：
  - temperature
  - response_format
  - timeout_ms
- [x] 新增或设计 `ai_call_logs`。
- [x] `ai_call_logs` 可记录 `tenant_id` 做用量归因。
- [x] `ai_call_logs` 标准化记录：
  - prompt_tokens
  - completion_tokens
  - total_tokens
- [x] 不同供应商 token 字段在 `aiGateway` 层归一化。
- [x] 供应商未返回 token 时字段允许为空，不作为真实计费依据。
- [ ] admin 系统配置页支持平台切换 provider/model。
- [x] MVP 不支持租户自带 AI Key。

### 9. 集成测试

- [x] 已提供阶段 3 双租户验收脚本 `bun run verify:tenant:phase3`。
- [x] 静态租户范围审计脚本已覆盖阶段 3 业务表。
- [ ] A 租户不能访问 B 租户费用。
- [ ] A 租户不能访问 B 租户验收。
- [ ] A 租户不能访问 B 租户摄像头。
- [ ] A 租户任务中心不出现 B 租户待办。
- [ ] 自媒体 worker 不串租。
- [ ] 短信通知不串租。
- [ ] AI 调用日志能正确记录 `tenant_id`。
- [ ] AI 调用日志能正确记录 token 用量。
- [ ] AI provider fallback 不影响业务接口结构。

## 验收标准

- [ ] 主要业务模块全部有租户边界。
- [ ] 异步任务创建和执行都能拿到 `tenant_id`。
- [ ] 租户级配置读取链路可用。
- [ ] 双租户业务模块集成测试通过。

## 不做事项

- 不做 H5/营销完整租户化。
- 不做平台线索。
- 不做平台租户管理 UI。
