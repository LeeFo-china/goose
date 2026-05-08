# 项目工序验收节点方案

本文档用于定义“项目每到一个工序完工后，由项目监理发起标准化验收，上一层领导和业主查看并确认通过”的完整落地方案。

目标不是把验收简单做成一条施工日志，而是做成独立、可追溯、可标准化、可被多方确认的项目质量管理流程。

## 一、业务目标

当前项目已有施工日志能力，适合记录每日施工进展、现场照片、节点说明。但“工序完工验收”比施工日志更强约束，需要解决这些问题：

- 每个工序有统一验收标准，不能完全依赖监理自由填写。
- 监理需要逐项对照标准确认，并上传对应现场照片。
- 上一层领导需要复核监理提交的验收结果。
- 业主需要查看验收内容和现场照片，并完成确认。
- 验收过程要能保留责任人、时间、照片、意见、驳回原因。
- 验收未通过时，需要回到整改状态，整改后重新提交。
- 项目详情里能看到当前工序验收状态和历史验收记录。

推荐把这个能力命名为“项目验收”或“工序验收”，和“施工日志”保持关联但不混用。

## 二、角色与权限

### 1. 项目监理

项目监理是验收发起人。

权限：

- 查看自己负责项目的验收节点。
- 发起工序验收。
- 按标准逐项填写验收结果。
- 为每个验收项上传现场照片。
- 提交给上级复核。
- 在被驳回后补充整改说明和照片，再次提交。

建议权限码：

- `project_acceptance.read`
- `project_acceptance.create`
- `project_acceptance.update_own`
- `project_acceptance.submit`

### 2. 上一层领导

上一层领导是内部复核人。这里不要写死某个岗位，建议按项目成员或岗位规则配置。

推荐优先级：

1. 项目绑定的 `construction_manager` 施工经理。
2. 如果没有施工经理，走部门岗位规则里的工程负责人。
3. 如果仍找不到，允许系统管理员在 admin 后台手动指定复核人。

权限：

- 查看待自己复核的验收单。
- 查看监理提交的标准项、结果、照片和说明。
- 通过验收。
- 驳回验收，填写驳回原因和整改要求。

建议权限码：

- `project_acceptance.review`
- `project_acceptance.reject`

### 3. 业主

业主是外部确认人。

权限：

- 在小程序端查看自己项目的验收单。
- 查看验收标准、现场照片、监理说明、领导复核状态。
- 确认通过。
- 提交异议或要求补充说明。

业主不应修改监理填写的验收项，只能做确认或反馈。

### 4. 管理员

管理员负责标准模板和异常处理。

权限：

- 管理验收模板。
- 管理验收项。
- 查看全部项目验收。
- 手动指定复核人。
- 在特殊情况下关闭或作废验收单。

## 三、核心对象

### 1. 验收模板

验收模板是统一标准的来源。例如：

- 拆改验收
- 水电验收
- 防水验收
- 瓦工验收
- 木工验收
- 油工验收
- 安装验收
- 竣工验收

模板字段建议：

| 字段 | 说明 |
| :--- | :--- |
| `id` | 模板 ID |
| `stage_code` | 对应施工阶段，例如 `plumbing_electrical` |
| `name` | 模板名称，例如“水电验收标准” |
| `description` | 模板说明 |
| `status` | `active` / `inactive` |
| `sort_order` | 排序 |
| `version` | 模板版本 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

模板需要版本号。已经发起的验收单应快照当时的模板内容，避免后续修改模板后影响历史验收记录。

### 2. 验收标准项

验收项是模板下的逐项检查标准。

字段建议：

| 字段 | 说明 |
| :--- | :--- |
| `id` | 标准项 ID |
| `template_id` | 所属模板 |
| `category` | 分类，例如“安全”“工艺”“材料”“观感” |
| `title` | 检查项标题 |
| `standard` | 标准描述 |
| `required` | 是否必检 |
| `allow_not_applicable` | 是否允许选择不适用 |
| `photo_required` | 是否必须上传照片 |
| `photo_min_count` | 最少照片数 |
| `photo_max_count` | 最多照片数 |
| `input_type` | `pass_fail` / `text` / `number` / `select` |
| `options` | 选项配置，适用于 select |
| `sort_order` | 排序 |
| `status` | `active` / `inactive` |

推荐 MVP 先只支持 `pass_fail` 和备注，不做复杂数值录入。需要数量、尺寸、偏差类验收时再扩展 `number`。

`not_applicable` 不能默认开放给所有标准项。模板项需要显式配置 `allow_not_applicable = true`，监理才可以选择“不适用”。核心工艺项、合同约定必做项、质量安全项建议默认不允许“不适用”，避免关键验收项被绕过。

### 3. 项目验收单

项目验收单是某个项目、某个工序、某次发起的实际验收记录。

字段建议：

| 字段 | 说明 |
| :--- | :--- |
| `id` | 验收单 ID |
| `project_id` | 项目 ID |
| `stage_code` | 工序阶段 |
| `template_id` | 使用的模板 ID |
| `template_version` | 使用的模板版本 |
| `title` | 验收标题，例如“水电验收” |
| `status` | 当前状态 |
| `initiator_id` | 发起监理 employee_id |
| `reviewer_id` | 内部复核人 employee_id |
| `customer_id` | 业主 customer_id |
| `submitted_at` | 监理提交时间 |
| `reviewed_at` | 领导复核时间 |
| `customer_confirmed_at` | 业主确认时间 |
| `completed_at` | 整体完成时间 |
| `rejected_at` | 最近驳回时间 |
| `reject_reason` | 最近驳回原因 |
| `reject_source` | 最近驳回来源：`leader` / `customer` |
| `summary` | 监理整体说明 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

状态建议：

| 状态 | 说明 |
| :--- | :--- |
| `draft` | 草稿，监理可编辑 |
| `submitted` | 已提交，等待领导复核 |
| `leader_approved` | 领导已通过，等待业主确认 |
| `customer_confirmed` | 业主已确认 |
| `rejected` | 被领导或业主驳回，等待整改 |
| `resubmitted` | 整改后再次提交 |
| `cancelled` | 已作废 |

MVP 可以简化为：

- `draft`
- `submitted`
- `leader_approved`
- `customer_confirmed`
- `rejected`
- `cancelled`

业主“有疑问”的状态流转建议：

- MVP 继续统一进入 `rejected`，避免状态机过早复杂化。
- 必须通过 `project_acceptance_actions.action` 和 `reject_source` 区分来源：
  - 领导驳回：`action = leader_reject`，`reject_source = leader`
  - 业主提出疑问：`action = customer_dispute`，`reject_source = customer`
- 前端展示时不要只看 `status = rejected`，还要结合最近一条 action 或 `reject_source` 显示为“领导驳回”或“业主有疑问”。

后续如果业务发现业主异议和领导驳回需要不同 SLA、不同统计、不同处理链路，再增加 `customer_disputed` 中间状态。第一版先不增加，减少接口和前端状态分支。

### 4. 验收单明细项

验收单明细项是模板项的快照和监理填写结果。

字段建议：

| 字段 | 说明 |
| :--- | :--- |
| `id` | 明细 ID |
| `acceptance_id` | 验收单 ID |
| `template_item_id` | 来源模板项 ID |
| `category` | 分类快照 |
| `title` | 标题快照 |
| `standard` | 标准描述快照 |
| `required` | 是否必检快照 |
| `allow_not_applicable` | 是否允许不适用快照 |
| `photo_required` | 是否必须上传照片快照 |
| `result` | `pass` / `fail` / `not_applicable` |
| `remark` | 监理备注 |
| `rectification_remark` | 整改说明 |
| `rectification_images` | 整改后图片路径数组 |
| `images` | 图片路径数组 |
| `sort_order` | 排序 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

校验规则：

- 必检项必须填写结果。
- `allow_not_applicable = false` 的项不能提交 `not_applicable`。
- 提交 `not_applicable` 时必须填写不适用说明，建议复用 `remark`。
- `photo_required = true` 的项必须上传至少 1 张图片。
- 任一必检项为 `fail` 时，不允许提交为通过状态，只能保存草稿或提交为“需整改”。
- 图片建议沿用现有 `POST /uploads/images` 能力，新增 `scene=project_acceptance`。

### 5. 验收操作记录

为了审计和售后追溯，需要记录每一次操作。

字段建议：

| 字段 | 说明 |
| :--- | :--- |
| `id` | 记录 ID |
| `acceptance_id` | 验收单 ID |
| `operator_type` | `employee` / `customer` / `system` |
| `operator_id` | 操作人 ID |
| `action` | `create` / `submit` / `approve` / `reject` / `confirm` / `cancel` |
| `from_status` | 操作前状态 |
| `to_status` | 操作后状态 |
| `comment` | 操作说明 |
| `created_at` | 操作时间 |

## 四、推荐标准模板

MVP 可以先内置 8 个模板，对齐当前施工日志阶段：

| 阶段 | 模板名称 | 典型检查项 |
| :--- | :--- | :--- |
| `measure` | 量房复核 | 房屋尺寸、原始结构、门窗洞口、强弱电箱位置 |
| `demolition` | 拆改验收 | 拆除范围、墙体安全、垃圾清运、保护措施 |
| `plumbing_electrical` | 水电验收 | 线管走向、强弱电间距、管线固定、打压测试、防水基层 |
| `tiling` | 瓦工验收 | 空鼓检查、平整度、阴阳角、坡度、缝隙 |
| `woodwork` | 木工验收 | 基层牢固、尺寸偏差、收口、柜体结构 |
| `painting` | 油工验收 | 墙面平整、阴阳角、裂缝、色差、基层处理 |
| `installation` | 安装验收 | 开关插座、洁具、五金、柜门、灯具 |
| `completion` | 竣工验收 | 全屋功能、观感、保洁、遗留问题、交付资料 |

示例：水电验收模板

| 分类 | 检查项 | 标准 | 图片 |
| :--- | :--- | :--- | :--- |
| 安全 | 强弱电间距 | 强弱电管线保持合理间距，交叉处有保护处理 | 必传 |
| 工艺 | 线管固定 | 管线固定牢靠，转弯顺畅，无明显破损 | 必传 |
| 工艺 | 水管打压 | 打压测试结果正常，无渗漏 | 必传 |
| 材料 | 材料品牌规格 | 与合同或确认单一致 | 选传 |
| 现场 | 水电照片归档 | 关键点位照片完整，便于后期维修查询 | 必传 |

示例：瓦工验收模板

| 分类 | 检查项 | 标准 | 图片 |
| :--- | :--- | :--- | :--- |
| 工艺 | 瓷砖空鼓 | 空鼓范围符合公司验收标准 | 必传 |
| 工艺 | 墙地砖平整度 | 表面平整，无明显高低差 | 必传 |
| 工艺 | 卫生间坡度 | 地漏排水方向正确，无明显积水 | 必传 |
| 观感 | 缝隙和对缝 | 缝隙均匀，对缝合理 | 选传 |

## 五、业务流程

### 1. 监理发起

入口：

- admin 项目详情页
- 小程序员工端项目详情页
- 项目施工日志页的“发起验收”入口

流程：

1. 监理选择项目。
2. 选择工序阶段。
3. 系统自动匹配当前启用的验收模板。
4. 系统生成验收单草稿，并快照模板项。
5. 监理逐项填写：
   - 通过 / 不通过 / 不适用
   - 备注
   - 现场照片
6. 监理填写整体验收说明。
7. 点击提交。
8. 系统校验必填项和必传照片。
9. 状态变为 `submitted`。
10. 通知上一层领导。

### 2. 领导复核

入口：

- admin 待办中心
- admin 项目详情页
- 小程序员工端待办

流程：

1. 领导打开待复核验收单。
2. 查看标准项、监理结果、现场照片。
3. 可查看项目最近施工日志作为辅助信息。
4. 选择通过或驳回。
5. 通过后状态变为 `leader_approved`。
6. 系统通知业主确认。
7. 驳回后状态变为 `rejected`，监理收到整改通知。

### 3. 业主确认

入口：

- 小程序客户端项目详情页
- 小程序消息通知
- 项目进度页验收卡片

流程：

1. 业主查看验收单摘要。
2. 查看每个验收项和现场照片。
3. 查看领导复核结果。
4. 点击确认通过。
5. 状态变为 `customer_confirmed`。
6. 系统写入完成时间 `completed_at`。

如果业主有异议：

1. 点击“有异议”。
2. 填写说明，可上传图片。
3. 状态回到 `rejected`。
4. 监理处理后重新提交。

MVP 明确规则：

- 业主有疑问不单独新增 `customer_disputed` 状态。
- 状态统一变为 `rejected`。
- 操作记录写入 `action = customer_dispute`。
- 验收单写入 `reject_source = customer`、`reject_reason = 业主填写内容`。
- 监理端展示为“业主有疑问”，不要展示成“领导驳回”。

这样第一版状态机保持简单，同时保留后续拆分 `customer_disputed` 的数据依据。

### 4. 整改再提交

流程：

1. 监理查看驳回原因。
2. 修改不合格项。
3. 对所有上一次为 `fail` 的项目重新确认。
4. 补充整改说明和整改后照片。
5. 再次提交。
6. 重新走领导复核和业主确认。

MVP 明确规则：

- 整改后不要求所有验收项全量重验，但所有上一次为 `fail` 的项目必须重新验证。
- 上一次为 `fail` 的项目，再次提交时必须变为 `pass` 或由领导认可为 `not_applicable`。
- 上一次为 `fail` 的项目必须填写 `rectification_remark`。
- 上一次为 `fail` 且 `photo_required = true` 的项目，必须补充 `rectification_images`。
- 未失败的项目允许保留原结果，但监理可以主动更新。
- 再次提交后，领导复核页需要高亮展示“整改前结果、整改说明、整改后照片”。

### 5. 重复发起限制

同一个项目、同一个工序允许保留历史多次验收记录，但不能同时存在多个未完成验收单。

MVP 规则：

- 同一 `project_id + stage_code` 下，如果存在 `draft`、`submitted`、`leader_approved`、`rejected` 状态的验收单，不允许再次发起。
- 已经 `customer_confirmed` 或 `cancelled` 的验收单不阻止再次发起。
- 如果确实需要重新验收，应该在原验收单上整改再提交，或由管理员作废后重新发起。

推荐后端做强校验，前端只做提示。错误文案建议：

```json
{
  "message": "该工序已有进行中的验收单，请处理完成后再发起"
}
```

## 六、接口设计建议

### 1. 验收模板

```http
GET /project-acceptance-templates
```

查询启用模板列表。

```http
GET /project-acceptance-templates/:id
```

查询模板详情，包含标准项。

```http
POST /project-acceptance-templates
PATCH /project-acceptance-templates/:id
```

admin 管理模板。

### 2. 项目验收单

```http
GET /project-acceptances
```

查询验收单列表。

查询参数建议：

| 参数 | 说明 |
| :--- | :--- |
| `project_id` | 按项目过滤 |
| `status` | 按状态过滤 |
| `stage_code` | 按工序过滤 |
| `reviewer_id` | 按复核人过滤 |
| `customer_id` | 按业主过滤 |
| `page` | 页码 |
| `pageSize` | 每页数量 |

```http
POST /project-acceptances
```

发起验收草稿。

请求示例：

```json
{
  "project_id": "project-id",
  "stage_code": "plumbing_electrical",
  "template_id": "template-id"
}
```

后端行为：

- 校验当前员工是否为项目监理或有发起权限。
- 查找模板。
- 创建验收单。
- 快照模板项到验收单明细。
- 返回验收单详情。

```http
GET /project-acceptances/:id
```

查询验收单详情。

```http
PATCH /project-acceptances/:id
```

保存草稿内容。

```http
POST /project-acceptances/:id/submit
```

监理提交验收。

```http
POST /project-acceptances/:id/approve
```

领导复核通过。

```http
POST /project-acceptances/:id/reject
```

领导或业主驳回。

```http
POST /project-acceptances/:id/customer-confirm
```

业主确认通过。

```http
POST /project-acceptances/:id/cancel
```

管理员作废。

### 3. 图片上传

沿用现有图片上传接口：

```http
POST /uploads/images
```

建议前端传：

```text
scene=project_acceptance
project_id=<project_id>
```

后端可按项目和验收场景归档。

## 七、数据表建议

### 1. `project_acceptance_templates`

```sql
create table public.project_acceptance_templates (
  id uuid primary key default gen_random_uuid(),
  stage_code text not null,
  name text not null,
  description text null,
  version int not null default 1,
  status text not null default 'active',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 2. `project_acceptance_template_items`

```sql
create table public.project_acceptance_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.project_acceptance_templates(id) on delete cascade,
  category text null,
  title text not null,
  standard text not null,
  required boolean not null default true,
  allow_not_applicable boolean not null default false,
  photo_required boolean not null default false,
  photo_min_count int not null default 0,
  photo_max_count int not null default 9,
  input_type text not null default 'pass_fail',
  options jsonb null,
  sort_order int not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 3. `project_acceptances`

```sql
create table public.project_acceptances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_code text not null,
  template_id uuid null references public.project_acceptance_templates(id),
  template_version int not null default 1,
  title text not null,
  status text not null default 'draft',
  initiator_id uuid not null references public.employees(id),
  reviewer_id uuid null references public.employees(id),
  customer_id uuid null references public.customers(id),
  summary text null,
  submitted_at timestamptz null,
  reviewed_at timestamptz null,
  customer_confirmed_at timestamptz null,
  completed_at timestamptz null,
  rejected_at timestamptz null,
  reject_reason text null,
  reject_source text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

建议索引：

```sql
create index project_acceptances_project_id_idx on public.project_acceptances(project_id);
create index project_acceptances_status_idx on public.project_acceptances(status);
create index project_acceptances_reviewer_id_idx on public.project_acceptances(reviewer_id);
create index project_acceptances_customer_id_idx on public.project_acceptances(customer_id);
create index project_acceptances_project_stage_idx on public.project_acceptances(project_id, stage_code);
```

建议增加一个部分唯一索引，防止同一项目同一工序重复发起进行中的验收：

```sql
create unique index project_acceptances_one_open_stage_idx
on public.project_acceptances(project_id, stage_code)
where status in ('draft', 'submitted', 'leader_approved', 'rejected');
```

### 4. `project_acceptance_items`

```sql
create table public.project_acceptance_items (
  id uuid primary key default gen_random_uuid(),
  acceptance_id uuid not null references public.project_acceptances(id) on delete cascade,
  template_item_id uuid null references public.project_acceptance_template_items(id),
  category text null,
  title text not null,
  standard text not null,
  required boolean not null default true,
  allow_not_applicable boolean not null default false,
  photo_required boolean not null default false,
  photo_min_count int not null default 0,
  photo_max_count int not null default 9,
  result text null,
  remark text null,
  rectification_remark text null,
  rectification_images jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 5. `project_acceptance_actions`

```sql
create table public.project_acceptance_actions (
  id uuid primary key default gen_random_uuid(),
  acceptance_id uuid not null references public.project_acceptances(id) on delete cascade,
  operator_type text not null,
  operator_id uuid null,
  action text not null,
  from_status text null,
  to_status text not null,
  comment text null,
  created_at timestamptz not null default now()
);
```

## 八、前端交互建议

### 1. admin 项目详情

在项目详情里增加“工序验收”tab。

页面结构：

- 顶部项目摘要：项目名、客户、地址、当前状态、项目监理。
- 验收进度条：量房、拆改、水电、瓦工、木工、油工、安装、竣工。
- 验收列表：按工序展示最新验收状态。
- 右上角按钮：发起验收。

列表字段：

- 工序
- 验收标题
- 发起人
- 当前状态
- 复核人
- 业主确认状态
- 最近更新时间
- 操作

操作：

- 查看详情
- 继续编辑
- 提交
- 复核通过
- 驳回
- 作废

### 2. 监理填写页

建议做成移动端友好的逐项卡片：

- 标准项标题
- 标准说明
- 通过 / 不通过 / 不适用
- 备注
- 图片上传
- 图片预览

底部固定操作：

- 保存草稿
- 提交验收

提交前校验：

- 必检项未填，定位到第一项。
- 必传照片未上传，提示具体项。
- 有不通过项时，提示“当前存在未通过项，不能提交为通过验收”。

### 3. 领导复核页

领导不需要重新填写所有项，重点是快速审阅：

- 顶部显示验收结论摘要。
- 按分类折叠标准项。
- 标出不通过、不适用、缺少照片等风险项。
- 照片支持全屏预览。
- 底部固定“通过 / 驳回”。

驳回必须填写原因。

### 4. 业主确认页

业主端要避免太专业，建议展示为：

- 工序名称
- 本次验收结论
- 监理说明
- 关键照片
- 检查清单
- 公司复核结果

按钮：

- 确认通过
- 我有疑问

“我有疑问”不要直接叫“驳回”，面向业主更友好。

## 九、和施工日志的关系

推荐关系：

- 施工日志记录日常过程。
- 工序验收记录标准化节点结果。
- 两者可以互相关联，但不能混为一张表。

可选增强：

- 发起验收时，自动带出该工序最近 5 条施工日志。
- 验收完成后，自动生成一条施工日志：“水电验收已完成”。
- 小程序项目进度页把验收完成状态作为里程碑展示。

## 十、和项目进度的关系

MVP 阶段验收模块独立运行，不自动改变项目主状态，也不自动推进项目工序阶段。

明确规则：

- 验收完成不等于项目主状态自动变化。
- `customer_confirmed` 只表示该工序验收闭环完成。
- 项目状态仍由现有项目管理流程人工或独立规则更新。
- 前端可以在项目详情展示“水电验收已完成”，但不要因此自动把项目推进到下一阶段。

原因：

- 真实施工中，一个工序验收完成后，可能还需要材料进场、客户确认、整改收尾或内部排期。
- 自动推进项目状态容易造成项目进度误判。
- 后续如果要自动推进，应单独设计规则，例如“当前工序验收完成 + 无未关闭整改项 + 项目经理确认”。

## 十一、通知与待办

### 1. 监理提交后

通知对象：

- 复核领导

通知内容：

```text
项目【xxx】提交了【水电验收】，请及时复核。
```

### 2. 领导通过后

通知对象：

- 业主

通知内容：

```text
您的项目【xxx】已完成【水电验收】内部复核，请查看并确认。
```

### 3. 驳回后

通知对象：

- 项目监理

通知内容：

```text
项目【xxx】的【水电验收】需要整改，请查看原因并重新提交。
```

### 4. MVP 通知实现

MVP 建议使用“数据库通知表 + 小程序订阅消息”的组合，不直接依赖短信。

推荐实现：

- 后端业务动作成功后，同步写入 `notifications` 表或后续新增的统一通知表。
- 小程序端通过通知列表或待办接口拉取站内通知。
- 对关键动作尝试发送微信小程序订阅消息。
- 订阅消息发送失败不回滚主业务流程，只记录失败原因。
- 短信作为后续增强，不作为 MVP 必需能力。

通知表字段建议：

| 字段 | 说明 |
| :--- | :--- |
| `id` | 通知 ID |
| `receiver_type` | `employee` / `customer` |
| `receiver_id` | 接收人 ID |
| `scene` | `project_acceptance` |
| `biz_id` | 验收单 ID |
| `title` | 通知标题 |
| `content` | 通知内容 |
| `status` | `unread` / `read` |
| `channel_status` | 订阅消息发送状态 |
| `channel_error` | 发送失败原因 |
| `created_at` | 创建时间 |

## 十二、图片存储生命周期

验收照片属于质量依据和售后责任证据，不应按临时素材处理。

MVP 规则：

- `scene=project_acceptance` 上传的图片长期保留。
- 至少保留到项目质保期结束。
- 项目归档不删除验收图片。
- 验收单 `customer_confirmed` 后，普通用户不能删除已提交图片。
- 如需删除，必须走管理员作废或追加说明流程，并保留操作记录。

建议后续在项目上补充质保结束时间，例如 `warranty_ends_at`，用于未来做归档和存储成本治理。

## 十三、图片上传事务一致性

当前推荐链路是前端先调用 `POST /uploads/images` 获取图片路径，再提交验收单。这个链路简单，但会产生一个问题：如果图片上传成功，验收单保存失败，就会留下未关联业务数据的孤儿图片。

MVP 处理建议：

- 第一版允许存在短时间孤儿图片，不阻塞验收流程落地。
- 上传时必须传 `scene=project_acceptance` 和 `project_id`。
- 后端上传成功后建议写入统一 `uploads` 记录表，记录上传人、场景、对象路径和关联状态。
- 验收单保存成功后，把对应图片标记为已关联。
- 定时任务清理超过保留窗口仍未关联的图片。

建议新增 `uploads` 表：

```sql
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  scene text not null,
  bucket text not null,
  object_path text not null,
  public_url text null,
  project_id uuid null references public.projects(id) on delete set null,
  uploader_type text not null,
  uploader_id uuid null,
  linked_type text null,
  linked_id uuid null,
  status text not null default 'uploaded',
  created_at timestamptz not null default now(),
  linked_at timestamptz null,
  cleaned_at timestamptz null
);
```

状态建议：

| 状态 | 说明 |
| :--- | :--- |
| `uploaded` | 已上传，暂未绑定业务 |
| `linked` | 已绑定验收项或其它业务 |
| `orphaned` | 超过窗口未绑定，等待清理 |
| `cleaned` | 已清理 |

清理规则建议：

- `scene=project_acceptance`
- `status=uploaded`
- `created_at < now() - interval '24 hours'`
- 未被任何验收项引用

注意：已经绑定到验收单的图片不能自动清理。

### 关联模型边界

`uploads.linked_type + linked_id` 是 MVP 的折中设计，适合先解决“上传成功但业务提交失败”的孤儿图片问题。但它不应该无限扩展成承载所有业务图片关系的神表。

MVP 约定：

- `uploads` 只记录上传对象本身、上传人、上传场景、当前关联状态。
- 业务读取验收图片时，仍以 `project_acceptance_items.images` 和 `rectification_images` 为准。
- `uploads.linked_type` 只用于清理、审计和排查，不作为业务详情页的主要查询来源。

后续如果日志、工单、售后、合同等模块都需要精细管理图片，建议二选一：

1. 改成更通用的 `resource_type + resource_id` 资源关联模型，并明确每个资源类型的生命周期。
2. 为关键业务建立独立关联表，例如 `acceptance_item_images`、`work_order_images`，避免所有业务关系挤进 `uploads`。

第一版建议保持当前轻量设计，等至少两个以上模块都需要图片生命周期治理时再抽象通用资源模型。

## 十四、验收流程模式

MVP 固定采用“领导复核后，业主确认”的流程：

```text
监理提交 -> 领导复核 -> 业主确认 -> 完成
```

这个模式更适合作为默认规则，因为内部先把质量问题拦住，再交给业主确认，能减少客户侧争议。

后续如果不同公司或不同项目有不同管理习惯，可以增加配置项：

```text
project_acceptance_flow_mode =
  leader_then_customer
  customer_then_leader
```

两种模式含义：

| 模式 | 流程 | 适用场景 |
| :--- | :--- | :--- |
| `leader_then_customer` | 监理提交 -> 领导复核 -> 业主确认 | 默认模式，质量内控优先 |
| `customer_then_leader` | 监理提交 -> 业主确认 -> 领导归档 | 业主高度参与、公司只做最终归档 |

第一版不建议开放配置。原因是状态机、通知、待办、权限都会增加分支，MVP 先跑通默认模式更稳。

如果后续开启配置，需要同步调整：

- 验收单状态枚举。
- 待办对象计算。
- 通知触发对象。
- 业主端按钮展示。
- 领导端操作文案，从“复核”变成“归档确认”。

### 状态机实现建议

验收流程模式一旦可配置，不能在 controller 或 service 里散落大量 `if...else`。建议提前把状态流转抽象到独立状态机服务。

推荐服务：

```text
ProjectAcceptanceWorkflowService
```

职责：

- 根据 `flow_mode` 返回当前状态允许的动作。
- 根据动作计算下一状态。
- 计算当前待办人。
- 计算通知对象。
- 校验操作者是否允许执行当前动作。
- 输出前端可展示的按钮和文案。

核心方法示例：

```ts
getAvailableActions(acceptance, actor)
transition(acceptance, action, actor, input)
getNextAssignees(acceptance)
getNotificationTargets(acceptance, action)
```

MVP 可以先只实现 `leader_then_customer`，但也建议把状态流转集中在一个 service 内，避免后续扩展 `customer_then_leader` 时大范围重构。

配置层级建议：

- 第一优先级：项目级配置。
- 第二优先级：公司或租户级配置。
- 默认值：`leader_then_customer`。

第一版没有租户模型时，可以先使用系统配置表保存默认值，但暂不开放 UI。

## 十五、待决策点与风险控制

### 1. 图片关联模型

决策建议：

- MVP 使用 `uploads.linked_type + linked_id`。
- 不把 `uploads` 作为业务图片主表。
- 后续多模块复用后，再评估 `resource_type + resource_id` 或独立业务图片表。

风险控制：

- 所有验收图片仍落在验收明细快照里。
- `uploads` 只承担上传审计和孤儿清理。

### 2. 整改复验强约束

决策建议：

- 整改后不要求全项重验。
- 所有上一次为 `fail` 的项必须重新验证为 `pass`，或在允许不适用的情况下提交 `not_applicable` 并填写说明。
- 失败项必须补充整改说明。
- 要求图片的失败项必须补充整改后照片。

风险控制：

- 后端提交时强校验。
- 领导复核页高亮展示整改项。
- 操作记录保留每次驳回和重新提交行为。

### 3. 流程模式扩展

决策建议：

- MVP 固定 `leader_then_customer`。
- 后续可支持项目级或租户级 `flow_mode`。
- 实现时提前集中状态流转，不把流程判断散落到多个模块。

风险控制：

- 新增 `ProjectAcceptanceWorkflowService`。
- 待办、通知、权限、按钮展示都从状态机服务派生。
- 默认模式保持不变，避免影响现有项目。

## 十六、后端实现顺序

### 第一阶段：MVP

目标：完成标准模板、验收单、逐项确认、领导复核、业主确认。

后端任务：

1. 新增 domain 枚举：
   - `ProjectAcceptanceStatus`
   - `ProjectAcceptanceAction`
   - `ProjectAcceptanceItemResult`
2. 新增 Supabase migration：
   - `project_acceptance_templates`
   - `project_acceptance_template_items`
   - `project_acceptances`
   - `project_acceptance_items`
   - `project_acceptance_actions`
3. Seed 内置验收模板和标准项。
4. 新增 schema：
   - `project-acceptance-templates.ts`
   - `project-acceptances.ts`
5. 新增 service：
   - 模板查询
   - 发起验收
   - 保存草稿
   - 提交验收
   - 领导通过
   - 驳回
   - 业主确认
6. 新增 controller 和 routes。
7. 接入权限校验。
8. 接入图片上传 `scene=project_acceptance`。
9. 接入通知表和小程序订阅消息发送记录。
10. 增加同工序进行中验收单防重复校验。
11. 增加整改复验校验。
12. 增加 `not_applicable` 必填说明和领导复核高亮展示字段。
13. 增加 `ProjectAcceptanceWorkflowService`，先只实现默认流程。

### 第二阶段：admin 端

目标：让后台能管理和使用验收流程。

admin 任务：

1. 项目详情增加“工序验收”tab。
2. 项目验收列表支持状态筛选。
3. 增加发起验收弹窗。
4. 增加验收填写页或抽屉。
5. 增加领导复核操作。
6. 增加验收模板管理页。
7. 待办中心接入待复核验收。

### 第三阶段：小程序端

目标：让监理和业主能在移动端完成核心动作。

小程序任务：

1. 员工端项目详情增加“发起验收”。
2. 员工端验收填写支持逐项上传照片。
3. 员工端待办支持领导复核。
4. 客户端项目详情展示验收节点。
5. 客户端验收详情支持确认通过和提出疑问。
6. 图片预览支持左右滑动。

### 第四阶段：增强

可后置能力：

- 验收通过后自动更新项目阶段。
- 验收模板版本管理。
- 图片上传 `uploads` 关联表和孤儿图片清理任务。
- 可配置验收流程模式。
- 验收报告 PDF 导出。
- 业主电子签名。
- AI 检查照片是否缺失关键角度。
- 按项目、监理、工序统计验收通过率和整改率。

## 十七、关键校验规则

后端必须强校验，不能只依赖前端。

提交验收时：

- 当前状态必须是 `draft` 或 `rejected`。
- 当前员工必须是项目监理或有提交权限。
- 必检项必须全部填写。
- 不允许对 `allow_not_applicable = false` 的项目提交 `not_applicable`。
- 提交 `not_applicable` 必须填写说明。
- 必传照片必须满足数量。
- 图片数组不能超过上限。
- 至少有一个验收项。
- 同一项目同一工序不能存在其他进行中的验收单。
- 如果当前验收单从 `rejected` 再次提交，上一次为 `fail` 的项必须重新验证为 `pass`，或在允许的情况下填写 `not_applicable` 和说明。
- 上一次为 `fail` 的项必须补充整改说明。
- 上一次为 `fail` 且要求图片的项必须补充整改后照片。

领导通过时：

- 当前状态必须是 `submitted`。
- 当前员工必须是 `reviewer_id` 或具备复核权限。
- 领导复核页必须高亮展示 `not_applicable` 项和整改项。
- 通过后写入 `reviewed_at`。

领导驳回时：

- 当前状态必须是 `submitted`。
- 必须填写驳回原因。
- 状态变为 `rejected`。
- 写入 `reject_source = leader`。
- 操作记录写入 `action = leader_reject`。

业主确认时：

- 当前状态必须是 `leader_approved`。
- 当前 customer 必须归属该项目。
- 确认后写入 `customer_confirmed_at` 和 `completed_at`。

业主提出疑问时：

- 当前状态必须是 `leader_approved`。
- 当前 customer 必须归属该项目。
- 必须填写疑问说明。
- 状态变为 `rejected`。
- 写入 `reject_source = customer`。
- 操作记录写入 `action = customer_dispute`。

作废时：

- 只有管理员或具备项目验收管理权限的人可以作废。
- 已经 `customer_confirmed` 的验收单原则上不允许作废，只能追加说明。

## 十八、MVP 验收标准

### case 1：监理发起水电验收

前提：

- 项目状态为施工中。
- 当前员工是项目监理。
- 水电验收模板已启用。

预期：

- 可以发起水电验收。
- 系统自动生成标准项。
- 必检项、必传图片校验生效。
- 提交后状态为 `submitted`。

### case 2：非项目监理发起验收

前提：

- 当前员工不是项目监理，也没有 `project_acceptance.create` 权限。

预期：

- 后端拒绝。
- 返回 403。
- 前端不显示发起入口或点击后提示无权限。

### case 3：领导复核通过

前提：

- 验收单状态为 `submitted`。
- 当前员工是复核人。

预期：

- 可以查看标准项和照片。
- 点击通过后状态为 `leader_approved`。
- 生成操作记录。
- 业主端可以看到待确认。

### case 4：领导驳回

前提：

- 验收单状态为 `submitted`。

预期：

- 驳回必须填写原因。
- 状态变为 `rejected`。
- 监理可以重新编辑并再次提交。
- 操作记录完整。

### case 5：业主确认

前提：

- 验收单状态为 `leader_approved`。
- 当前客户归属该项目。

预期：

- 业主可以查看验收详情和照片。
- 点击确认后状态为 `customer_confirmed`。
- 写入确认时间和完成时间。

### case 6：业主提出疑问

前提：

- 验收单状态为 `leader_approved`。
- 当前客户归属该项目。

预期：

- 业主可以填写疑问说明。
- 提交后状态变为 `rejected`。
- `reject_source = customer`。
- 监理端展示为“业主有疑问”。
- 操作记录包含 `customer_dispute`。

### case 7：同工序重复发起

前提：

- 项目 A 的水电工序已有 `submitted` 状态验收单。

预期：

- 再次发起水电验收失败。
- 返回“该工序已有进行中的验收单，请处理完成后再发起”。
- 已完成或已作废的历史验收不影响重新发起。

### case 8：整改后再次提交

前提：

- 验收单曾被驳回。
- 上一次提交中有 2 个验收项为 `fail`。

预期：

- 监理再次提交前，这 2 个失败项必须重新验证。
- 失败项必须填写整改说明。
- 如果失败项要求上传图片，必须补充整改后照片。
- 未失败项可以保留原结果。
- 再次提交后，领导复核页高亮展示整改项。

### case 9：不适用项

前提：

- 某验收项 `allow_not_applicable = false`。

预期：

- 监理不能选择 `not_applicable`。
- 如果某验收项允许 `not_applicable`，选择时必须填写说明。
- 领导复核页高亮展示不适用项和说明。

## 十九、推荐结论

建议按“独立验收模块”落地，不要把它做成施工日志的扩展字段。

原因：

- 验收有标准模板、逐项结果、多方确认、驳回整改、操作审计，业务复杂度明显高于日志。
- 独立模块后，后续可以自然扩展统计、报告、签名、质量追溯。
- 和当前项目成员、施工日志、图片上传、任务待办能力可以复用，不需要推翻已有架构。

推荐 MVP 范围：

1. 先做 8 个内置工序模板。
2. 监理发起并逐项上传照片。
3. 领导通过或驳回。
4. 业主确认或提出疑问。
5. 项目详情展示验收进度和历史记录。

这版能先把“标准化验收”和“责任闭环”跑通，后续再加模板后台、PDF 报告、电子签名和质量统计。
