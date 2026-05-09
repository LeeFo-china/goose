# 多租户阶段 0 表清单

日期：2026-05-09

## 分类原则

| 类型 | 说明 |
| --- | --- |
| 平台级表 | 平台基础设施、全局权限点、全局配置、平台运营数据 |
| 租户级表 | 属于某个装修公司的业务数据，必须带 `tenant_id` |
| 全局字典表 | 系统能力字典，通常不带 `tenant_id` |
| 待确认 | 需要结合业务语义确认归属 |

## 平台级表

| 表 | 说明 |
| --- | --- |
| `tenants` | 阶段 1 新增，平台租户表 |
| `permissions` | 权限点字典，全局唯一 |
| `system_settings` | 支持平台级和租户级，平台级记录 `tenant_id is null` |
| `system_setting_audit_logs` | 配置审计，后续需支持平台/租户归属 |
| `ops_script_runs` | 运维脚本执行记录，默认平台级 |
| `platform_leads` | 阶段 4 新增，平台访客线索 |
| `platform_lead_assign_logs` | 阶段 4 新增，平台线索分配审计 |
| `ai_providers` | 阶段 3 设计，平台级 AI Provider |
| `ai_models` | 阶段 3 设计，平台级模型 |
| `ai_scene_routes` | 阶段 3 设计，平台级场景路由 |

## 全局字典表

| 表 | 说明 |
| --- | --- |
| `permissions` | 权限 code 字典 |
| `expense_request_categories` | 费用类型字典，是否租户可自定义需后续确认 |

## 第一批必须租户化表

阶段 1-2 优先处理：

| 表 | 处理阶段 | 说明 |
| --- | --- | --- |
| `employees` | 阶段 1 | 员工必须归属租户 |
| `customers` | 阶段 1 | 客户必须归属租户 |
| `projects` | 阶段 1 | 项目必须归属租户 |
| `properties` | 阶段 1 | 房产跟随客户/项目归属 |
| `departments` | 阶段 2 | 组织架构租户内独立 |
| `posts` | 阶段 2 | 岗位租户内独立 |
| `roles` | 阶段 2 | 角色租户内独立 |
| `employee_roles` | 阶段 2 | 员工角色绑定租户内有效 |
| `role_permissions` | 阶段 2 | 通过角色归属租户 |
| `employee_permission_overrides` | 阶段 2 | 员工权限覆盖租户内有效 |

## 业务模块租户化表

阶段 3 优先处理：

| 表 | 模块 | 说明 |
| --- | --- | --- |
| `project_logs` | 施工日志 | 从项目继承租户 |
| `project_log_comments` | 施工日志评论 | 从日志或项目继承租户 |
| `expense_requests` | 费用审批 | 申请单属于租户 |
| `expense_request_items` | 费用审批 | 从申请单继承租户 |
| `expense_request_approvals` | 费用审批 | 从申请单继承租户 |
| `expense_request_approval_chains` | 费用审批 | 租户内审批模板 |
| `expense_request_settlements` | 费用审批 | 从申请单继承租户 |
| `project_acceptances` | 工序验收 | 从项目继承租户 |
| `project_acceptance_items` | 工序验收 | 从验收单继承租户 |
| `project_acceptance_actions` | 工序验收 | 从验收单继承租户 |
| `project_acceptance_open_tickets` | 工序验收短信 | 必须持久化租户上下文 |
| `project_cameras` | 工地监控 | 摄像头绑定关系属于租户 |
| `customer_follow_ups` | 客户跟进 | 属于租户客户 |
| `customer_follow_up_comments` | 客户跟进 | 属于租户客户 |
| `customer_phone_access_logs` | 客户隐私 | 属于租户客户访问审计 |
| `project_members` | 项目成员 | 从项目继承租户 |
| `project_referrals` | 项目转介绍 | 从项目/客户继承租户 |
| `payments` | 收款 | 从项目继承租户 |
| `social_video_transcriptions` | 短视频识别 | 阶段 3 加 `tenant_id` |
| `social_video_scripts` | 自媒体脚本 | 阶段 3 加 `tenant_id` |
| `ai_call_logs` | AI 调用日志 | 可空 `tenant_id`，租户任务必须写入 |

## 营销与 H5 租户化表

阶段 4 处理：

| 表 | 说明 |
| --- | --- |
| `marketing_campaigns` | 租户营销活动 |
| `marketing_campaign_projects` | 租户活动项目范围 |
| `marketing_h5_pages` | 租户 H5 页面 |
| `marketing_h5_page_versions` | 租户 H5 页面版本 |
| `marketing_leads` | 租户 H5 线索 |
| `customer_project_log_shares` | 客户日志分享 |
| `customer_project_log_share_instances` | 分享实例 |
| `tenant_share_links` | 阶段 4 新增，员工拓客分享短码 |
| `customer_sources` | 阶段 4 新增，客户来源时间线 |

## 身份与登录相关表

| 表 | 建议 |
| --- | --- |
| `sms_verification_codes` | 可保持平台级验证码表，后续可增加 `tenant_id` 或 scene context |
| `wechat_identities` | 微信身份可平台级，客户/员工绑定关系由租户表确定 |
| `user_profiles` | 需确认是否平台级用户资料 |

## 阶段 1 Migration 范围

阶段 1 建议只修改：

- `tenants`
- `employees.tenant_id`
- `customers.tenant_id`
- `projects.tenant_id`
- `properties.tenant_id`

其他表在阶段 2-4 分批处理。

