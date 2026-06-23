# 费用审批与支出付款下一阶段计划

日期：2026-06-23

## 结论

应收计划二阶段已经完成收入侧闭环，下一阶段建议转向费用审批与支出付款，补齐装修项目经营财务的支出侧闭环。

本阶段不是从零新建费用审批。当前项目已有费用申请、审批、付款、凭证上传、workflow runtime 和 Admin 费用页能力，下一阶段重点是把这些能力按装修财务系统口径重新验收、补齐台账联动和对接文档，确认它和 `workflow_state/actions`、财务台账、权限、Admin 页面保持一致。

## 当前事实

### 已有后端能力

- `expense_request` 已接入 workflow runtime。
- 费用待办已经从旧审批链切到 `/workflow-tasks`。
- Admin 费用审批、驳回、付款动作已经按 workflow task complete 执行。
- 费用旧 `current_step/current_step_role` 已清理，运行态不再依赖旧字段。
- 费用相关权限已存在：
  - `expense_request.read`
  - `expense_request.create`
  - `expense_request.submit`
  - `expense_request.approve_manager`
  - `expense_request.approve_finance`
  - `expense_request.pay`
  - `finance.expense.review`
  - `finance.expense.pay`
- 费用付款凭证已支持 COS direct upload，上传场景为 `expense_request`。

### 已有 Admin 能力

- `/expenses` 已有费用审批页。
- 费用列表和操作面板已读取 workflow state。
- 付款弹窗支持付款信息和凭证。
- 费用付款后可以展示打款记录和凭证。

### 仍需确认的关键闭环

- 费用从申请、提交、经理审批、财务复核、付款到完成的完整 smoke 是否稳定。
- 费用付款是否稳定写入支出方向的财务台账。
- 付款、台账、workflow task 是否幂等，重复提交不能产生重复支出流水。
- Admin 页面显示的费用状态、workflow 当前节点、付款记录、财务台账是否一致。
- 如果小程序后续承载费用申请或审批，是否需要新增小程序对接契约。

## 阶段目标

1. 费用审批继续以 workflow runtime 为唯一推进口径。
2. 所有可执行动作只来自 `workflow_state.actions`、`node.actions` 或 `/workflow-tasks.actions`。
3. 费用付款后生成支出流水，财务台账可查。
4. Admin 费用页、财务台账和 workflow 状态展示一致。
5. 输出可复用 smoke 脚本、验收记录和对接说明。

## 不做范围

本阶段先不做以下内容：

- 微信支付、企业付款到零钱、银行转账自动打款。
- 银行流水自动对账。
- 发票 OCR 和发票真伪校验。
- 多币种、税务申报、会计凭证导出。
- 复杂预算控制和成本分摊。
- 小程序费用申请全套 UI，除非确认员工端必须承载该业务。

这些能力可以作为费用二期或支付能力接入阶段处理。

## 任务拆分

### Task 0：基线核查

目标：确认当前费用审批已有能力和实际运行状态。

检查项：

- `expense_request` workflow 模板是否已发布且 active。
- `/expense-requests` 列表是否分页返回并带 `workflow_state`。
- `/workflow-tasks?status=pending&subject_type=expense_request` 是否返回费用待办。
- Admin `/expenses` 是否能正常打开。
- 财务权限角色是否绑定到测试账号。
- COS direct upload `scene=expense_request` 是否可用。

验收输出：

- 当前 active workflow definition/version。
- 测试申请人、经理、财务账号。
- 至少一个可用于完整 smoke 的费用申请样本，或者创建样本的受控步骤。

### Task 1：后端契约核查和补齐

目标：保证费用审批和付款都通过 workflow task 推进，不回退到旧业务状态机。

检查项：

- 费用提交后创建或进入 `expense_request` workflow instance。
- 经理审批、财务复核、付款待办均来自 `/workflow-tasks`。
- `POST /workflow-tasks/:taskId/complete` 能桥接费用业务动作：
  - `approve`
  - `reject`
  - `pay`
- 付款节点的 `output_fields` 明确要求：
  - 付款金额
  - 付款时间
  - 付款方式
  - 付款凭证
  - 备注
- 付款成功后：
  - 费用状态进入 `paid` 或等价完成态。
  - workflow 进入 `done/end`。
  - 写入 `expense_request_settlements` 或现有结算记录。
  - 写入 `finance_ledger_entries` 支出方向流水。

需要重点确认：

- 重复 complete 同一个付款 task 不产生重复 settlement 或 ledger。
- 付款金额不能超过待付款金额。
- 未授权财务人员不能看到或完成付款 task。
- 被驳回、取消、已付款费用不能再次付款。

### Task 2：Admin 对接和可见性

目标：Admin 能完成费用审批支出闭环，并能对财务人员解释当前状态。

Admin 页面口径：

- 费用列表显示：
  - 费用状态
  - workflow 当前节点
  - 申请人
  - 项目
  - 金额
  - 当前待办人或待办角色
- 费用详情显示：
  - workflow timeline
  - 当前可执行 action
  - 审批记录
  - 付款记录
  - 付款凭证
- 付款动作只来自后端返回的 action。
- 没有 action 时只读展示，不补本地按钮。
- 财务台账 `/finance/ledger` 能按费用支出流水查看对应记录。

建议补齐的 Admin smoke：

1. 申请人创建并提交费用申请。
2. 经理账号登录，只看到自己可审批的费用 task。
3. 经理审批通过。
4. 财务账号登录，只看到自己可复核或付款的费用 task。
5. 财务付款并上传凭证。
6. 回到费用详情，确认状态、workflow、付款记录一致。
7. 打开财务台账，确认支出流水金额、项目、来源对象一致。

### Task 3：受控 E2E smoke

目标：形成可重复的费用审批支出 smoke 记录。

建议样本：

- 费用类型：材料费或人工费。
- 关联项目：选一个测试项目，不复用已归档或已完成 smoke 的项目。
- 金额：固定小额，例如 `1000.00`。
- 付款方式：`bank_transfer` 或 `cash`，先不接真实支付。
- 凭证：使用 `expense_request` direct upload 的测试 object key。

需要回填的证据：

- expense request ID
- workflow instance ID
- manager review task ID
- finance review task ID
- payment task ID
- settlement ID
- ledger ID
- evidence object key
- complete 请求和响应摘要
- Admin 页面 URL 或截图口径

通过标准：

- 完整链路接口返回 2xx。
- pending task 随流程推进正确消失和生成。
- 费用状态最终为 `paid` 或完成态。
- workflow current node 最终为 `done/end`。
- 财务台账出现支出流水。
- 重复提交付款 task 不重复写入支出流水。

### Task 4：小程序影响评估

当前判断：如果小程序暂不提供员工报销、经理审批、财务打款入口，则本阶段小程序不需要立即改代码。

如果后续要求小程序承载费用审批或付款，则对接口径必须和项目收款一致：

- 入口只读 `/workflow-tasks?status=pending&subject_type=expense_request`。
- 详情只读 `workflow_state.timeline_nodes`、`node.display`、`node.attributes`、`node.actions`。
- 所有推进只调用 `POST /workflow-tasks/:taskId/complete`。
- 凭证上传使用 `scene=expense_request`。
- 小程序不直接调用费用旧审批接口推进状态。
- 小程序不本地推导审批节点、待办角色或是否能付款。

如确认需要小程序对接，需要再补一份独立 handoff 文档，包含字段契约、页面入口、complete payload、错误码和 smoke 清单。

### Task 5：文档和交付

需要输出：

- 费用审批支出 smoke 记录。
- Admin 对接说明。
- 如果小程序参与，补小程序 handoff。
- 权限矩阵更新。
- 支出流水和费用结算字段说明。
- 后续微信支付或企业付款接入预留说明。

## 风险和待确认问题

1. 当前费用模块文件路径仍有 `legacy` 命名，虽然运行态已迁移到 workflow，但后续实现时需要避免误以为旧审批链仍是 source of truth。
2. 费用支出流水是否已经完全接入 `/finance/ledger` 需要通过真实付款 smoke 确认。
3. 付款节点的负责人配置需要明确，是指定财务人员、财务角色，还是具备 `finance.expense.pay` 权限的人都可处理。
4. 如果一笔费用允许部分付款，需要明确 settlement 和 ledger 的一对多关系；本阶段建议先按一次性付款闭环验收。
5. 如果费用和项目成本、利润报表联动，后续需要补项目利润口径，本阶段先只确认支出流水。

## 建议执行顺序

1. 先做 Task 0，只读核查当前费用 workflow、权限、Admin 页面和待办。
2. 再做 Task 1，补齐发现的后端契约缺口。
3. 然后执行 Task 2 和 Task 3，跑完整 Admin 费用审批付款 smoke。
4. 最后根据产品决定是否执行 Task 4 小程序对接。

## 对小程序端的当前口径

可以这样同步：

> gooes 下一阶段会先做费用审批与支出付款闭环，当前判断小程序暂不需要立即改代码。费用审批先以 Admin 为主完成申请、审批、财务付款和财务台账验证。
>
> 如果后续确认小程序也要承载费用申请、审批或付款，我们会另行提供 workflow v2 handoff。小程序仍按现有原则接入：只消费 timeline_nodes、node.display、node.attributes、node.actions 和 /workflow-tasks.actions，推进只调用 POST /workflow-tasks/:taskId/complete，凭证上传使用 scene=expense_request，不本地推导审批节点或付款规则。

## 对 Admin 端的当前口径

可以这样同步：

> 下一阶段重点是 Admin 费用审批与支出付款闭环。Admin 需要继续以 workflow runtime/actions 为唯一操作来源，费用列表和详情只读后端 workflow_state，审批、复核、付款按钮只来自 actions[]，付款后需要在费用详情和财务台账中看到一致的支出记录。
>
> 本阶段先做只读基线核查，再准备受控费用样本跑完整 smoke，确认 expense request、workflow task、settlement、finance ledger 和付款凭证都能对齐。
