# 员工侧首页加载性能后端对接记录

日期：2026-06-04

## 背景

小程序仓库 `docs/2026-06-04-employee-home-performance-backend.md`
反馈员工首页冷启动存在秒级长尾，重点要求：

- `/employee/bootstrap` 预热项目列表时，ownership 要和前端真实请求一致。
- 首页关键接口支持 `debug_timing=true`，便于前端复测后端分段耗时。
- `/projects/status?mode=home` 保留当前工序和派生展示状态字段。

## 后端实现

### 1. 修正项目列表预热 ownership

`prewarmDeferredHomeData` 不再固定 `ownership=self`：

- `project.read.scope=self`：预热 `ownership=self`
- 其他可读范围：预热 `ownership=all`

auth plugin 和微信登录后的后台 home data 预热也同步使用同样规则，避免生成与首页真实请求不一致的 cache key。

### 2. 首页关键接口 debug timing

以下接口支持 `debug_timing=true`：

- `GET /employee/bootstrap?debug_timing=true`
- `GET /projects/status?...&mode=home&debug_timing=true`
- `GET /home_stats?debug_timing=true`
- `GET /task-center/todos/summary?debug_timing=true`

项目列表 debug timing 包含：

- `auth_context_ms`
- `scope_ms`
- `rows_ms`
- `assignees_ms`
- `stages_ms`
- `display_status_ms`
- `total_ms`
- `cache`

bootstrap debug timing 只临时附加到响应，不写入 bootstrap 缓存。

### 3. 避免 home 阶段状态重复查询

`mode=home` 已由 `current_construction_stage` 计算出竣工验收完成展示状态时，
`attachProjectDisplayStatuses` 不再重复查询同一项目的竣工验收完成记录。

## 本地验收

已执行：

```bash
bun run --cwd apps/api check
```

结果：

- TypeScript noEmit 通过。
- API build 通过。
- API file size check 通过，`exemptions=0`。

接口实测：

- `GET /employee/bootstrap?debug_timing=true`
  - HTTP 200，返回 `debug_timing`。
- `GET /projects/status?page=1&pageSize=20&ownership=all&mode=home&debug_timing=true`
  - HTTP 200，返回 `debug_timing`。
  - 返回项目列表仍包含 `current_construction_stage`、`display_status`、`display_status_label`。
  - 连续请求可命中项目列表缓存。
- `GET /home_stats?debug_timing=true`
  - HTTP 200，返回 `debug_timing`。
- `GET /task-center/todos/summary?debug_timing=true`
  - HTTP 200，返回 `debug_timing`。
