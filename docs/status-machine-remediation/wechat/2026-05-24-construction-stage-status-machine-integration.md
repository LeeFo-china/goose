# 微信小程序施工阶段子状态机对接

日期：2026-05-24

## 对接目标

小程序项目详情、施工日志、工序验收必须遵守施工阶段子状态机。用户不能跳过前置工序验收进入下一阶段，也不能在必需施工阶段未全部完成时把项目推进到竣工验收。

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
- `completion` 竣工验收：项目进入 `acceptance` 后才允许发起。

## 当前第一阶段后端规则

第一阶段先落后端硬门禁。小程序即使暂未改 UI，也不能绕过规则。

- 创建施工日志时，后端校验 `stage_code` 的前置阶段。
- 发起工序验收时，后端校验 `stage_code` 的前置阶段。
- 项目执行 `start_acceptance` 进入竣工验收时，后端校验必需施工阶段是否全部完成。

完成口径：

```text
project_acceptances.status = customer_confirmed
```

## 小程序 UI 对接要求

当前第一版已完成工序验收创建入口的阶段禁用。后续由小程序团队继续补项目详情施工阶段进度区和新增施工日志阶段过滤。

阶段 4 完整对接要求：

1. 项目详情展示施工阶段进度。
2. 新增施工日志时，阶段选择只展示可进入阶段。
3. 发起工序验收时，默认使用当前可验收阶段。
4. 阻塞阶段展示原因，例如“拆改验收未通过，不能进入水电”。
5. 施工日志创建、验收单创建、验收提交、客户确认后刷新项目详情、验收列表、施工阶段进度和项目状态动作。
6. API 返回 400 / 403 时，直接展示后端中文错误。

## 需要继续使用的现有接口

```http
POST /project-logs
POST /project-acceptances
GET /project-acceptances?project_id=:projectId&page=1&pageSize=20
POST /projects/:id/status-transition
GET /projects/:id/status-actions
```

## 施工阶段状态接口

已新增施工阶段状态查询接口，小程序应以该接口作为阶段展示和按钮可用性的唯一来源。

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
  "next_stage": {
    "stage_code": "plumbing_electrical",
    "stage_label": "水电",
    "status": "in_progress",
    "can_create_log": true,
    "can_create_acceptance": true,
    "blocked_reason": null
  },
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
      "is_required": true,
      "is_completion": false,
      "can_create_log": false,
      "can_create_acceptance": false,
      "acceptance_id": "uuid",
      "acceptance_status": "customer_confirmed",
      "latest_log": {
        "id": "uuid",
        "node_name": "墙体拆改",
        "content": "现场拆改完成",
        "created_at": "2026-05-24T10:00:00.000Z"
      },
      "blocked_reason": null
    },
    {
      "stage_code": "plumbing_electrical",
      "stage_label": "水电",
      "status": "in_progress",
      "is_required": true,
      "is_completion": false,
      "can_create_log": true,
      "can_create_acceptance": true,
      "acceptance_id": null,
      "acceptance_status": null,
      "latest_log": null,
      "blocked_reason": null
    }
  ]
}
```
