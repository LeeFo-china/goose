-- Fixed published Qingtian standard workflows; no runtime data or employee IDs.
-- Rollback via forward migration: restore the previous initializer wrapper and
-- deactivate this template. Never remove versions referenced by runtime instances.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

INSERT INTO public.tenant_templates(code,name,version,description,payload,status)
VALUES ('default_decoration_workflows','装修公司默认工作流模板','2026.10.08',
  '晴天已发布的五套标准工作流固定快照；租户初始化时生成独立副本',
  $workflow_template$
{
  "workflows": [
    {
      "name": "项目施工主流程",
      "category": "construction",
      "description": "项目从确认开工、工序施工、中期收款、竣工验收到交房的标准主流程模板。",
      "workflow_key": "construction_main",
      "source_version_id": "5801ff01-8789-49ad-b09a-e8c16e13ac20",
      "source_version_number": 3,
      "nodes": [
        {
          "title": "开始",
          "config": {
            "required_permissions": []
          },
          "node_key": "start",
          "position": {
            "x": 80,
            "y": 220
          },
          "node_type": "start",
          "sort_order": 10,
          "description": "项目进入施工主流程。",
          "business_kind": null
        },
        {
          "title": "确认开工",
          "config": {
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "started",
          "position": {
            "x": 280,
            "y": 220
          },
          "node_type": "construction_stage",
          "sort_order": 20,
          "description": "对应项目状态：已开工。",
          "business_kind": "construction_start"
        },
        {
          "title": "拆改",
          "config": {
            "stage_key": "demolition",
            "require_log": true,
            "min_image_count": 1,
            "customer_visible": true,
            "trigger_acceptance": false,
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "procedure_demolition",
          "position": {
            "x": 500,
            "y": 220
          },
          "node_type": "procedure",
          "sort_order": 30,
          "description": "拆改工序完成后放行。",
          "business_kind": "procedure_template"
        },
        {
          "title": "水电",
          "config": {
            "stage_key": "plumbing_electrical",
            "require_log": true,
            "min_image_count": 1,
            "customer_visible": true,
            "trigger_acceptance": true,
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "procedure_plumbing_electrical",
          "position": {
            "x": 720,
            "y": 220
          },
          "node_type": "procedure",
          "sort_order": 40,
          "description": "水电工序完成后放行。",
          "business_kind": "procedure_template"
        },
        {
          "title": "中期收款",
          "config": {
            "finance_type": "payment_collection",
            "payment_type": "stage_2",
            "block_message": "请先确认项目收款后再推进流程",
            "requirement_mode": "any_confirmed",
            "required_percentage": null,
            "required_permissions": [
              "finance.payment.confirm"
            ],
            "finance_reviewer_employee_id": null
          },
          "node_key": "payment_stage_2",
          "position": {
            "x": 917.246830061114,
            "y": 389.7736526209187
          },
          "node_type": "confirmation",
          "sort_order": 50,
          "description": "水电完成后确认中期款。",
          "business_kind": "payment_collection"
        },
        {
          "title": "瓦工",
          "config": {
            "stage_key": "tiling",
            "require_log": true,
            "min_image_count": 1,
            "customer_visible": true,
            "trigger_acceptance": false,
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "procedure_tiling",
          "position": {
            "x": 1160,
            "y": 220
          },
          "node_type": "procedure",
          "sort_order": 60,
          "description": "瓦工工序完成后放行。",
          "business_kind": "procedure_template"
        },
        {
          "title": "木工",
          "config": {
            "stage_key": "woodwork",
            "require_log": true,
            "min_image_count": 1,
            "customer_visible": true,
            "trigger_acceptance": false,
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "procedure_woodwork",
          "position": {
            "x": 1380,
            "y": 220
          },
          "node_type": "procedure",
          "sort_order": 70,
          "description": "木工工序完成后放行。",
          "business_kind": "procedure_template"
        },
        {
          "title": "中期收款",
          "config": {
            "finance_type": "payment_collection",
            "payment_type": "stage_3",
            "block_message": "请先确认项目收款后再推进流程",
            "requirement_mode": "any_confirmed",
            "required_percentage": null,
            "required_permissions": [
              "finance.payment.confirm"
            ],
            "finance_reviewer_employee_id": null
          },
          "node_key": "payment_stage_3",
          "position": {
            "x": 1600,
            "y": 220
          },
          "node_type": "confirmation",
          "sort_order": 80,
          "description": "木工完成后确认中期款。",
          "business_kind": "payment_collection"
        },
        {
          "title": "油工",
          "config": {
            "stage_key": "painting",
            "require_log": true,
            "min_image_count": 1,
            "customer_visible": true,
            "trigger_acceptance": false,
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "procedure_painting",
          "position": {
            "x": 1820,
            "y": 220
          },
          "node_type": "procedure",
          "sort_order": 90,
          "description": "油工工序完成后放行。",
          "business_kind": "procedure_template"
        },
        {
          "title": "安装",
          "config": {
            "stage_key": "installation",
            "require_log": true,
            "min_image_count": 1,
            "customer_visible": true,
            "trigger_acceptance": false,
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "procedure_installation",
          "position": {
            "x": 2040,
            "y": 220
          },
          "node_type": "procedure",
          "sort_order": 100,
          "description": "安装工序完成后放行。",
          "business_kind": "procedure_template"
        },
        {
          "title": "竣工验收",
          "config": {
            "stage_type": "final_acceptance",
            "required_permissions": [
              "project.update"
            ],
            "final_acceptance_report_enabled": true
          },
          "node_key": "final_acceptance",
          "position": {
            "x": 2260,
            "y": 220
          },
          "node_type": "construction_stage",
          "sort_order": 110,
          "description": "对应项目状态：竣工验收。",
          "business_kind": "final_acceptance"
        },
        {
          "title": "交房",
          "config": {
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "handover",
          "position": {
            "x": 2480,
            "y": 220
          },
          "node_type": "confirmation",
          "sort_order": 120,
          "description": "竣工验收后完成交房确认。",
          "business_kind": null
        },
        {
          "title": "结束",
          "config": {
            "required_permissions": []
          },
          "node_key": "end",
          "position": {
            "x": 2700,
            "y": 220
          },
          "node_type": "end",
          "sort_order": 130,
          "description": "项目施工主流程结束。",
          "business_kind": null
        }
      ],
      "edges": [
        {
          "source_node_key": "start",
          "target_node_key": "started",
          "label": "确认开工",
          "condition": {
            "operator": "always"
          },
          "priority": 10
        },
        {
          "source_node_key": "started",
          "target_node_key": "procedure_demolition",
          "label": "拆改",
          "condition": {
            "operator": "always"
          },
          "priority": 20
        },
        {
          "source_node_key": "procedure_demolition",
          "target_node_key": "procedure_plumbing_electrical",
          "label": "水电",
          "condition": {
            "operator": "always"
          },
          "priority": 30
        },
        {
          "source_node_key": "procedure_plumbing_electrical",
          "target_node_key": "payment_stage_2",
          "label": "中期收款",
          "condition": {
            "operator": "always"
          },
          "priority": 40
        },
        {
          "source_node_key": "payment_stage_2",
          "target_node_key": "procedure_tiling",
          "label": "瓦工",
          "condition": {
            "operator": "always"
          },
          "priority": 50
        },
        {
          "source_node_key": "procedure_tiling",
          "target_node_key": "procedure_woodwork",
          "label": "木工",
          "condition": {
            "operator": "always"
          },
          "priority": 60
        },
        {
          "source_node_key": "procedure_woodwork",
          "target_node_key": "payment_stage_3",
          "label": "中期收款",
          "condition": {
            "operator": "always"
          },
          "priority": 70
        },
        {
          "source_node_key": "payment_stage_3",
          "target_node_key": "procedure_painting",
          "label": "油工",
          "condition": {
            "operator": "always"
          },
          "priority": 80
        },
        {
          "source_node_key": "procedure_painting",
          "target_node_key": "procedure_installation",
          "label": "安装",
          "condition": {
            "operator": "always"
          },
          "priority": 90
        },
        {
          "source_node_key": "procedure_installation",
          "target_node_key": "final_acceptance",
          "label": "竣工验收",
          "condition": {
            "operator": "always"
          },
          "priority": 100
        },
        {
          "source_node_key": "final_acceptance",
          "target_node_key": "handover",
          "label": "交房",
          "condition": {
            "operator": "always"
          },
          "priority": 110
        },
        {
          "source_node_key": "handover",
          "target_node_key": "end",
          "label": "流程完成",
          "condition": {
            "operator": "always"
          },
          "priority": 120
        }
      ],
      "project_construction_default": true,
      "subject_type": null
    },
    {
      "name": "客户主流程",
      "category": "sales",
      "description": "客户从线索、跟进、到店到设计的标准主流程模板。",
      "workflow_key": "customer_main",
      "source_version_id": "beb3514a-1792-422c-8efc-5925d4d17298",
      "source_version_number": 5,
      "nodes": [
        {
          "title": "开始",
          "config": {
            "required_permissions": []
          },
          "node_key": "start",
          "position": {
            "x": 80,
            "y": 180
          },
          "node_type": "start",
          "sort_order": 10,
          "description": "客户进入主流程。",
          "business_kind": null
        },
        {
          "title": "潜在客户",
          "config": {
            "required_permissions": [
              "customer.update"
            ]
          },
          "node_key": "potential",
          "position": {
            "x": 300,
            "y": 180
          },
          "node_type": "business",
          "sort_order": 20,
          "description": "对应客户状态：潜在客户。",
          "business_kind": "customer_lead"
        },
        {
          "title": "电话跟进",
          "config": {
            "required_permissions": [
              "customer.update"
            ]
          },
          "node_key": "following",
          "position": {
            "x": 520,
            "y": 180
          },
          "node_type": "business",
          "sort_order": 30,
          "description": "对应客户状态：跟进中。",
          "business_kind": "phone_follow_up"
        },
        {
          "title": "到店接待",
          "config": {
            "required_permissions": [
              "customer.update"
            ]
          },
          "node_key": "arrived",
          "position": {
            "x": 740,
            "y": 180
          },
          "node_type": "business",
          "sort_order": 40,
          "description": "对应客户状态：已到店。",
          "business_kind": "store_visit"
        },
        {
          "title": "方案设计",
          "config": {
            "required_permissions": [
              "customer.update"
            ]
          },
          "node_key": "designing",
          "position": {
            "x": 960,
            "y": 180
          },
          "node_type": "business",
          "sort_order": 50,
          "description": "对应客户状态：设计中。",
          "business_kind": "design"
        },
        {
          "title": "结束",
          "config": {
            "required_permissions": []
          },
          "node_key": "end",
          "position": {
            "x": 1180,
            "y": 180
          },
          "node_type": "end",
          "sort_order": 60,
          "description": "客户主流程完成。",
          "business_kind": null
        }
      ],
      "edges": [
        {
          "source_node_key": "start",
          "target_node_key": "potential",
          "label": "登记客户",
          "condition": {
            "operator": "always"
          },
          "priority": 10
        },
        {
          "source_node_key": "potential",
          "target_node_key": "following",
          "label": "开始跟进",
          "condition": {
            "operator": "always"
          },
          "priority": 20
        },
        {
          "source_node_key": "following",
          "target_node_key": "arrived",
          "label": "标记到店",
          "condition": {
            "operator": "always"
          },
          "priority": 30
        },
        {
          "source_node_key": "arrived",
          "target_node_key": "designing",
          "label": "开始设计",
          "condition": {
            "operator": "always"
          },
          "priority": 40
        },
        {
          "source_node_key": "designing",
          "target_node_key": "end",
          "label": "设计完成",
          "condition": {
            "operator": "always"
          },
          "priority": 50
        }
      ],
      "project_construction_default": false,
      "subject_type": null
    },
    {
      "name": "费用审批流程",
      "category": "approval",
      "description": "费用申请从主管审批、财务审批到登记打款的标准流程模板。",
      "workflow_key": "expense_approval",
      "source_version_id": "d316c0bd-6ab2-42b8-ad88-821b6c34bb82",
      "source_version_number": 8,
      "nodes": [
        {
          "title": "开始",
          "config": {
            "required_permissions": []
          },
          "node_key": "start",
          "position": {
            "x": 26.209934385947633,
            "y": 194.67001789474156
          },
          "node_type": "start",
          "sort_order": 10,
          "description": "费用申请提交审批。",
          "business_kind": null
        },
        {
          "title": "经理审批",
          "config": {
            "assignee_id": null,
            "approve_mode": "any",
            "approval_type": "expense_approval",
            "assignee_rule": "applicant_department_manager",
            "required_permissions": [
              "expense_request.approve_manager"
            ]
          },
          "node_key": "manager_review",
          "position": {
            "x": 321.19002584796,
            "y": 165.3299821052585
          },
          "node_type": "approval",
          "sort_order": 20,
          "description": "对应费用当前步骤：经理审批。",
          "business_kind": "expense_approval"
        },
        {
          "title": "财务审批",
          "config": {
            "assignee_id": "finance_base",
            "approve_mode": "any",
            "approval_type": "expense_approval",
            "assignee_rule": "role",
            "required_permissions": [
              "expense_request.approve_finance"
            ],
            "assignee_permission_code": "expense_request.approve_finance"
          },
          "node_key": "finance_review",
          "position": {
            "x": 557.4900457310061,
            "y": 175.10999403508615
          },
          "node_type": "approval",
          "sort_order": 30,
          "description": "对应费用当前步骤：财务审批。",
          "business_kind": "expense_approval"
        },
        {
          "title": "出纳打款",
          "config": {
            "approve_mode": "any",
            "approval_type": "expense_approval",
            "required_permissions": [
              "expense_request.pay"
            ],
            "assignee_permission_code": "expense_request.pay"
          },
          "node_key": "payment",
          "position": {
            "x": 740,
            "y": 180
          },
          "node_type": "approval",
          "sort_order": 40,
          "description": "对应费用当前步骤：待打款。",
          "business_kind": "expense_approval"
        },
        {
          "title": "已驳回",
          "config": {
            "required_permissions": []
          },
          "node_key": "rejected",
          "position": {
            "x": 539.5600238596554,
            "y": 489.21013321640936
          },
          "node_type": "end",
          "sort_order": 50,
          "description": "费用审批驳回后流程结束，申请人可修改后重新提交。",
          "business_kind": null
        },
        {
          "title": "已完成",
          "config": {
            "required_permissions": []
          },
          "node_key": "done",
          "position": {
            "x": 960,
            "y": 180
          },
          "node_type": "end",
          "sort_order": 60,
          "description": "费用完成打款后流程结束。",
          "business_kind": null
        }
      ],
      "edges": [
        {
          "source_node_key": "finance_review",
          "target_node_key": "rejected",
          "label": "审批拒绝",
          "condition": {
            "field": "decision",
            "value": "rejected",
            "operator": "eq"
          },
          "priority": 6
        },
        {
          "source_node_key": "manager_review",
          "target_node_key": "rejected",
          "label": "审批拒绝",
          "condition": {
            "field": "decision",
            "value": "rejected",
            "operator": "eq"
          },
          "priority": 6
        },
        {
          "source_node_key": "payment",
          "target_node_key": "done",
          "label": "完成打款",
          "condition": {
            "operator": "always"
          },
          "priority": 10
        },
        {
          "source_node_key": "start",
          "target_node_key": "manager_review",
          "label": "提交申请",
          "condition": {
            "operator": "always"
          },
          "priority": 10
        },
        {
          "source_node_key": "finance_review",
          "target_node_key": "payment",
          "label": "财务通过",
          "condition": {
            "field": "decision",
            "value": "approved",
            "operator": "eq"
          },
          "priority": 20
        },
        {
          "source_node_key": "manager_review",
          "target_node_key": "finance_review",
          "label": "主管通过",
          "condition": {
            "field": "decision",
            "value": "approved",
            "operator": "eq"
          },
          "priority": 20
        }
      ],
      "project_construction_default": false,
      "subject_type": null
    },
    {
      "name": "项目签约主流程",
      "category": "signing",
      "description": "项目从设计、方案确认、签约、设计定稿到排期开工的标准主流程模板。",
      "workflow_key": "project_signing",
      "source_version_id": "ea45f1fb-45f0-4ea0-8d22-a0149aabe903",
      "source_version_number": 1,
      "nodes": [
        {
          "title": "开始",
          "config": {
            "required_permissions": []
          },
          "node_key": "start",
          "position": {
            "x": 80,
            "y": 220
          },
          "node_type": "start",
          "sort_order": 10,
          "description": "项目进入签约主流程。",
          "business_kind": null
        },
        {
          "title": "设计中",
          "config": {
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "designing",
          "position": {
            "x": 280,
            "y": 220
          },
          "node_type": "business",
          "sort_order": 20,
          "description": "对应项目状态：设计中。",
          "business_kind": "design"
        },
        {
          "title": "方案已确认",
          "config": {
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "proposal_confirmed",
          "position": {
            "x": 500,
            "y": 220
          },
          "node_type": "business",
          "sort_order": 30,
          "description": "对应项目状态：方案已确认。",
          "business_kind": "design"
        },
        {
          "title": "项目签约",
          "config": {
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "signed",
          "position": {
            "x": 720,
            "y": 220
          },
          "node_type": "business",
          "sort_order": 40,
          "description": "对应项目状态：已签约。",
          "business_kind": "contract"
        },
        {
          "title": "设计定稿",
          "config": {
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "design_finalized",
          "position": {
            "x": 940,
            "y": 220
          },
          "node_type": "business",
          "sort_order": 50,
          "description": "对应项目状态：设计定稿。",
          "business_kind": "design"
        },
        {
          "title": "排期开工",
          "config": {
            "required_permissions": [
              "project.update"
            ]
          },
          "node_key": "pending_start",
          "position": {
            "x": 1160,
            "y": 220
          },
          "node_type": "business",
          "sort_order": 60,
          "description": "对应项目状态：待开工。",
          "business_kind": "construction_start"
        },
        {
          "title": "结束",
          "config": {
            "required_permissions": []
          },
          "node_key": "end",
          "position": {
            "x": 1380,
            "y": 220
          },
          "node_type": "end",
          "sort_order": 70,
          "description": "项目签约主流程结束。",
          "business_kind": null
        }
      ],
      "edges": [
        {
          "source_node_key": "start",
          "target_node_key": "designing",
          "label": "进入设计",
          "condition": {
            "operator": "always"
          },
          "priority": 10
        },
        {
          "source_node_key": "designing",
          "target_node_key": "proposal_confirmed",
          "label": "方案确认",
          "condition": {
            "operator": "always"
          },
          "priority": 20
        },
        {
          "source_node_key": "proposal_confirmed",
          "target_node_key": "signed",
          "label": "项目签约",
          "condition": {
            "operator": "always"
          },
          "priority": 30
        },
        {
          "source_node_key": "signed",
          "target_node_key": "design_finalized",
          "label": "设计定稿",
          "condition": {
            "operator": "always"
          },
          "priority": 40
        },
        {
          "source_node_key": "design_finalized",
          "target_node_key": "pending_start",
          "label": "排期开工",
          "condition": {
            "operator": "always"
          },
          "priority": 50
        },
        {
          "source_node_key": "pending_start",
          "target_node_key": "end",
          "label": "流程完成",
          "condition": {
            "operator": "always"
          },
          "priority": 60
        }
      ],
      "project_construction_default": false,
      "subject_type": null
    },
    {
      "name": "采购批次审批",
      "category": "approval",
      "description": "采购负责人先审批采购批次，超预算时再由财务审批。",
      "workflow_key": "supplier_purchase_batch_approval",
      "source_version_id": "d7967da8-8aaf-404c-a01d-3730c8f2dc84",
      "source_version_number": 2,
      "nodes": [
        {
          "title": "开始",
          "config": {
            "required_permissions": []
          },
          "node_key": "start",
          "position": {
            "x": 80,
            "y": 200
          },
          "node_type": "start",
          "sort_order": 10,
          "description": "采购批次提交审批。",
          "business_kind": null
        },
        {
          "title": "采购审批",
          "config": {
            "actions": [
              "approve",
              "reject"
            ],
            "assignee_id": "finance_base",
            "approve_mode": "any",
            "approval_type": "workflow_approval",
            "assignee_rule": "role",
            "required_permissions": [
              "supplier.purchase-requisition.approve"
            ],
            "assignee_permission_code": "supplier.purchase-requisition.approve"
          },
          "node_key": "purchase_review",
          "position": {
            "x": 320,
            "y": 200
          },
          "node_type": "approval",
          "sort_order": 20,
          "description": "采购负责人审核采购批次。",
          "business_kind": null
        },
        {
          "title": "财务审批",
          "config": {
            "actions": [
              "approve",
              "reject"
            ],
            "approve_mode": "any",
            "approval_type": "workflow_approval",
            "assignee_rule": "role",
            "required_permissions": [
              "finance.budget.manage"
            ],
            "assignee_permission_code": "finance.budget.manage"
          },
          "node_key": "finance_review",
          "position": {
            "x": 600,
            "y": 340
          },
          "node_type": "approval",
          "sort_order": 30,
          "description": "财务负责人审核超预算采购批次。",
          "business_kind": null
        },
        {
          "title": "审批通过",
          "config": {
            "required_permissions": []
          },
          "node_key": "approved_end",
          "position": {
            "x": 880,
            "y": 160
          },
          "node_type": "end",
          "sort_order": 40,
          "description": "采购批次审批通过。",
          "business_kind": null
        },
        {
          "title": "审批驳回",
          "config": {
            "required_permissions": []
          },
          "node_key": "rejected_end",
          "position": {
            "x": 600,
            "y": 500
          },
          "node_type": "end",
          "sort_order": 50,
          "description": "采购批次审批驳回，申请人可修改后重新提交。",
          "business_kind": null
        }
      ],
      "edges": [
        {
          "source_node_key": "start",
          "target_node_key": "purchase_review",
          "label": "提交审批",
          "condition": {
            "operator": "always"
          },
          "priority": 10
        },
        {
          "source_node_key": "purchase_review",
          "target_node_key": "rejected_end",
          "label": "采购驳回",
          "condition": {
            "field": "decision",
            "value": "rejected",
            "operator": "eq"
          },
          "priority": 10
        },
        {
          "source_node_key": "finance_review",
          "target_node_key": "approved_end",
          "label": "财务通过",
          "condition": {
            "field": "decision",
            "value": "approved",
            "operator": "eq"
          },
          "priority": 10
        },
        {
          "source_node_key": "purchase_review",
          "target_node_key": "approved_end",
          "label": "采购通过",
          "condition": {
            "field": "budget_status",
            "value": "over_budget",
            "operator": "neq"
          },
          "priority": 20
        },
        {
          "source_node_key": "finance_review",
          "target_node_key": "rejected_end",
          "label": "财务驳回",
          "condition": {
            "field": "decision",
            "value": "rejected",
            "operator": "eq"
          },
          "priority": 20
        },
        {
          "source_node_key": "purchase_review",
          "target_node_key": "finance_review",
          "label": "超预算复核",
          "condition": {
            "field": "budget_status",
            "value": "over_budget",
            "operator": "eq"
          },
          "priority": 30
        }
      ],
      "project_construction_default": false,
      "subject_type": "supplier_purchase_batch"
    }
  ]
}
$workflow_template$::jsonb,'active');

CREATE OR REPLACE FUNCTION public.__gooes_apply_default_workflow_templates(
  p_tenant_id uuid,
  p_replace_definition_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_template public.tenant_templates%ROWTYPE;
  v_workflow jsonb;
  v_definition public.workflow_definitions%ROWTYPE;
  v_previous_version uuid;
  v_graph jsonb;
  v_snapshot jsonb;
  v_publish jsonb;
  v_result jsonb := '[]'::jsonb;
BEGIN
  PERFORM id FROM public.tenants WHERE id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='WORKFLOW_TEMPLATE_TENANT_NOT_FOUND';
  END IF;
  SELECT result INTO v_result FROM public.tenant_template_applications
  WHERE tenant_id=p_tenant_id AND template_code='default_decoration_workflows'
    AND template_version='2026.10.08';
  IF FOUND THEN RETURN v_result; END IF;
  v_result := '[]'::jsonb;

  SELECT * INTO STRICT v_template FROM public.tenant_templates
  WHERE code='default_decoration_workflows' AND version='2026.10.08' AND status='active';
  IF jsonb_array_length(v_template.payload->'workflows') IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFLOW_TEMPLATE_PAYLOAD_INVALID';
  END IF;

  FOR v_workflow IN SELECT value FROM jsonb_array_elements(v_template.payload->'workflows') LOOP
    SELECT * INTO v_definition FROM public.workflow_definitions
    WHERE tenant_id=p_tenant_id AND workflow_key=v_workflow->>'workflow_key' FOR UPDATE;
    IF FOUND THEN
      -- Only the separately audited Tianxi backfill may replace its existing
      -- purchase draft. New-tenant initialization must fail on any collision.
      IF v_definition.id IS DISTINCT FROM p_replace_definition_id
        OR v_definition.workflow_key <> 'supplier_purchase_batch_approval'
        OR v_definition.status <> 'active' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFLOW_TEMPLATE_DEFINITION_CONFLICT';
      END IF;
    ELSE
      INSERT INTO public.workflow_definitions(tenant_id,workflow_key,name,description,category)
      VALUES(p_tenant_id,v_workflow->>'workflow_key',v_workflow->>'name',v_workflow->>'description',v_workflow->>'category')
      RETURNING * INTO v_definition;
    END IF;
    v_previous_version := v_definition.active_version_id;
    UPDATE public.workflow_definitions SET name=v_workflow->>'name',
      description=v_workflow->>'description', category=v_workflow->>'category'
    WHERE id=v_definition.id AND tenant_id=p_tenant_id;

    -- The existing graph RPC uses a transaction-scoped temp table.
    DROP TABLE IF EXISTS pg_temp.tmp_workflow_draft_nodes;
    v_graph := public.replace_workflow_draft_graph(p_tenant_id,v_definition.id,v_workflow->'nodes',v_workflow->'edges');
    IF (v_graph->>'ok')::boolean IS DISTINCT FROM true
      OR jsonb_array_length(v_graph->'nodes') IS DISTINCT FROM jsonb_array_length(v_workflow->'nodes')
      OR jsonb_array_length(v_graph->'edges') IS DISTINCT FROM jsonb_array_length(v_workflow->'edges') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFLOW_TEMPLATE_GRAPH_INVALID';
    END IF;
    SELECT * INTO STRICT v_definition FROM public.workflow_definitions WHERE id=v_definition.id;
    v_snapshot := jsonb_build_object('definition_id',v_definition.id,
      'workflow_key',v_definition.workflow_key,'category',v_definition.category,
      'published_at',now(),'nodes',v_graph->'nodes','edges',v_graph->'edges');
    IF v_workflow->>'subject_type' IS NOT NULL THEN
      v_snapshot := v_snapshot || jsonb_build_object('subject_type',v_workflow->>'subject_type');
    END IF;
    v_publish := public.publish_workflow_definition(p_tenant_id,v_definition.id,v_snapshot,
      jsonb_build_object('template_code',v_template.code,'template_version',v_template.version),
      NULL,NULL,v_definition.updated_at,'默认模板 2026.10.08');
    IF (v_publish->>'ok')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFLOW_TEMPLATE_PUBLISH_FAILED';
    END IF;
    IF (v_workflow->>'project_construction_default')::boolean THEN
      INSERT INTO public.workflow_definition_bindings(tenant_id,subject_type,workflow_purpose,definition_id,selectable,is_default)
      VALUES(p_tenant_id,'project','construction',v_definition.id,true,true);
    END IF;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'workflow_key',v_definition.workflow_key,'definition_id',v_definition.id,
      'version_id',v_publish->'version'->>'id','previous_version_id',v_previous_version,
      'source_version_id',v_workflow->>'source_version_id'));
  END LOOP;
  INSERT INTO public.tenant_template_applications(tenant_id,template_id,template_code,template_version,result)
  VALUES(p_tenant_id,v_template.id,v_template.code,v_template.version,v_result);
  RETURN v_result;
END;
$$;
-- The production initializer is owned by a non-superuser postgres role.
-- Keep its private callee executable by the same owner, without granting RPC access.
DO $owner$
DECLARE v_owner name;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO STRICT v_owner FROM pg_proc
  WHERE oid='public.initialize_default_decoration_tenant(uuid,text,text,uuid)'::regprocedure;
  EXECUTE format('ALTER FUNCTION public.__gooes_apply_default_workflow_templates(uuid,uuid) OWNER TO %I',v_owner);
END;
$owner$;
REVOKE ALL ON FUNCTION public.__gooes_apply_default_workflow_templates(uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.initialize_default_decoration_tenant(
  p_tenant_id uuid,p_admin_name text,p_admin_phone text,p_operator_employee_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_initialization jsonb;
  v_new_organization boolean;
BEGIN
  -- Serialize classification with both organization and workflow application.
  PERFORM id FROM public.tenants WHERE id=p_tenant_id FOR UPDATE;
  v_new_organization := NOT EXISTS (
    SELECT 1 FROM public.tenant_template_applications
    WHERE tenant_id=p_tenant_id AND template_code='default_decoration_company'
  );
  v_initialization := public.__gooes_initialize_default_decoration_tenant_20260830(
    p_tenant_id,p_admin_name,p_admin_phone,p_operator_employee_id
  );
  IF v_new_organization THEN
    PERFORM public.__gooes_apply_default_workflow_templates(p_tenant_id);
  ELSE
    -- Preserve existing tenant behavior and independently customized workflows.
    PERFORM public.__gooes_ensure_supplier_purchase_batch_workflow_template(p_tenant_id);
  END IF;
  RETURN v_initialization;
END;
$$;
REVOKE ALL ON FUNCTION public.initialize_default_decoration_tenant(uuid,text,text,uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.initialize_default_decoration_tenant(uuid,text,text,uuid) TO service_role;
COMMENT ON FUNCTION public.initialize_default_decoration_tenant(uuid,text,text,uuid)
IS 'gooes:20261008061809:tenant-initializer-workflow-template:v1';
COMMIT;
