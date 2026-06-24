# 阶段 5：经营分析与预算预警小程序对接说明

日期：2026-06-24

## 结论

本阶段小程序端暂无必改。

后端和 Admin 新增的是经营风险分析、风险筛选和处理入口，不改变 workflow v2，不改变收款 complete payload，不改变费用申请必填字段。

## 小程序继续保持

- 不计算预算。
- 不计算利润。
- 不计算风险等级。
- 不维护风险枚举。
- 不维护成本分类枚举。
- 不根据项目状态、workflow 节点名或本地规则推导财务风险。

## 后续可选展示契约

如产品后续要求员工侧展示项目经营风险，需要后端另行确认权限范围。小程序只读消费：

- `risk_level`
- `risk_reasons[]`
- `budget_usage_ratio`
- `unallocated_expense_amount`

默认不展示利润金额和毛利率。

## 只读 Smoke 建议

- 员工登录。
- 项目详情 workflow v2 仍正常。
- 费用申请入口仍正常。
- 收款 workflow task 仍正常。
- 不执行 workflow complete。

## 发布后只读 Smoke 回填

orange 已按本 handoff 完成发布后只读 smoke。

验证账号：`18800005001 / 小龙女`。

结果：

- 员工登录、`/admin/auth/me`、`/employee/bootstrap` 正常。
- 项目详情 `workflow_state` 正常，当前施工节点为 `tile_work / 瓦工`，存在 1 个可用 action。
- 施工待办可读，返回 `tile_work` task，action key 为 `start_procedure`。
- 费用待办和费用申请列表可读。
- 应收计划只读接口可读，样本项目应收计划为 `paid`。
- 未执行 `POST /workflow-tasks/:taskId/complete`。
- 未新增本地风险计算，也未请求预算/利润接口做业务判断。

结论：Phase 5 对小程序现有登录、项目 workflow、施工、费用、收款只读入口无破坏影响；
当前阶段 orange 无必改。
