# 系统场景 API 与 Admin 执行计划

> Scope: 用户批准的 1–2；使用 subagent-driven-development 连续实施和两阶段审查。

## 执行状态

- [x] Task 1 实施、定向/扩展测试、API 类型检查与构建。
- [x] Task 1 隔离 PostgreSQL 正反 fixture；规格与质量两阶段审查。
- [x] Task 2 Admin 实施与浏览器回归。
- [x] Task 2 规格与质量审查、最终合并验证。

验证记录：`docs/operations/evidence/2026-09-11-system-ai-scenes-api-admin.md`。

## 契约与边界

- `GET /platform/ai-config/system-scenes?page=1&pageSize=20` 返回标准 PageData；最大 100。
- 场景项：`code,name,modality,required_input_modalities,runtime_status,requirements_source,requires_streaming,min_reference_images,source,allow_new_configuration`。
- 注册表固定十个 system 场景；现存未知编码回填 legacy，禁止新建 legacy。所有现存路由 ID、编码和绑定保留。
- POST 以选择的 `scene_code` 查注册表，服务端推导 modality；名称允许省略并默认中文名称。显式冲突的 modality 拒绝。
- PATCH 读取现存路由，scene_code/modality 不得改变，合并主备模型后完整校验；保留 expected_version CAS 和明确冲突错误。
- 不接入 Ark AK/SK、不修改真实模型记录、不调用收费模型、不发布、不在应用开发库执行 migration。

## Task 1：注册表、migration 与后端

1. 阅读 schema/ai-config.ts、services/ai-config/index.ts、repositories/ai-config.ts、repositories/ai-model-catalog.ts、controllers/ai-config/index.ts 与相邻测试。
2. 先添加失败测试：系统场景分页/权限、未知与 legacy 创建拒绝、身份变更拒绝、PATCH 省略模态仍拒绝不匹配模型、合并主备重复拒绝、版本与重复场景档位冲突。
3. 用 `supabase migration new register_system_ai_scenes` 创建 migration；固定十项种子，对历史模态冲突先检查，回填 legacy，增加引用/身份保护与 RLS/授权，保留全部历史路由。附隔离 PostgreSQL fixture，禁止在应用库运行。
4. repository 增加限定字段的 getSceneRouteById、getSystemSceneByCode、分页 listSystemScenes；service 负责推导和完整校验；controller 只校验 HTTP/权限并包装输出。
5. Bun 定向测试与 API typecheck；独立 spec review 后 quality review，修复后复查。

## Task 2：Admin 场景选择和模型候选状态

1. 阅读 ai-model-routing-panel.tsx、ai-model-route-tab.tsx、ai-model-routing-shared.ts、ai-config-types.ts、调用页与既有 E2E mock。
2. 先写回归用例：选择供应商自动请求、空/加载/错误重试、候选分页、快速切换迟到响应不覆盖、只读权限、旧配置保留、未接通生图明确不可用。
3. 场景使用中文选择器，只读显示 code/modality；新建限制 allow_new_configuration，编辑保留 legacy 身份。
4. 候选请求带 page/pageSize/modality/keyword，主备分别管理加载/错误/请求代次，供应商或场景变更清理不兼容选项；保存时锁定表单并保留选中项跨页身份。
5. 复用本地 shadcn 控件与 Admin 样式，不改供应商密钥/删除行为、不扩展 Ark 目录。
6. 最小静态检查通过后运行 mock E2E，检查桌面与窄屏截图；独立 spec review 后 quality review。

## 交付验证

- 重跑 domain 场景测试、API 定向测试和类型检查、Admin 类型检查与相关 E2E。
- migration 在隔离 PostgreSQL 验证种子、历史保留、权限与约束；若环境不可用如实记录，不在真实应用库试运行。
- 记录验证命令、结果、待应用 migration 和回滚原则：回滚须另行审核 migration，不删除历史路由。
- 本轮只交付本地实现和验证，不推送含历史凭证扫描阻塞的 feature 历史。
