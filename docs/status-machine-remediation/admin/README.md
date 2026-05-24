# Admin 状态机对接总览

日期：2026-05-21

## 对接目标

Admin 端状态流转统一改为动作驱动，普通编辑表单只维护基础资料，不再把 `status` 当作普通字段保存。

当前有效流程：

- 客户销售阶段：`potential` 线索 -> `following` 跟进中 -> `arrived` 已到店 -> `designing` 设计中 -> `signed` 已签约。
- 销售到项目衔接：客户点击 `start_design` 时，Admin 必须先完成项目创建/确认；项目存在后才调用客户状态动作进入 `designing`。
- 项目执行 `sign_contract` 成功后，后端自动把关联客户从 `designing` 推进到 `signed`；客户已是 `signed` 时保持不变。
- 项目交付阶段：`designing` 设计中 -> `proposal_confirmed` 方案已确认 -> `signed` 已签约 -> `design_finalized` 设计定稿 -> `pending_start` 待开工 -> `started` 已开工 -> `constructing` 施工中 -> `acceptance` 竣工验收。

已下线内容：

- 客户 `ordered / contracted` 状态。
- 客户 `place_order / sign_contract` 动作。
- 项目 `lead / measure / negotiating / completed / after_sale` 状态。
- 项目 `start_measure / start_negotiation / start_design / complete_project / start_after_sale` 动作。

## 文档索引

- [客户状态机对接](./2026-05-21-customer-status-machine-integration.md)
- [项目状态机对接](./2026-05-21-project-status-machine-integration.md)
- [客户项目状态联动对接](./2026-05-21-customer-project-status-linkage.md)
- [状态动作和时间线对接](./2026-05-21-status-actions-and-transition-timeline.md)
- [Admin 动作化落地记录](./2026-05-21-admin-status-machine-implementation.md)
- [施工阶段子状态机对接](./2026-05-24-construction-stage-status-machine-integration.md)

## 接口可用性

- `POST /customers/:id/status-transition`
- `POST /projects/:id/status-transition`
- `GET /customers/:id/status-actions`
- `GET /projects/:id/status-actions`
- `GET /customers/:id/status-transitions?page=1&pageSize=20`
- `GET /projects/:id/status-transitions?page=1&pageSize=20`

旧 `PATCH /customers/:id` / `PATCH /projects/:id` 传 `status` 的兼容路径不再作为新代码接入依据。

## 通用请求格式

```json
{
  "action": "action_name",
  "reason": "可选，部分动作必填",
  "metadata": {
    "source": "admin"
  }
}
```

项目签约额外携带：

```json
{
  "action": "sign_contract",
  "signed_amount": 120000,
  "reason": "合同已确认",
  "metadata": {
    "source": "admin"
  }
}
```

## 通用 UI 规则

- 普通编辑表单不展示或不提交 `status`。
- 状态动作放在详情页显式触发。
- 状态按钮以 `GET /status-actions` 返回值为准。
- `requires_reason=true` 的动作必须弹窗填写原因。
- `sign_contract` 必须弹窗填写 `signed_amount > 0`。
- 危险动作使用二次确认，包括 `pause_project` 和 `mark_invalid`。
- 成功后刷新当前详情、列表、动作列表、状态时间线和相关统计。
- 前端可以提前禁用明显非法动作，但后端 400 仍是最终准入。

## 写操作限制

- `invalid / on_hold / acceptance` 项目不能新增施工日志。
- `invalid / acceptance` 项目不能新增摄像头。
- 只有 `constructing / acceptance` 项目能发起或查看验收相关流程。

## 验收口径

- 编辑客户保存基础信息时，网络请求不包含 `status`。
- 编辑项目保存基础信息时，网络请求不包含 `status`。
- `arrived` 客户点击 `start_design` 后先弹出项目创建 card；缺主房产时在 card 内补齐主房产，项目创建/确认成功后才进入 `designing`。
- 项目详情状态顺序显示为：开始设计、方案已确认、项目签约、设计定稿、待开工、已开工、施工中、竣工验收。
- 项目处于 `designing` 时，只能先执行 `confirm_proposal`，不能直接 `sign_contract`。
- 项目签约成功后项目进入 `signed`，并自动把关联客户销售状态推进到 `signed`；不再使用旧 `contracted`。
- 施工阶段必须按拆改、水电、瓦工、木工、油工、安装顺序推进，前置阶段未验收通过时不能进入下一阶段。
- 必需施工阶段未全部完成时，项目不能执行 `start_acceptance` 进入竣工验收。
