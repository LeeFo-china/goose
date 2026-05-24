# 施工阶段子状态机整改计划

日期：2026-05-24

## 背景

项目主状态机已经覆盖交付大阶段：

`designing -> proposal_confirmed -> signed -> design_finalized -> pending_start -> started -> constructing -> acceptance`

施工日志里的 `stage_code / node_name` 目前只是日志分类，不能约束工序顺序。业务上需要把“施工节点/工序阶段”升级为项目主状态机下的子状态机：前一工序未验收通过，不允许进入下一工序；所有必需施工工序未完成，不允许项目主状态进入 `acceptance` 竣工验收。

## 设计结论

施工阶段子状态机独立于项目主状态机。

- 项目主状态机负责项目大阶段。
- 施工阶段子状态机负责施工工序顺序、工序验收和返工闭环。
- 工序验收沿用现有 `project_acceptances` 流程，`customer_confirmed` 作为工序完成口径。
- `completion` 表示项目进入竣工验收后的整体验收，不作为进入项目 `acceptance` 前的必需施工工序。

## 必需施工阶段顺序

```text
demolition -> plumbing_electrical -> tiling -> woodwork -> painting -> installation
```

辅助阶段：

- `measure`：量房复核，不参与施工阶段顺序门禁。
- `completion`：竣工验收，在项目主状态进入 `acceptance` 后发起。

## 子状态口径

阶段状态由工序验收单和日志共同推导：

- `locked`：前置阶段未验收通过，当前阶段不可进入。
- `not_started`：前置阶段已通过，但当前阶段暂无日志和验收。
- `in_progress`：当前阶段已有施工日志，尚未发起验收。
- `pending_acceptance`：当前阶段验收单已提交或待业主确认。
- `rework_required`：当前阶段验收被领导或业主驳回。
- `accepted`：当前阶段最新有效验收单为 `customer_confirmed`。

## 后端硬规则

1. 新增施工日志时，如果日志阶段属于必需施工阶段，必须满足前置阶段已 `accepted`。
2. 发起工序验收时，如果验收阶段属于必需施工阶段，必须满足前置阶段已 `accepted`。
3. 发起 `completion` 竣工验收时，项目主状态必须已经是 `acceptance`，并且必需施工阶段全部 `accepted`。
4. 项目主状态执行 `start_acceptance` 前，必需施工阶段必须全部 `accepted`。
5. 不满足规则时，API 返回中文 400 错误，前端只展示后端错误，不自行放行。

## 执行阶段

### 阶段 0：规则冻结和对接文档

状态：执行中。

交付物：

- 总方案文档。
- Admin 对接文档。
- 微信小程序对接文档。

### 阶段 1：领域层和后端门禁

状态：已完成第一批后端硬门禁。

交付物：

- `@gooes/domain` 增加施工阶段顺序、必需阶段和辅助判断。
- API 在创建施工日志、发起工序验收、项目进入竣工验收时执行门禁。
- 不新增前端入口也不能绕过后端规则。

已落地文件：

- `packages/domain/src/project-log.ts`
- `apps/api/src/services/construction-stage-status.ts`
- `apps/api/src/services/project-logs.ts`
- `apps/api/src/services/project-acceptances.ts`
- `apps/api/src/services/project-status.ts`
- `apps/api/src/repositories/project-acceptances.ts`

### 阶段 2：阶段状态查询接口

状态：已完成第一版。

交付物：

- 新增项目施工阶段状态查询接口。
- 返回每个阶段的状态、前置阻塞原因、关联验收单和最近日志。
- Admin 和微信小程序不再自行拼装阶段状态。

已落地接口：

```http
GET /projects/:id/construction-stages
```

当前返回包含：

- `project_status`
- `required_stage_codes`
- `required_completed`
- `current_stage`
- `missing_required_stages`
- `stages[]`
- `all_stage_codes`

### 阶段 3：Admin 对接

状态：已完成第一版。

交付物：

- 项目详情展示施工阶段进度。
- 只允许对 `not_started / in_progress / rework_required` 的当前可进入阶段创建日志或发起验收。
- 阻塞阶段展示原因和缺失前置阶段。

已落地：

- Admin 项目验收面板调用 `GET /projects/:id/construction-stages`。
- 发起工序验收时，阻塞工序禁用并显示后端 `blocked_reason`。
- 验收列表刷新时同步刷新施工阶段状态。

### 阶段 4：微信小程序对接

状态：已完成第一版。

交付物：

- 项目详情展示施工阶段进度。
- 新增施工日志和发起验收时，阶段选择按后端返回的可用阶段过滤。
- 后端 400 直接展示中文错误。

已落地：

- 小程序工序验收弹层调用 `GET /projects/:id/construction-stages`。
- 发起工序验收时，阻塞工序禁用并展示后端 `blocked_reason`。
- 创建验收失败仍直接展示后端中文错误。

### 阶段 5：数据回填和一致性检查

状态：待执行。

交付物：

- 检查已有项目中已跳过前置工序的验收单和日志。
- 输出修复 SQL 或人工处理清单。
- 补充一致性检查脚本。

## 验收标准

- 未完成拆改验收时，不能创建水电及之后阶段的施工日志。
- 未完成拆改验收时，不能发起水电及之后阶段的工序验收。
- 有任一必需施工阶段未 `customer_confirmed` 时，项目不能执行 `start_acceptance`。
- 项目进入 `acceptance` 后，才允许发起 `completion` 竣工验收。
- Admin 和微信小程序对接文档都说明阶段顺序、接口、错误处理和刷新策略。
