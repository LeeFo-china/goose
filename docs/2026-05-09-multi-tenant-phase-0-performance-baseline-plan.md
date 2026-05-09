# 多租户阶段 0 性能基线计划

日期：2026-05-09

## 目标

在阶段 2 改造核心业务隔离前，锁定单租户版本的核心接口性能基线。阶段 2 完成后，用同一套脚本和数据规模复测，确保新增 `tenant_id` 过滤没有带来不可接受的性能退化。

## 基线版本

建议使用阶段 2 开始前 `main` 分支的稳定提交。

记录格式：

```text
branch: main
commit: 9a4dd7ce394ed458f67e7dd8baafbad33b4e2a70
environment: staging / perf
date: 待填写
```

## 测试接口

必须覆盖：

- `GET /customers`
- `GET /projects`
- `GET /employees`
- 客户详情接口
- 项目详情接口

可选覆盖：

- `GET /expense-requests`
- `GET /project-acceptances`
- `GET /marketing-leads`

## 数据规模

建议阶段 2 对比测试目标：

```text
10 个租户
每租户 10 万条客户/项目级数据
```

如果阶段 0 暂无法构造该规模，必须记录当前实际数据规模，不得把小数据结果作为最终验收。

## 指标

必须记录：

- 平均响应时间。
- P95。
- P99。
- 错误率。
- 数据库慢查询日志。

主要验收口径：

```text
P95 / P99 增加不超过 10%
```

平均响应时间仅作参考。

## 压测工具建议

可选：

- `k6`
- `wrk`
- `autocannon`

MVP 建议优先 `k6`，便于保存脚本和结果。

## 阶段 2 复测要求

阶段 2 完成后：

- 使用相同环境。
- 使用相同数据规模。
- 使用相同压测脚本。
- 使用相同用户角色和 token。
- 对比阶段 0 的 P95/P99。

不达标处理：

- 补 `(tenant_id, created_at)`。
- 补 `(tenant_id, status)`。
- 补 `(tenant_id, owner_id)`。
- 补 `(tenant_id, customer_id)`。
- 使用 `EXPLAIN ANALYZE` 检查慢查询。

未达标不得进入阶段 3。

## 当前状态

阶段 0 已输出计划，尚未执行真实生产量级压测。

阻塞项：

- 需要确认压测环境。
- 需要确认测试数据生成方式。
- 需要确认压测账号和 token。
