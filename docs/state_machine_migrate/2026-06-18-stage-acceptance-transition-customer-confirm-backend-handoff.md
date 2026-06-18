# 阶段验收客户确认阻塞后端对接口径

日期：2026-06-18

本文记录 orange 小程序在 `stage_acceptance_transition` smoke 中发现的客户确认
阻塞，以及 gooes 后端确认后的对接口径。gooes 为可写仓库，orange 仓库仅作为只读
联调结果来源。

## 小程序回填样本

| 字段 | 值 |
| --- | --- |
| project ID | `54f11aa5-09a8-4410-a9c5-604a7fe9e09c` |
| acceptance ID | `2e3779f7-8b51-4b05-9b7b-e1f3e18f1992` |
| stage_code | `plumbing_electrical` |
| workflow current | `payment_stage_2` |
| acceptance status | `leader_approved` |
| orange handoff | `/Users/leefo/Public/work/orange/docs/state_machine_migrate/2026-06-18-stage-acceptance-transition-customer-confirm-blocker-handoff.md` |
| orange execution | `/Users/leefo/Public/work/orange/docs/state_machine_migrate/2026-06-18-decoration-workflow-miniprogram-e2e-execution.md` |

已通过：

1. 工序 complete 后刷新 `construction-stages`，拿到可用 `acceptance_action`。
2. 验收单 submit 成功，`draft -> submitted`。
3. 主管复核成功，`submitted -> leader_approved`。
4. 客户 open-ticket verify 成功，`valid = true`。

阻塞点：

```text
POST /project-acceptances/:id/customer-confirm
409 WORKFLOW_ACCEPTANCE_NOT_AVAILABLE
当前流程在中期进度款，不能操作水电
```

## 后端结论

这不是小程序本地推进问题。小程序没有直接修改 workflow，只调用后端接口。

根因是后端旧 guard 只允许 `current_stage_code === acceptance.stage_code`。
但当前施工模板允许在水电工序 complete 后先进入 `payment_stage_2` 收款门禁：

```text
procedure_plumbing_electrical -> payment_stage_2 -> procedure_tiling
```

在这个合法状态下，水电工序节点已经完成，workflow 当前节点变成中期收款；
水电验收仍处于 `leader_approved`，客户仍需要确认上一工序验收。旧 guard 没有覆盖
“当前收款门禁所阻塞阶段的上一工序”这个窗口。

## 修复后的契约

后端采用第一种契约：

> 允许工序 complete 后进入收款节点，同时仍允许客户确认上一工序验收。

具体规则：

1. 施工日志仍只允许在 workflow 当前工序节点创建。
2. 下一工序仍受当前收款门禁锁定，例如 `payment_stage_2` 锁定 `tiling`。
3. 当前节点是 `payment_collection` 时，如果它阻塞的下一工序是 `tiling`，则允许
   对上一工序 `plumbing_electrical` 创建阶段验收和执行客户确认。
4. 客户确认上一工序验收时，后端不会重复 complete 已完成的工序节点。
5. workflow 当前节点保持在收款门禁，后续仍由财务收款 workflow 推进。

## 后端改动点

| 模块 | 行为 |
| --- | --- |
| `project-workflow-mutation-guards` | 放开 `create_stage_acceptance` 与 `customer_confirm_acceptance` 对当前 payment gate 上一工序的操作 |
| `construction-stage-status` | payment gate 下对上一工序返回可用 `acceptance_action`，无已有验收单时可返回 `create` |
| `project-acceptance-workflow-runtime` | 当前已在 payment gate 时返回 `already_advanced`，不重复 complete 工序节点 |
| `project-acceptances customer-actions` | 接受 `advanced` 和 `already_advanced` 两种 runtime 同步结果 |

## 小程序复测路径

请 orange 继续用当前样本或后端准备的新样本复测：

1. 使用客户 open-ticket 调用客户确认接口。
2. 期望 `POST /project-acceptances/:id/customer-confirm` 返回 200。
3. 刷新验收详情，期望 `acceptance.status = customer_confirmed`。
4. 刷新 `GET /projects/:projectId/construction-stages`：
   - `plumbing_electrical.status = accepted`
   - `acceptance_status = customer_confirmed`
   - workflow 仍可停留在 `payment_stage_2`，这是预期。
5. 不要本地推进 workflow；`payment_stage_2 -> procedure_tiling` 仍必须由收款节点完成后推进。

## 回复小程序端

```text
后端确认这不是小程序本地推进问题。当前契约调整为：水电工序 complete 后允许
workflow 先进入 payment_stage_2，同时仍允许客户确认上一工序水电验收。

后端已修复 guard：payment_collection 当前节点下，可对其阻塞的下一工序的上一工序
执行 create_stage_acceptance / customer_confirm_acceptance；客户确认时不会重复 complete
已完成的工序节点，workflow 会继续停留在 payment_stage_2，等待财务收款推进。

请用 acceptance ID 2e3779f7-8b51-4b05-9b7b-e1f3e18f1992 重新执行
customer-confirm smoke。期望 customer-confirm 返回 200，验收单变为 customer_confirmed，
construction-stages 中 plumbing_electrical 变为 accepted；payment_stage_2 仍是当前节点
属于预期，后续由收款 workflow 推进到 tiling。
```
