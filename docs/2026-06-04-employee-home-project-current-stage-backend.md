# 员工首页项目当前阶段后端对接记录

日期：2026-06-04

## 背景

小程序端在 `docs/2026-06-01-employee-home-project-current-stage-backend-spec.md`
补充了员工首页项目列表的阶段展示契约：

- `/projects/status?mode=home` 需要返回当前施工阶段。
- `constructing`、`acceptance` 项目需要返回 `stage_label`，用于展示如“瓦工阶段”。

## 后端实现

`/projects/status?mode=home` 在列表 service 层批量挂载当前阶段字段，避免首页列表出现逐项目阶段详情请求。

工程中/验收中项目返回：

```ts
current_construction_stage: {
  stage_code: string;
  stage_label: string;
  status: string;
  status_label: string;
  acceptance_status: string | null;
  acceptance_status_label: string | null;
} | null;
current_stage: string | null;
current_stage_label: string | null;
stage_code: string | null;
stage_label: string | null;
```

阶段计算复用项目施工阶段顺序：

1. `demolition`
2. `plumbing_electrical`
3. `tiling`
4. `woodwork`
5. `painting`
6. `installation`
7. `completion`

施工阶段按第一个未完成且未锁定的阶段作为当前阶段；施工阶段全部完成后返回竣工验收阶段。

## 验收

已执行：

```bash
bun run --cwd apps/api check
```

结果：

- TypeScript noEmit 通过。
- API build 通过。
- API file size check 通过，`exemptions=0`。

本地黑盒请求：

- `GET /projects/status?mode=home&page=1&pageSize=10&status=constructing`
  - HTTP 200。
  - 返回 2 条工程中项目。
  - 2 条均返回 `current_construction_stage`、`stage_code`、`stage_label`。
  - 样例包含 `stage_label: "瓦工"`。
- `GET /projects/status?mode=home&page=1&pageSize=10`
  - HTTP 200。
  - 返回 5 条项目。
  - 其中 2 条工程中项目均返回阶段字段。
- `GET /projects/status?mode=home&page=1&pageSize=10&status=acceptance`
  - HTTP 200。
  - 当前测试库无验收中项目，返回 0 条。
