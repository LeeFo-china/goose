# Workflow Unified Node Configuration Design

## Goal

Make the admin workflow designer feel like one simple model: users add a
generic workflow step, then choose what the step does from the property panel.
The canvas should not force tenants to understand separate technical node
classes such as business, procedure, confirmation, approval, and finance.

## Product Decision

The admin experience uses one primary draggable item: `流程节点`.
After placing it on the canvas, the user configures:

1. Node title and description.
2. Node capability.
3. Capability-specific type.
4. Completion rules, blocking message, permissions, timeout, and rollback.

The runtime data model remains compatible with the current backend:

- `node_type` still determines runtime behavior.
- `business_kind` still identifies domain behavior.
- `config` still stores capability-specific settings.

This keeps the current database, publish, and runtime paths stable while making
the editor easier to use.

## Capability Model

The first implementation supports these capabilities:

| Capability | Stored `node_type` | Stored `business_kind` | Specific type field |
| --- | --- | --- | --- |
| 业务流转 | `business` | selected business kind | `business_kind` |
| 施工阶段 | `construction_stage` | `construction_start` | fixed |
| 工序 | `procedure` | `procedure_template` | `config.stage_key` |
| 收款 | `confirmation` | `payment_collection` | `config.payment_type` |
| 竣工验收 | `confirmation` | `final_acceptance` | fixed |
| 财务 | `approval` | `settlement` | approval config |
| 审批 | `approval` | `expense_approval` | approval config |
| 通知 | `notification` | `null` | notification config |
| 自动动作 | `automation` | `null` | reserved |
| 子流程 | `subflow` | `null` | reserved |

`start` and `end` stay as control nodes because they are structural and should
remain obvious.

## Admin Interaction

The node library should be simplified:

- 流程控制: 开始, 结束
- 常用节点: 流程节点
- 系统节点: 通知, 自动动作, 子流程

When a user adds `流程节点`, the default node is a business step:

- `node_type = "business"`
- `business_kind = "customer_lead"`
- title `客户线索`
- config `{ required_permissions: [] }`

The property panel replaces `平台节点` with `节点能力`.
Changing capability applies a preset safely:

- It updates `node_type`, `business_kind`, title, node key, description, and
  default config.
- It preserves common config where possible: `required_permissions`,
  `timeout_hours`, `rollback_target_key`.
- It resets incompatible capability-specific config to avoid stale fields.

Specific type selectors live below the capability selector:

- 业务流转: 客户线索、电话跟进、到店、量房、设计、报价、签约。
- 施工阶段: 开工。
- 工序: 拆改、水电、瓦工、木工、油工、安装。
- 收款: 定金、中期款、尾款、增项款.
- 审批: finance approval fields already shown.

When a specific type changes, the node title and stable node key should update
to the canonical label/key unless that would collide with another node.

## Validation

Existing validation remains:

- One start node.
- At least one end node.
- Duplicate node keys are invalid.
- Procedure nodes must choose a construction stage.
- Procedure stages cannot duplicate within the same workflow.
- Payment collection nodes must choose a valid payment type.
- Config references must point to existing node keys.

The designer should validate the same rules before publishing and keep the
current API validation as the final authority.

## Runtime Behavior

Runtime behavior does not change in this phase.

- Procedure guards still read `node_type = "procedure"` and `config.stage_key`.
- Payment guards still read `business_kind = "payment_collection"` and
  `config.payment_type`.
- Final acceptance guards still read `business_kind = "final_acceptance"`.
- Customer workflow runtime still reads existing business kinds.

This phase is an admin modeling and configuration improvement, not a workflow
engine rewrite.

## Out Of Scope

- New database tables or migrations.
- Branch conditions UI.
- A new generic JSON-only node runtime.
- Mini-program UI changes.
- Automatic creation of project acceptance records when a procedure completes.

## Acceptance Criteria

1. A tenant can add a single `流程节点` from the node library.
2. The property panel can change that node to business, procedure, payment,
   final acceptance, finance approval, notification, automation, or subflow.
3. Procedure type selection still drives title and node key.
4. Payment type selection still drives title and payment blocking behavior.
5. Existing workflow definitions continue to load and edit correctly.
6. Admin and API checks pass.
