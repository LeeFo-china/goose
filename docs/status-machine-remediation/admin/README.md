# Admin 状态机对接总览

日期：2026-05-21

## 对接目标

Admin 端需要从“在编辑表单里直接修改 `status` 字段”调整为“在详情页展示当前状态和可执行动作，用户点击动作后调用状态流转接口”。

本次对接覆盖：

- 客户状态机：`potential -> following -> arrived / ordered / contracted` 等生命周期动作。
- 项目状态机：`lead -> measure -> negotiating -> signed -> designing / constructing / acceptance / completed` 等工程动作。
- 客户项目联动：项目签约成功后，同步关联客户为 `contracted`。

## 文档索引

- [客户状态机对接](./2026-05-21-customer-status-machine-integration.md)
- [项目状态机对接](./2026-05-21-project-status-machine-integration.md)
- [客户项目状态联动对接](./2026-05-21-customer-project-status-linkage.md)
- [状态动作和时间线对接](./2026-05-21-status-actions-and-transition-timeline.md)

## 当前 Admin 代码影响点

### 客户

当前文件：

- `apps/admin/components/customers/customer-mutations.tsx`

现状：

- 客户新增 / 编辑表单包含 `status` 字段。
- 保存客户时，`PATCH /customers/:id` payload 会携带 `status`。
- 客户详情页只展示基础信息、来源时间线、跟进记录、房产列表，没有状态动作区域。
- 作废客户当前调用 `DELETE /customers/:id`，后端已保留兼容并内部走 `mark_invalid`。

目标：

- 新增客户时可以保留初始状态，默认 `potential`。
- 编辑客户基础信息时不再提交 `status`。
- 客户详情页新增状态区域，展示当前状态和动作按钮。
- 状态变更统一调用 `POST /customers/:id/status-transition`。

### 项目

当前文件：

- `apps/admin/components/projects/project-mutations.tsx`

现状：

- 项目新增 / 编辑表单包含 `status` 字段。
- 保存项目时，`POST /projects` / `PATCH /projects/:id` payload 会携带 `status`。
- 项目编辑表单包含 `signed_amount`，但签约动作没有独立弹窗。
- 项目详情页只展示概览、成员、施工日志、工序验收，没有状态动作区域。
- 作废项目当前调用 `DELETE /projects/:id`，后端已保留兼容。

目标：

- 新增项目时可以保留初始状态，默认 `lead`。
- 编辑项目基础信息时不再提交 `status`。
- 项目详情页新增状态区域，展示当前状态和动作按钮。
- 项目签约动作弹窗要求填写 `signed_amount > 0`。
- 状态变更统一调用 `POST /projects/:id/status-transition`。

## 推荐接入顺序

1. 客户 / 项目编辑表单先停止在编辑模式下提交 `status`。
2. 详情页增加状态展示区，调用 `GET /status-actions` 渲染可执行动作。
3. 接入 `POST /customers/:id/status-transition` 和 `POST /projects/:id/status-transition`。
4. 项目签约弹窗补 `signed_amount`，并展示关联客户状态前置校验。
5. 根据项目状态禁用施工日志、摄像头、验收等写入口。
6. 接入 `GET /status-transitions`，在客户 / 项目详情展示状态时间线。

## 接口可用性

已可用：

- `POST /customers/:id/status-transition`
- `POST /projects/:id/status-transition`
- `GET /customers/:id/status-actions`
- `GET /projects/:id/status-actions`
- `GET /customers/:id/status-transitions?page=1&pageSize=20`
- `GET /projects/:id/status-transitions?page=1&pageSize=20`
- 旧 `PATCH /customers/:id` / `PATCH /projects/:id` 传 `status` 时仍会进入状态机校验。

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

- 普通编辑表单负责基础资料，不负责状态流转。
- 状态动作放在详情页显式触发。
- `requires_reason=true` 的动作必须弹窗填写原因。
- 危险动作使用二次确认，包括作废、暂停。
- 成功后刷新当前详情、列表和首页统计相关数据。
- 前端可以提前禁用明显非法动作，但后端 400 仍是最终准入。

## 验收口径

- 编辑客户保存基础信息时，网络请求不再包含 `status`。
- 编辑项目保存基础信息时，网络请求不再包含 `status`。
- 客户状态动作成功后，客户详情和客户列表状态同步刷新。
- 项目状态动作成功后，项目详情和项目列表状态同步刷新。
- 项目签约时未填写有效 `signed_amount`，前端阻止提交；后端仍返回 400。
- 项目签约成功且有关联客户时，关联客户状态变为 `contracted`。
- `invalid / on_hold / completed` 项目不能新增施工日志。
- `invalid / completed` 项目不能新增摄像头。
- 只有 `constructing / acceptance` 项目能发起验收。
