# 抖音小程序内容完善、预算初算与线索闭环设计

**日期：** 2026-08-20

**状态：** 已确认，待实施规划

**目标租户：** 固始晴天装饰工程有限公司

**拒审原因：** 小程序功能不完整且可用性低，请丰富小程序内容和功能，提高用户体验

## 1. 决策摘要

本次不通过简单更换租户名称或堆叠静态页面解决拒审问题，而是围绕装修用户的完整决策路径补齐可用功能：

1. 将“公开案例”和“在建工地”合并为统一的“项目实景”，按项目阶段筛选，避免重复内容。
2. 底部导航调整为“首页 / 项目实景 / 预算初算 / 免费量房”。
3. 预算初算采用“规则引擎计算金额区间 + AI 解释预算”的混合方案。
4. 规则结果立即返回；AI 建议随后生成，AI 失败不能影响预算功能。
5. 免费量房采用“用户提交期望时间、公司二次确认”的预约申请模式。
6. 预约先进入目标租户的抖音线索池。已有客户按租户和手机号自动关联；新线索由员工确认有效后人工转为客户。
7. 提审前执行内容、功能、隐私、后台承接和三宿主完整链路验收；不满足门槛时阻止提审。

“固始晴天装饰工程有限公司”已存在有效商家授权。本设计不把模板开发租户或商家授权事实写死到小程序代码，运行时仍从有效安装关系解析租户。实际切换、发布和提审属于后续实施，不在本设计阶段执行。

## 2. 背景与现状

当前抖音小程序已经具备首页、公司信息、案例、工地、短信验证和预约提交，但存在以下问题：

- 案例和工地来自同一批项目，内容结构高度相似，容易重复展示。
- 目标租户公开内容中存在测试名称、时间戳、精确楼栋房号和疑似客户姓名，不适合直接发布。
- 公司简介较短，缺少 Logo、首页横幅、资质和可信信息。
- 部分项目缺少图片、户型、面积、风格、预算或公开说明。
- 当前项目服务将公开说明固定映射为 `null`，详情页会显示“设计说明正在完善”。
- 当前预约提交只写入 `marketing_leads`，未形成目标租户可操作的抖音线索工作台、量房预约记录和预算关联闭环。
- 当前已有营销线索人工转客户能力，但抖音线索权限和租户工作台尚未形成完整可操作入口。
- 当前拒审同时覆盖抖音、抖音极速版和火山宿主，后续不能只验证单一模拟器。

## 3. 目标与非目标

### 3.1 目标

- 让审核人员无需登录即可完成浏览真实项目、计算装修预算和提交量房申请的完整路径。
- 让同一个项目根据生命周期自然从施工中变为已完工，不维护两套重复内容。
- 让预算金额由租户可维护、可版本化、可追溯的规则产生。
- 让 AI 只解释既有预算结果，不虚构价格、不替代正式报价。
- 让预约真实进入后台，并能分配、跟进、判无效或转为客户。
- 保持租户隔离、手机号去重、隐私授权和幂等提交。
- 建立可执行的提审前内容门禁与三宿主 smoke 清单。

### 3.2 非目标

本阶段不实现：

- 用户账号中心、订单中心或支付。
- AI 独立定价、正式报价或合同报价。
- 量房人员实时排班、在线改期或用户端预约状态中心。
- 登录后保存长期预算历史。
- 复杂装修 BOM、材料 SKU 级报价或施工图识别。
- 自动把所有新线索直接创建为客户。
- 修改 `/Users/leefo/Public/work/orange` 仓库。

## 4. 用户信息架构

### 4.1 底部导航

底部导航统一为：

1. 首页
2. 项目实景
3. 预算初算
4. 免费量房

公司介绍和隐私政策保留为二级页面，不占用底部导航。

### 4.2 首页

首页按以下顺序组织：

1. 公司品牌、服务区域和核心能力。
2. 装修服务流程。
3. 预算初算主入口。
4. 项目实景精选，使用阶段标签区分“施工中”和“已完工”。
5. 免费量房入口和真实服务说明。

首页只展示一个项目模块。同一个项目不得同时以案例和工地身份重复出现。

### 4.3 项目实景

列表提供“全部 / 施工中 / 已完工”筛选。公开阶段由项目领域状态派生：

```text
started、constructing -> in_progress（施工中）
acceptance            -> completed（已完工）
其他状态              -> 默认不进入公开列表
```

项目公开与否仍受独立发布状态控制。项目阶段变化不需要重新创建公开内容。

项目详情统一展示：

- 公开标题与阶段标签；
- 户型、面积、风格和预算区间；
- 公开项目说明；
- 实景图片；
- 对施工中项目展示施工节点和公开日志；
- 对已完工项目突出完工效果；
- 预算初算和免费量房行动入口。

内部项目名称、客户姓名、手机号、精确楼栋单元房号和内部日志不得直接进入公开 DTO。

## 5. 统一公开项目模型

新增一套以 `(tenant_id, project_id)` 为唯一键的项目公开资料，不设置 `content_kind`：

```text
douyin_project_public_profiles
- id
- tenant_id
- project_id
- public_title
- public_description
- style_tags
- budget_band
- publication_status: draft | published | hidden
- published_at
- created_at
- updated_at
```

项目阶段、面积和户型继续以现有项目与房产数据为事实来源；公开标题、说明、风格和预算区间来自公开资料。服务层负责生成脱敏 DTO，并且只有 `published` 且项目处于允许阶段的记录可以返回。

公开列表必须分页，默认 `page=1&pageSize=20`，`pageSize` 最大 100。查询限定必要字段、使用 `.range()`，批量读取封面和日志摘要，禁止 N+1。

现有 `/douyin-mini/cases` 与 `/douyin-mini/sites` 在客户端切换完成前保持兼容，但必须由同一统一项目查询适配，不能继续维护两套数据逻辑。新客户端稳定后再单独规划弃用，不在本阶段直接删除旧接口。

## 6. 预算初算设计

### 6.1 计算原则

预算金额只能由确定性规则计算：

```text
预算区间 = 面积 × 档次单价区间 × 房屋现状系数 + 选配项目区间
```

第一期输入字段：

- 建筑面积：必填；
- 房屋现状：毛坯、旧房翻新；
- 装修档次：经济、舒适、品质；
- 装修范围：全屋、局部；
- 户型和风格：选填；
- 个性需求：选填自由文本；
- 选配项目：拆除、水电重点改造、定制柜体等租户启用项。

第一期输出：

- 预计总价区间；
- 基础施工、水电、主材、定制和其他分类区间；
- 计算依据和主要价格影响因素；
- 包含项、未包含项；
- 报价版本和有效时间；
- “初步估算，不构成最终报价”的明确说明。

### 6.2 报价配置

报价按租户和版本维护：

```text
douyin_budget_pricing_versions
- id
- tenant_id
- version_no
- status: draft | active | archived
- effective_from
- effective_to
- currency
- disclaimer
- created_by_employee_id
- created_at
- updated_at

douyin_budget_pricing_items
- id
- pricing_version_id
- category_code
- item_code
- label
- unit
- minimum_amount
- maximum_amount
- condition_payload
- sort_order
- status
```

同一租户任一时刻只能有一个有效报价版本。版本启用后不原地修改价格，价格调整创建新版本，保证历史预算可追溯。`condition_payload` 只允许服务端识别的固定条件结构，不能执行客户端表达式。

### 6.3 预算快照

```text
douyin_budget_estimates
- id
- tenant_id
- douyin_miniapp_installation_id
- subject_hash
- pricing_version_id
- request_payload
- result_payload
- ai_status: pending | succeeded | failed | skipped
- ai_analysis
- ai_provider
- ai_model
- expires_at
- created_at
- updated_at
```

`request_payload` 和 `result_payload` 使用服务端生成的受控 JSON 结构。预算编号对客户端公开，数据库 UUID 不直接作为用户展示编号。匿名预算默认保留 30 天；关联有效预约后按线索和预约的数据保留策略处理。

预算计算不要求手机号、姓名、详细地址或登录。相同报价版本和相同输入必须产生一致结果。

### 6.4 AI 边界

新增 AI 场景 `douyin_budget_explanation`，复用现有 OpenAI-compatible AI Gateway、场景路由、用量记录和结构化响应校验模式。

AI 输入仅包含：

- 非身份化的房屋和装修条件；
- 规则引擎计算结果；
- 租户允许公开的服务范围和计价说明。

AI 输出仅允许：

- 用户需求摘要；
- 预算分配建议；
- 可能超预算的需求；
- 优先保留或调整建议；
- 量房时需要确认的问题。

AI 不得：

- 生成规则结果以外的新金额；
- 修改总预算上下限；
- 承诺最终成交价、工期或“不超预算”；
- 输出姓名、手机号、详细地址等个人信息；
- 替代正式量房和合同报价。

AI 使用低温度和 `json_object` 响应。后端使用 Zod 校验字段、长度和金额边界；无法解析或越界时将本次 AI 结果标为失败，不向客户端展示原始模型输出。

### 6.5 两阶段响应

预算采用两阶段接口，避免 AI 阻塞核心功能：

1. `POST /douyin-mini/budget-estimates` 在规则计算完成后立即返回预算结果。
2. `POST /douyin-mini/budget-estimates/:id/ai-analysis` 生成或读取 AI 建议。

小程序先展示完整预算，再显示 AI 生成状态。AI 超时、限流、配置缺失或供应商失败时，页面保留规则预算并将 AI 区域降级为普通预算说明。

## 7. 免费量房、线索与客户闭环

### 7.1 预约模式

免费量房是预约申请，不是实时确认。用户提交：

- 称呼；
- 手机号与短信验证码；
- 小区名称；
- 期望量房日期；
- 时间段：上午、下午、晚间；
- 预算编号：可选；
- 装修需求：可选；
- 当前隐私政策版本和同意时间；
- 幂等键和来源归因。

详细门牌号不强制在小程序收集，由工作人员后续确认。

成功页必须展示预约申请编号、服务公司、期望时间和公司配置的预计联系时限。文案使用“申请已提交，工作人员将与你确认具体时间”，不得在公司确认前宣称预约时间已确认。

### 7.2 数据关系

新增量房预约记录：

```text
douyin_measurement_appointments
- id
- appointment_no
- tenant_id
- douyin_miniapp_installation_id
- marketing_lead_id
- customer_id nullable
- budget_estimate_id nullable
- preferred_visit_date
- preferred_visit_period
- community
- status: pending_confirmation | confirmed | completed | canceled | invalid
- confirmed_visit_at nullable
- assigned_employee_id nullable
- source_snapshot
- created_at
- updated_at
```

`marketing_lead_id` 必填，`customer_id` 在匹配已有客户或人工转化后填写。预约状态与营销线索状态分离：线索描述获客质量和转化，预约描述量房服务进度。

### 7.3 线索先入池、条件式关联客户

提交预约时，在一个受控数据库命令中完成：

1. 校验安装关系、租户状态、短信验证码、隐私版本、幂等键和预算归属。
2. 创建或更新 `source = douyin_miniapp` 的营销线索。
3. 创建量房预约并关联预算快照。
4. 按 `(tenant_id, phone)` 查找现有客户。
5. 若客户已存在，只关联 `customer_id`，不覆盖负责人、状态、姓名和已有资料。
6. 若客户不存在，线索保持 `new`，不自动创建客户。
7. 产生目标租户后台通知或待处理任务。
8. 返回同一幂等请求对应的原预约结果。

不同幂等键可以创建不同预约，但服务端应在提交前提示同一手机号近期存在待确认预约，避免误重复。现有 24 小时营销线索去重可以保留；预约需要独立幂等事实，不能仅依赖手机号合并。

### 7.4 人工转客户

员工确认线索有效后执行“转为客户”：

- 再次按 `(tenant_id, phone)` 去重；
- 复用已有客户或创建 `status = potential`、`source = douyin` 的客户；
- 将营销线索设为 `converted` 并写入 `customer_id`；
- 将关联预约补写 `customer_id`；
- 写入客户来源时间线，来源标签为“抖音小程序”，元数据包含安装、线索、预约、预算和归因编号；
- 预算快照、AI 建议和预约信息可以从客户详情查看；
- 操作必须幂等，重复转化返回同一客户。

无效、超出服务范围或明确拒绝的线索标为 `invalid`，预约同步标为 `invalid` 或 `canceled`，不进入客户库。

### 7.5 后台工作台

目标租户后台增加“抖音线索”工作台，复用已存在的权限：

- `douyin_lead.read`：分页查看权限范围内的抖音线索；
- `douyin_lead.assign`：分配或改派负责人；
- `douyin_lead.follow_up`：记录联系、到店和上门等跟进；
- `douyin_lead.convert`：转为客户；
- `customer.create`：创建新客户时仍需客户创建权限。

列表默认 `page=1&pageSize=20`，最大 100，支持状态、负责人、日期和关键词筛选。列表查询限定必要字段并批量补充客户、负责人和预约摘要，禁止 N+1。

详情展示：

- 来源和归因；
- 用户填写内容；
- 预算规则结果和 AI 建议；
- 预约期望时间与状态；
- 已关联客户；
- 跟进记录和转化结果。

## 8. API 契约

所有 `/douyin-mini/*` 业务接口要求有效 `douyin_miniapp` 会话，由会话中的安装关系解析租户，客户端不能传入或改变 `tenant_id`。所有响应使用 `ResponseHandler.success`，错误通过 `error-factory.ts` 映射。

### 8.1 项目列表

`GET /douyin-mini/projects?page=1&pageSize=20&phase=in_progress|completed`

- `phase` 可选；
- 返回 `list` 和标准分页对象；
- 只返回已发布且阶段允许的脱敏项目；
- 旧 cases/sites 接口在兼容期复用同一服务。

### 8.2 项目详情与日志

```text
GET /douyin-mini/projects/:id
GET /douyin-mini/projects/:id/logs?page=1&pageSize=20
```

不存在、未发布、跨租户或阶段不可公开时统一返回公开内容不存在，不能泄露内部项目事实。

### 8.3 预算配置

`GET /douyin-mini/budget-config`

只返回当前有效报价版本允许用户选择的字段、选项、公开说明和免责声明，不返回内部成本、毛利或管理备注。

### 8.4 创建预算

`POST /douyin-mini/budget-estimates`

请求示意：

```json
{
  "area": 110,
  "property_condition": "rough",
  "decoration_tier": "comfortable",
  "decoration_scope": "whole_house",
  "layout": "三室两厅",
  "style": "现代简约",
  "option_codes": ["custom_cabinet"],
  "demand": "需要较多收纳"
}
```

响应包含公开预算编号、分类区间、总区间、计算依据、版本和免责声明，不返回内部定价规则表达式。

### 8.5 AI 预算建议

`POST /douyin-mini/budget-estimates/:id/ai-analysis`

- 预算必须属于当前租户和当前小程序主体；
- 已成功生成时返回已有结果，避免重复计费；
- 正在生成时返回稳定的处理中状态；
- AI 失败时返回可识别的降级状态，不把整次预算请求判为失败。

### 8.6 短信与预约提交

继续使用：

```text
POST /douyin-mini/sms/send
POST /douyin-mini/leads
```

扩展预约提交字段：

```json
{
  "name": "李先生",
  "phone": "13800138000",
  "sms_code": "123456",
  "community": "示例小区",
  "preferred_visit_date": "2026-08-25",
  "preferred_visit_period": "afternoon",
  "budget_estimate_id": "公开预算编号",
  "demand": "希望确认柜体和水电范围",
  "privacy_policy_version": "v1",
  "consented_at": "2026-08-20T10:00:00+08:00",
  "idempotency_key": "uuid",
  "attribution": {}
}
```

响应增加：

```json
{
  "lead_id": "uuid",
  "appointment_no": "DYLF-20260820-000001",
  "already_submitted": false,
  "existing_customer_linked": false,
  "status": "pending_confirmation",
  "message": "量房申请已提交，工作人员将与你确认具体时间"
}
```

客户端只展示 `appointment_no`，不展示内部客户 ID。

### 8.7 租户后台接口

建议新增：

```text
GET  /tenant/douyin-miniapp/leads?page=1&pageSize=20
GET  /tenant/douyin-miniapp/leads/:id
POST /tenant/douyin-miniapp/leads/:id/assign
POST /tenant/douyin-miniapp/leads/:id/follow-ups
POST /tenant/douyin-miniapp/leads/:id/convert-customer
POST /tenant/douyin-miniapp/leads/:id/mark-invalid
```

所有写操作包含幂等键或版本条件。转换和判无效由数据库命令保证营销线索、预约、客户和来源记录一致更新。

## 9. 错误、降级与安全

### 9.1 预算错误

- 无有效报价版本：返回“预算初算暂未开放”，不能让 AI 临时报价。
- 输入越界：Zod 返回明确字段错误。
- 报价版本并发切换：单次计算固定使用开始时解析到的版本。
- AI 超时、限流、配置缺失或格式异常：保留规则预算，AI 状态标为失败。
- 同一预算重复触发 AI：成功结果复用；进行中请求不重复调用模型。

### 9.2 预约错误

- 短信错误或过期：保留客户端表单内容。
- 隐私政策版本变化：要求重新勾选同意。
- 重复提交：相同幂等键返回原预约；相同键不同内容返回冲突。
- 预算过期：允许预约，但明确提示需要现场重新评估。
- 预算跨租户、跨主体或不存在：拒绝关联，不能泄露记录。
- 服务区域不匹配：给出明确提示，并由产品配置决定允许咨询还是阻止量房申请。
- 后台通知失败：预约事实仍成功，记录告警并允许后台任务补偿。

### 9.3 数据和隐私

- AI 输入不包含姓名、手机号、详细地址和原始请求 IP。
- 小程序项目 DTO 不包含客户身份和精确门牌信息。
- 手机号展示遵守现有客户手机号权限和脱敏规则。
- 所有新增表启用 RLS，并撤销 anon/authenticated 直写权限；数据库命令仅授予 service role。
- 日志不得打印短信验证码、手机号、API 密钥、AI 原始敏感输入或安装密钥。
- 匿名预算按主体、设备摘要和 IP 限流；不引入新缓存或队列。

## 10. 数据库与迁移约束

所有表、索引、约束、函数、触发器、RLS 和初始化配置必须通过 `supabase/migrations/` 提交。

建议索引至少覆盖：

- 公开项目 `(tenant_id, publication_status, project_id)`；
- 报价版本 `(tenant_id, status, effective_from, effective_to)`；
- 预算 `(tenant_id, subject_hash, created_at desc)`；
- 预约 `(tenant_id, status, created_at desc)`；
- 预约 `marketing_lead_id`、`customer_id`、`budget_estimate_id`；
- 抖音线索 `(tenant_id, source, lead_status, created_at desc)`；
- 客户 `(tenant_id, phone)` 继续使用现有唯一索引。

迁移应用前执行 dry-run 并确认待执行清单；应用后使用 `supabase migration list` 验证 Local/Remote 对齐。回滚采用前向迁移：先关闭预算和预约新入口，使客户端回退到兼容接口，再撤销新命令和表。已经生成的客户、线索、预约和预算历史不得通过回滚批量删除。

## 11. 内容提审门禁

以下数值是本项目内部发布标准，不宣称是抖音官方固定数量要求：

- 公司名称、Logo、简介、服务区域和联系电话完整；
- 公司简介包含真实业务范围、服务流程和优势，不能使用简短占位文案；
- 至少 6 个真实公开项目，施工中和已完工各不少于 2 个；
- 每个公开项目至少 3 张真实图片，并补齐标题、面积、户型、风格、预算区间和说明；
- 至少 2 个施工中项目具有可公开的施工节点或日志；
- 不存在 E2E、Smoke、测试时间戳、“可删除”等测试内容；
- 不存在客户姓名、手机号、精确门牌号等公开隐私；
- 首页、列表、详情、预算和预约页面无空白区块、重复项目、失效图片和无响应控件；
- 目标安装关系、租户状态、有效报价版本、隐私政策版本和短信服务全部可用。

任一硬门槛不满足时，发布预检必须返回阻断项，不允许只给警告后继续提审。

## 12. 测试与验收

### 12.1 静态和单元验证

- 项目阶段映射、公开脱敏和分页边界；
- 预算纯函数的面积边界、档次、房屋系数、选配项、舍入和确定性；
- 报价版本生效区间和单一 active 约束；
- AI Prompt 不包含 PII，响应结构和金额边界严格校验；
- AI 失败时规则预算不受影响；
- 预约 schema、短信、隐私版本和幂等冲突；
- 已有客户自动关联但不覆盖资料；
- 新线索不自动建客户；
- 人工转化按租户手机号去重并关联预约、预算和来源；
- 无效线索不进入客户库；
- controller 只处理 HTTP，service 编排，repository/RPC 访问数据库；
- 所有错误通过 `error-factory.ts`。

### 12.2 API smoke

至少覆盖：

1. 获取统一项目列表和详情；
2. 规则预算立即成功；
3. AI 成功和 AI 降级；
4. 预约短信发送与校验；
5. 预约重复提交；
6. 后台列表出现目标租户线索；
7. 已有客户自动关联；
8. 新线索人工转客户；
9. 转化后客户详情可见预算、预约和来源；
10. 标记无效后客户库无新增记录。

### 12.3 三宿主体验验收

分别在抖音、抖音极速版和当前发布配置包含的火山宿主完成：

```text
进入首页
-> 浏览项目实景
-> 查看项目详情
-> 完成预算初算
-> 查看 AI 建议或 AI 降级结果
-> 提交量房预约
-> 后台确认收到线索
-> 人工转为客户
```

每个宿主检查页面布局、图片、滚动、按钮、短信、返回栈、弱网错误和重复点击。耗时浏览器或模拟器 smoke 必须在最小类型检查和单元验证通过后执行。

### 12.4 提审材料

- 功能说明列出项目实景、装修预算初算、AI 预算建议和免费量房预约；
- 审核备注提供无需内部账号的完整体验路径；
- 审核环境短信真实可用，不使用隐藏测试绕过；
- 准备首页、项目、预算结果和预约成功页截图；
- 准备一次从首页到后台收到线索的完整录屏；
- 提审前确认安装关系和发布目标为“固始晴天装饰工程有限公司”，不是 5H 验收租户；
- 保存三宿主 smoke 记录和发布预检结果。

## 13. 分层与所有权

后端遵守现有分层：

- controller：读取 request、Zod 校验、调用 service、包装 `ResponseHandler.success`；
- service：租户上下文、预算计算、AI 编排、线索与客户领域转换；
- repository / gateway：Supabase、RPC、短信和 AI Gateway；
- 数据一致性：跨营销线索、预约、客户和来源记录的写入由受控 RPC 原子完成。

当前仓库 `gooes` 负责：

- `apps/api` 后端接口和业务编排；
- `apps/admin` 租户抖音线索和报价配置后台；
- `apps/douyin-mini` 抖音小程序页面与接口接入；
- `packages/domain` 共享状态、DTO 和权限契约；
- `supabase/migrations` 所有数据库变更。

`/Users/leefo/Public/work/orange` 不属于本次改动范围，保持只读且无需承担本设计的客户端实现。

## 14. 成功标准

本次工作的完成条件是：审核人员能够独立完成一次真实、有信息价值的装修浏览、预算和预约路径；预约能够被目标公司后台真实承接；员工能够区分无效线索、关联已有客户或人工转为新客户；AI 故障不破坏预算功能；三个发布宿主均通过 smoke；提审包不包含测试内容、隐私泄露或空白功能。

该设计只能降低拒审风险，不能承诺平台必然审核通过。若再次拒审，应以新审核意见和宿主复现证据为基础定位根因，不通过盲目增加页面规避审核。
