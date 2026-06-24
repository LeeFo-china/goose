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
