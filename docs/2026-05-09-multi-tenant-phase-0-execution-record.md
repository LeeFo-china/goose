# 多租户改造阶段 0 执行记录

日期：2026-05-09

## 当前分支

```text
feature/multi-tenant
```

阶段 0 已从 `main` 新建改造分支。后续租户化改造应在该分支推进，`main` 继续保持当前单公司生产线。

## 已完成

- [x] 创建 `feature/multi-tenant` 分支。
- [x] 输出总方案文档。
- [x] 输出阶段 0-6 todo 文档。
- [x] 输出业务表租户化清单。
- [x] 输出直接 Supabase 查询风险扫描清单。
- [x] 当前扫描命中核心表直接查询 109 处，已记录为阶段 2 风险输入。
- [x] 输出异步任务租户上下文清单。
- [x] 输出双租户测试策略。
- [x] 输出性能基线测试计划。
- [x] 新增租户查询风险扫描脚本。
- [x] 输出 admin 阶段 0 对接文档。
- [x] 输出微信小程序阶段 0 对接文档。

## 待外部确认

- [ ] 产品确认“老客户新线索”的展示位置和筛选方式。
- [ ] 产品确认平台访客态小程序页面交互。
- [ ] 产品确认客户命中多家公司时公司选择页字段。
- [ ] 产品确认平台线索手动分配是否需要短信通知。
- [ ] 运维/研发确认性能压测环境和测试数据规模。

## 未在阶段 0 执行的事项

- 不新增 `tenant_id`。
- 不修改生产业务逻辑。
- 不调整现有登录行为。
- 不做平台超管 UI。
- 不运行生产量级压测。阶段 0 已定义压测标准，实际压测需在确认环境后执行。

## 交付物

| 类型 | 文件 |
| --- | --- |
| 总方案 | `docs/2026-05-09-multi-tenant-transformation-plan.md` |
| 阶段 0 todo | `docs/2026-05-09-multi-tenant-phase-0-planning-guardrails-todolist.md` |
| 表清单 | `docs/2026-05-09-multi-tenant-phase-0-table-inventory.md` |
| 查询风险 | `docs/2026-05-09-multi-tenant-phase-0-query-risk-scan.md` |
| 异步链路 | `docs/2026-05-09-multi-tenant-phase-0-async-context-inventory.md` |
| 性能基线计划 | `docs/2026-05-09-multi-tenant-phase-0-performance-baseline-plan.md` |
| 双租户测试策略 | `docs/2026-05-09-multi-tenant-phase-0-two-tenant-test-strategy.md` |
| Admin 对接 | `docs/application_integration_documentation/2026-05-09-phase-0-admin-integration.md` |
| 小程序对接 | `docs/application_integration_documentation/2026-05-09-phase-0-wechat-miniprogram-integration.md` |
| 扫描脚本 | `scripts/audit-tenant-scope.sh` |

## 下一步

阶段 1 可以开始前，需要确认：

1. `DEFAULT_TENANT_SLUG` 命名。
2. 默认租户显示名称。
3. 是否立即生成 Supabase 类型。
4. 阶段 1 migration 是否只覆盖 `employees / customers / projects / properties`。
