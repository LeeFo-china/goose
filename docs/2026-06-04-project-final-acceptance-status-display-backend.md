# 项目竣工验收已完成展示状态后端对接记录

日期：2026-06-04

## 背景

小程序端在 `docs/2026-06-04-project-final-acceptance-status-display-backend.md`
说明：普通项目列表如果也要准确显示“已完成”，后端需要返回阶段摘要或稳定展示状态字段。

## 后端实现

普通项目列表和 `/projects/status` 非 `home` 模式新增派生展示字段：

```ts
status_label: string | null;
display_status: string | null;
display_status_label: string | null;
```

规则：

- 不修改项目主状态 `status`。
- `status=acceptance` 且竣工验收阶段 `completion` 的验收单状态为
  `customer_confirmed` 时：
  - `display_status=final_acceptance_completed`
  - `display_status_label=已完成`
- 其他状态回落到项目主状态文案，例如 `acceptance -> 竣工验收`。

`mode=home` 仍保留 `current_construction_stage` 阶段摘要，同时也补充上述展示字段，
便于前端在不同列表入口复用同一展示逻辑。

## 验收标准

1. 竣工验收未完成时，`display_status_label=竣工验收`。
2. 竣工验收已完成时，`display_status_label=已完成`。
3. 不影响工程中项目的 `current_construction_stage.stage_label`，例如 `瓦工`。
4. API 文件大小检查保持 `exemptions=0`。

## 本地验收结果

已执行：

```bash
bun run --cwd apps/api check
```

结果：

- TypeScript noEmit 通过。
- API build 通过。
- API file size check 通过，`exemptions=0`。

接口验收：

- `GET /projects/status?page=1&pageSize=10`
  - HTTP 200。
  - 返回普通项目列表，所有返回行均包含
    `status_label/display_status/display_status_label`。
- `GET /projects/status?page=1&pageSize=10&status=acceptance`
  - HTTP 200。
  - 竣工验收已完成项目返回
    `display_status=final_acceptance_completed`、
    `display_status_label=已完成`。
  - 项目主状态仍保持 `status=acceptance`、
    `status_label=竣工验收`。
- `GET /projects/status?mode=home&page=1&pageSize=10&status=acceptance`
  - HTTP 200。
  - 竣工验收已完成项目返回
    `current_construction_stage.stage_code=completion`、
    `current_construction_stage.status=accepted`、
    `current_construction_stage.acceptance_status=customer_confirmed`。
