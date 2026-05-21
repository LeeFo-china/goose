# 小程序员工首页首屏阻塞链路核对回复

更新时间：2026-05-21

## 结论

小程序端当前首屏进入已经不把 `/customers`、`/projects/status` 放在阻塞链路里。

员工首页入口现在只先等待全局 `ensureSessionReady()` 和 `/employee/bootstrap`。bootstrap 返回后，页面会先用 bootstrap 内的员工权限上下文、首页统计和任务摘要渲染首页框架；客户列表和项目列表通过延迟任务触发，不参与 `loadDashboard()` 的主 await 链路。

因此当前复测目标可以按这个口径判断：首屏阻塞只看 `/employee/bootstrap`；`/customers`、`/projects/status` 的冷请求允许慢，但不应阻塞进入首页。

## 小程序端当前实现

相关实现位于 orange 小程序仓库：

- `src/services/auth.ts`
  - `employeeBootstrapPromise` 是进程级全局变量。
  - bootstrap 成功后保留 `employeeBootstrapResult`，同 token 下普通页面入口会直接复用结果。
  - 只有显式 `forceEmployeeBootstrap` 才会清缓存重新请求。
- `src/services/employee_bootstrap.ts`
  - `getBootstrap({ force })` 支持强刷。
  - `force: true` 会清本地 request cache。
- `src/pages/index/index.tsx`
  - 普通 `onShow` 调用 `loadDashboard('employee-home:onShow')`，不传 force。
  - 下拉刷新才调用 `loadDashboard('employee-home:pullDownRefresh', { forceEmployeeBootstrap: true })`。
  - `/customers` 和 `/projects/status` 由 `scheduleDashboardSectionLoads()` 延迟触发。
  - 延迟任务执行前会再次校验 `authStatus === 'employee_ready'` 和 token 未变化。

当前小程序端提交：

```text
b0fa951 fix: dedupe employee bootstrap flow
```

## 对 4 个问题的回复

### 1. `/customers`、`/projects/status` 是否在首屏阻塞链路

不在。

`loadDashboard()` 的主流程是：

1. `ensureSessionReady()` 确认员工登录态。
2. `loadEmployeeBootstrap()` 获取或复用 `/employee/bootstrap`。
3. 使用 bootstrap 的 `context`、`home_stats`、`task_summary` 更新首页框架。
4. 调用 `scheduleDashboardSectionLoads()` 延迟加载扩展数据。

其中客户列表和项目状态列表是第 4 步的延迟任务，不会阻塞第 3 步的首页框架渲染。

### 2. API 侧 `/customers` 员工首页列表优化建议

如果复测里 `/customers` 冷请求仍在 `1s+`，建议 API 侧继续看员工首页场景是否可以走轻量模式：

- 减少首页列表字段，只保留卡片首屏展示必需字段。
- 避免首页列表同步返回重关联、完整属性摘要、来源摘要或非首屏统计。
- 检查是否仍在同步做 `count`；首页首屏可考虑 `hasMore` 或轻量分页，避免总数阻塞。
- 缓存 key 建议按 token 上下文里的 `tenant_id / employee_id / permission scope / page / pageSize / filter / keyword` 收敛，避免无关参数造成缓存分裂。
- 对首页默认查询可考虑专门的 `mode=home` 或 `include=home_summary` 轻量分支。

### 3. API 侧 `/projects/status` 优化建议

如果 `/projects/status` 冷请求仍在 `1s+`，建议检查是否存在以下阻塞：

- 同时做 `count + rows`。
- 状态聚合、成员/客户信息、项目摘要一次性查太多。
- 权限 scope 过滤后又做复杂二次组装。
- 首页只展示项目卡片时仍返回详情页级字段。

建议为员工首页项目列表增加轻量模式，例如：

```text
GET /projects/status?mode=home&page=1&pageSize=20
```

`mode=home` 只返回首页卡片必需字段，并尽量复用 `/employee/bootstrap` 预热产生的 auth context、项目列表 in-flight 或短缓存。

### 4. 复测目标

小程序端验收口径：

- 首页首屏只依赖 `/employee/bootstrap`。
- 普通 `onShow` 不应重新发 `/employee/bootstrap`，应命中小程序全局 `employeeBootstrapResult`。
- 只有下拉刷新或明确刷新动作才允许 `force: true`。
- `/customers`、`/projects/status` 可以冷请求慢，但不能阻塞首页进入。
- 缓存命中目标维持 `1ms - 2ms`。

API 侧复测重点：

- 第二条重复 bootstrap 应出现 `bootstrap cache hit`、`bootstrap token cache hit` 或 in-flight reused 日志。
- 如果 `/customers`、`/projects/status` 仍慢，下一步优先优化它们的首页轻量查询和缓存 key，而不是继续看 `/auth`。
