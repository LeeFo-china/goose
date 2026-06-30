# Phase 7.6 财务对账运营统计

日期：2026-06-30

## 结论

Phase 7.6 在财务对账异常基础上增加只读运营统计，用于 Admin 财务主管查看异常积压、类型分布、处理状态和最近处理动作。

本阶段不改变财务源数据，不新增修账入口，不新增小程序契约。

## 范围

- API：`GET /finance/reconciliation/operating-stats`
- Admin：财务对账页运营统计区
- 数据来源：当前对账异常计算结果 + 最近处理动作
- 小程序：无必改

## 统计口径

统计只基于当前查询范围内仍然存在的对账异常：

- 应收逾期
- 收款未入账
- 流水缺收款关联
- 收款未核销
- 核销金额不一致
- 应收已收不一致

处理状态来自 `finance_reconciliation_exception_actions` 中同一 fingerprint 的最近动作：

- `open`：未处理
- `acknowledged`：已确认
- `ignored`：已忽略
- `resolved`：人工闭环

`resolved` 不代表源数据已自动修正。如果源数据仍然异常，它会继续出现在统计中，并显示最近处理状态为人工闭环。

## API 契约

```text
GET /finance/reconciliation/operating-stats
```

查询参数：

- `date_from`：开始日期，默认最近 30 天。
- `date_to`：结束日期，默认今天。
- `project_id`：项目 ID。
- `exception_code`：异常类型。
- `level`：异常等级。
- `direction`：对账方向。
- `status`：处理状态。
- `actor_employee_id`：最近处理人。

返回内容：

- `scope`：统计范围和超期阈值。
- `summary`：总数、等级、状态、金额、超期未处理和最近时间。
- `by_exception_code`：异常类型分布。
- `by_status`：处理状态分布。
- `by_level`：等级分布。
- `recent_actions`：当前异常范围内最近处理动作。

## Admin 行为

财务对账页新增运营统计区：

- 异常总数、未处理、超 7 天未处理、人工闭环 KPI。
- 状态分布卡片。
- 异常类型分布卡片。
- 最近处理动作卡片。

页面仍然保留原有筛选和异常列表。

## 小程序边界

小程序本阶段无必改。

小程序继续按现有 workflow v2、项目、收款、费用接口工作。对账运营统计只服务 Admin 财务管理，不作为小程序待办、项目状态或 workflow 推进依据。

如果后续要把财务异常提醒下发给小程序，需要单独定义员工可见范围、动作来源和只读提醒契约。

## 验收口径

实现完成后需要验证：

- API 单测覆盖统计、处理状态合并、超期未处理和权限。
- Admin 单测覆盖查询参数构造。
- Admin check 通过。
- API 临时端口只读 smoke 返回统计结构。
- 不存在 migration。
- 不修改 orange 仓库。
