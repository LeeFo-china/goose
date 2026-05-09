# 阶段 3H-1 微信小程序对接说明：任务中心与用量统计

日期：2026-05-09

## 1. 是否需要小程序改动

需要小程序端关注一处兼容点：

```text
GET /task-center/todos
```

会新增 `type = project_acceptance` 的待办。

## 2. 新增待办类型

```json
{
  "type": "project_acceptance",
  "title": "工序验收待复核",
  "subtitle": "项目名称 · 水电验收",
  "action_label": "去复核",
  "target_type": "project_acceptance",
  "target_url": "/packageProjects/pages/acceptanceDetail/index?id=xxx&projectId=xxx&mode=view"
}
```

小程序端建议：

- 如果当前待办中心支持按 `target_url` 跳转，直接复用即可。
- 如果是按 `type` 做白名单跳转，需要新增 `project_acceptance`。
- 图标建议使用验收/清单类图标。

## 3. 统计接口

本阶段新增的费用统计和短视频/AI 用量统计是 admin 后台能力，小程序端不需要对接。

## 4. 兼容要求

小程序端不要把未知 `type` 直接丢弃。建议保底展示为普通待办，并按 `target_url` 跳转。
