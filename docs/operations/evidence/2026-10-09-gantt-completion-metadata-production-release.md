# 甘特图节点完成元数据生产发布

- 授权：用户在完成实现交付后要求“下一步”；继续发布本次 API 修复并只读验证。
- 服务范围：api。
- 源码：`a1f4f6f6c4cab63600bcfe5d0d51d67ad62fcce5`；Tag：`v2026.10.09.2`。
- 候选构建：[37916419696](https://github.com/LeeFo-china/goose/actions/runs/37916419696)。
- 生产部署：[37916995561](https://github.com/LeeFo-china/goose/actions/runs/37916995561)，成功。
- 状态：候选构建、生产镜像来源校验、生产部署及只读业务验收均通过。
- 完成时间：`2026-10-09T10:22:23Z`，北京时间 18:22:23。
- 当前镜像：`useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:4d3dd06594b7a4a213883f2071d4d88cdb4cce3b0aacb3028b5c82b3adf7186f`。
- 实际容器 revision 与源码一致，Docker health=healthy，公网 API 根路径 HTTP 200。

## 变更与验证边界

既有分页甘特图新增实际开始/完成时间、完成操作员工 ID/姓名、操作人类型、排期/派工适用性。保留计划日期、派工人、原排期状态枚举和所有分页/筛选/权限契约。未知操作人不推断为系统完成，未放行验收节点不输出已完成元数据。

发布前相关自动化 49 项通过，API 类型检查、构建、500 行限制和独立代码审查通过。与此前生产 API revision 比较，后端差异仅为本次修复；本次无数据库迁移、无生产业务数据修复、无小程序仓库修改。

线上验证使用同租户真实员工身份的短时凭证，仅在服务容器内存中生成和使用，不输出/保存凭证，不提升员工权限。请求均为 GET；只打印限定项目节点与验收结果。

## 上线只读验收

生产容器内调用真实 HTTP 接口 `GET /tenant-owner/daily-dashboard/projects/gantt?page=1&pageSize=10&keyword=十里头德盛苑&timezone=Asia/Shanghai`：

- HTTP 200，page=1、pageSize=10、total=2，partial_errors=[]。
- 截图 project_id=`1c245715-dd5e-47b5-93bc-6ec6864c3716`；instance_id=`ada54da0-3a62-4556-a254-3d02666168cc`，instance_status=completed。
- started / 确认开工 / construction_stage / construction_start / done。
- actual_started_at=`2026-10-09T05:32:36.629934+00:00`。
- actual_completed_at=`2026-10-09T05:32:45.915399+00:00`，北京时间 13:32:45.915399。
- completed_by_employee_id=`d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`，completed_by_employee_name=风清扬，completion_actor_type=employee。
- schedule_applicable=false，assignment_applicable=false。
- planned_start_date/planned_end_date/assignee_employee_name 均 null；原 schedule_status=unscheduled 保持兼容。
- 本页每个 timeline 节点均包含全部 7 个新增字段。
- pageSize=101 返回 400；无凭证请求返回 401。
- 首次 smoke 脚本把项目 ID 误读为列表项顶层，断言失败；按既有响应的 list[].project.id 修正脚本后全部通过。没有因此改动生产代码。

## 先前版本与回退

- 先前 API revision：`297bde33a63e7b1eaff4eac896b14a0d9a38f6ed`。
- 先前镜像：`useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:a445b323f7b0e68242528b20ba5358b4451d6ceeb02b41f65dcbbc3ca4bce17b`。
- 回退走现有生产候选流程，以先前源码重新构建候选并部署；不重放已消费的部署回执。本次没有数据库变更需要回滚。

字段语义及事实核查见 [后端交接文档](../../application_integration_documentation/2026-10-09-gantt-completed-node-metadata.md)。小程序已完成展示与全完成默认选中行为由小程序团队配套发布。
