# Admin 施工阶段子状态机对接

日期：2026-05-24

## 对接目标

Admin 项目详情里的施工日志和工序验收不能再把 `stage_code` 当作任意分类选择。阶段选择必须服从施工阶段子状态机：前置阶段未验收通过，不允许进入下一阶段；必需施工阶段未全部完成，不允许项目进入竣工验收。

## 阶段顺序

必需施工阶段：

```text
拆改 demolition
  -> 水电 plumbing_electrical
  -> 瓦工 tiling
  -> 木工 woodwork
  -> 油工 painting
  -> 安装 installation
```

辅助阶段：

- `measure` 量房复核：不参与施工阶段顺序门禁。
- `completion` 竣工验收：项目主状态进入 `acceptance` 后才允许发起。

## 当前第一阶段后端规则

第一阶段先落后端硬门禁。Admin 即使暂未改 UI，也不能绕过规则。

- `POST /project-logs`：创建施工日志时校验前置阶段是否已完成。
- `POST /project-acceptances`：发起工序验收时校验前置阶段是否已完成。
- `POST /projects/:id/status-transition` 执行 `start_acceptance`：校验必需施工阶段是否全部完成。

完成口径：

```text
project_acceptances.status = customer_confirmed
```

## Admin UI 对接要求

当前第一版已完成工序验收创建入口的阶段禁用。后续继续补项目详情施工阶段进度区。

阶段 3 完整对接要求：

1. 项目详情增加施工阶段进度区，展示每个阶段的状态。
2. 新增施工日志时，阶段选择只展示后端允许进入的阶段。
3. 发起工序验收时，默认选中当前可验收阶段。
4. 被阻塞阶段展示阻塞原因，例如“拆改验收未通过，不能进入水电”。
5. 项目状态按钮 `start_acceptance` 如果被后端拒绝，直接展示后端错误。
6. 状态变更、验收提交、客户确认后刷新项目详情、验收列表、施工阶段进度和项目状态动作。

## 错误处理

后端会返回中文错误。Admin 不需要自行翻译。

典型错误：

- `请先完成拆改验收后再进入水电`
- `项目进入竣工验收前，必须先完成拆改、水电、瓦工、木工、油工、安装验收`
- `项目进入竣工验收后才能发起竣工验收`

## 施工阶段状态接口

已新增施工阶段状态查询接口，Admin 应以该接口作为 UI 的唯一阶段状态来源，不再根据验收列表自行推导。

接口：

```http
GET /projects/:id/construction-stages
```

返回示例：

```json
{
  "project_status": "constructing",
  "required_completed": false,
  "current_stage": "plumbing_electrical",
  "missing_required_stages": [
    {
      "stage_code": "plumbing_electrical",
      "stage_label": "水电"
    }
  ],
  "stages": [
    {
      "stage_code": "demolition",
      "stage_label": "拆改",
      "status": "accepted",
      "acceptance_id": "uuid",
      "acceptance_status": "customer_confirmed",
      "blocked_reason": null
    },
    {
      "stage_code": "plumbing_electrical",
      "stage_label": "水电",
      "status": "in_progress",
      "acceptance_id": null,
      "acceptance_status": null,
      "blocked_reason": null
    }
  ]
}
```
