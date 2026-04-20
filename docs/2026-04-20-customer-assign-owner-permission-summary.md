# 客户负责人分配后端执行方案

日期：2026-04-20

## 一、结论

当前仓库已经完成 `customers` 资源的基础权限接入，并已开始把“把客户分配给指定员工”升级成独立权限。

现状是：

- `customers.owner_id` 已存在，且指向 `employees.id`
- `POST /customers` 已支持写入 `owner_id`
- `PATCH /customers/:id` 已支持更新 `owner_id`
- 但当前更新负责人仍然复用 `customer.update`
- 非 `all` 范围下，后端明确禁止把 `owner_id` 改成其他员工
- `@gooes/domain` 已新增 `customer.assign_owner`
- 已补 migration，为权限表和 `system_admin` 角色写入该权限
- 已补第二条 migration，为 `design_manage` 角色写入：
  - `customer.read = department`
  - `customer.assign_owner = department`
- `PATCH /customers/:id` 在 `owner_id` 实际变化时已改走独立鉴权
- `/auth/me/permissions` 已可返回该权限与 scope

因此，这份文档当前定位为“后端执行方案 + 执行状态记录”。

目标是把“分配客户负责人”升级成独立能力：

- 独立权限码：`customer.assign_owner`
- 独立范围控制：`self | department | all`
- 独立后端强校验
- 明确目标员工合法性校验
- 保持和当前 `customer.update` 解耦

---

## 二、当前现状

### 1. 已有能力

当前后端已经具备这些基础条件：

- 客户表有 `owner_id`
- 客户详情和列表已返回：
  - `owner`
  - `owner_name`
- 跟进记录已返回：
  - `employee`
  - `employee_name`
- `customers` 已接入基础权限：
  - `customer.read`
  - `customer.create`
  - `customer.update`
  - `customer.assign_owner`

### 2. 当前限制

当前这条能力已经完成第一阶段落地，但还不能算“完整闭环”，原因有四个：

1. 角色模板覆盖面仍有限  
   当前只明确落了 `system_admin` 和 `design_manage`

2. 范围策略仍是 v1  
   当前已支持独立鉴权，但 `department`、`self` 的真实业务边界还需要结合角色模板继续细化

3. 审计能力未落  
   当前只完成了权限控制，尚未落客户负责人变更日志

4. 前端联调还未完成  
   需要前端按 `/auth/me/permissions` 的新权限码和 scope 更新按钮显隐与交互

---

## 三、目标能力定义

### 1. 业务定义

客户详情页的“分配员工”指的是：

- 修改 `customers.owner_id`
- 将客户负责人从 A 员工变更为 B 员工

这不是普通资料编辑，而是归属变更。

### 2. 权限定义

新增独立权限码：

- `customer.assign_owner`

不再复用：

- `customer.update`

### 3. 适用接口

本次改造只落在现有接口上，不新增“assign”专用路由。

继续使用：

- `PATCH /customers/:id`

但当请求体中包含 `owner_id` 且该值发生变化时，后端必须按 `customer.assign_owner` 做独立鉴权。

---

## 四、推荐权限模型

### 1. 权限码

新增：

- `customer.assign_owner`

建议 label：

- `分配客户负责人`

建议 module：

- `customer`

### 2. 范围

建议支持：

- `self`
- `department`
- `all`

说明：

- `self`
  - 只能把负责人设为自己
  - 主要用于“领取/回收到自己名下”
- `department`
  - 只能处理本部门可管理客户
  - 目标负责人也必须属于本部门
- `all`
  - 可给任意客户分配任意有效员工

本次不建议给这条权限使用：

- `assigned`

因为客户负责人已经天然是归属关系，继续引入 `assigned` 会让语义重复。

---

## 五、数据库与 Domain 变更

### 1. `@gooes/domain`

需要更新 [packages/domain/src/permission.ts](/Users/leefo/Public/work/gooes/packages/domain/src/permission.ts:1)：

1. 在 `PERMISSION_CODE_VALUES` 中新增：
   - `customer.assign_owner`
2. 在 `PermissionCodeConfig` 中新增：
   - `customer.assign_owner: { label: "分配客户负责人", module: "customer" }`
3. 重新导出并发布新包版本

如果前端依赖 `@gooes/domain`，后续需要升级包版本。

### 2. 权限基础数据

需要新增 migration 或数据补丁，保证以下数据存在：

1. `permissions` 表新增一条：
   - `code = customer.assign_owner`
2. 默认角色模板补权：
   - `system_admin` -> `all`
   - 如业务需要，可给特定主管角色配置 `department`

注意：

- 不建议直接给 `employee_base`
- 否则普通员工都会具备客户转派能力

### 3. 数据表

本次不需要新增业务表字段。

`customers.owner_id` 已满足存储需求。

如果后续要做审计，再单独补：

- `customer_owner_transfer_logs`

本次先不作为第一阶段必需项。

---

## 六、后端改造范围

### 1. authorization / permission aggregation

需要保证：

- `/auth/me/permissions` 能返回 `customer.assign_owner`
- 能带上正确的 `scope`

目标返回示例：

```json
{
  "data": {
    "employeeId": "emp_xxx",
    "permissions": [
      {
        "code": "customer.assign_owner",
        "scope": "department"
      }
    ]
  }
}
```

### 2. access policy

需要在 [services/access-policy.ts](/Users/leefo/Public/work/gooes/services/access-policy.ts:1) 增加或补强这类能力：

1. `canAssignCustomerOwner(authContext, customer, targetEmployee)`
2. 目标员工范围判断
3. 当前客户范围判断

推荐规则：

#### scope = `self`

- 当前客户必须在自己可访问范围内
- `targetEmployee.id` 必须等于 `authContext.employeeId`

#### scope = `department`

- 当前操作人必须有 `departmentId`
- 当前客户必须属于当前可管理范围
- `targetEmployee.department_id` 必须等于当前操作人部门
- `targetEmployee.status` 必须为 `active`

#### scope = `all`

- 只校验目标员工存在且状态有效

### 3. customer controller

需要改造 [controllers/customer/index.ts](/Users/leefo/Public/work/gooes/controllers/customer/index.ts:1) 的 `update`：

当前逻辑是：

- 先按 `customer.update` 判断是否可编辑客户
- 非 `all` 范围下，不允许把 `owner_id` 改给其他员工

需要改成：

1. 先保留 `customer.update` 对普通资料编辑的判断
2. 当请求体不包含 `owner_id` 时，维持现状
3. 当请求体包含 `owner_id` 且与原值不同：
   - 额外要求 `customer.assign_owner`
   - 加载目标员工
   - 调用 `accessPolicyService.canAssignCustomerOwner(...)`
4. 校验通过后再执行更新

### 4. repository / service 分层

按当前仓库规范，这次不建议把更多 Supabase 查询继续堆进 controller。

建议至少补出这两层：

- `repositories/customers.ts`
  - `findById`
  - `updateById`
- `repositories/employees.ts`
  - `findById`
- `services/customers.ts`
  - `updateCustomer`
  - `assignOwner`

建议拆分：

1. controller
   - 解析请求
   - 校验 schema
   - 交给 service
2. service
   - 判断这次是不是“普通更新”还是“负责人变更”
   - 编排权限和范围校验
3. repository
   - 查客户
   - 查目标员工
   - 执行更新

这一步不是绝对阻塞，但如果继续把权限编排逻辑直接放在 controller，后续维护成本会很高。

---

## 七、接口行为设计

### 1. `PATCH /customers/:id`

请求示例：

```json
{
  "owner_id": "target_employee_id"
}
```

处理规则：

1. 如果 `owner_id` 未传：
   - 按现有 `customer.update` 处理
2. 如果 `owner_id` 与原值相同：
   - 允许通过，不额外要求 `customer.assign_owner`
3. 如果 `owner_id` 与原值不同：
   - 必须校验 `customer.assign_owner`
   - 必须校验目标员工存在
   - 必须校验目标员工状态有效
   - 必须校验目标员工符合 scope

### 2. 目标员工合法性校验

至少需要校验：

1. 员工存在
2. 员工状态为 `active`
3. `department` 范围下目标员工必须属于当前部门

建议错误语义：

- 不存在或不可用：
  - `400`
  - `目标负责人不存在或不可用`

### 3. 返回结构

更新成功后，响应结构继续返回：

- `owner`
- `owner_name`

这样前端更新负责人后可以直接刷新页面，不需要额外请求员工详情。

---

## 八、执行步骤

### 阶段 1：Domain 与权限基础数据

1. 更新 `@gooes/domain`
2. 新增 `customer.assign_owner`
3. 补 `PermissionCodeConfig`
4. 发布新包版本
5. 新增 migration / seed，写入 `permissions`
6. 给 `system_admin` 和需要的主管角色补 `role_permissions`

### 阶段 2：后端权限聚合

1. 更新权限聚合逻辑
2. 让 `/auth/me/permissions` 返回 `customer.assign_owner`
3. 确认 `employeeId` 和 `scope` 正确返回

### 阶段 3：后端访问策略

1. 在 `access-policy` 增加负责人分配策略
2. 明确 `self / department / all` 的判断规则
3. 增加目标员工合法性校验

### 阶段 4：客户更新逻辑

1. 把“普通资料编辑”和“负责人变更”拆开
2. `owner_id` 发生变化时改走 `customer.assign_owner`
3. 保持成功响应继续返回 `owner` / `owner_name`

### 阶段 5：真实验证

至少验证这几组场景：

1. `system_admin`
   - 可把任意客户分配给任意有效员工
2. `department` 范围主管
   - 可把本部门客户分配给本部门员工
   - 不可分配给外部门员工
3. `self`
   - 只能把负责人改成自己
4. 普通仅有 `customer.update` 用户
   - 可改客户资料
   - 不可改负责人

---

## 九、验收标准

满足以下条件才算本次方案完成：

1. `@gooes/domain` 已存在 `customer.assign_owner`
2. `permissions` 基础数据已存在 `customer.assign_owner`
3. `/auth/me/permissions` 能返回该权限及 scope
4. `PATCH /customers/:id` 对 `owner_id` 变更已独立校验 `customer.assign_owner`
5. `department` 范围下不能跨部门分配负责人
6. 仅有 `customer.update` 的用户不能变更负责人
7. 更新成功后响应里仍返回 `owner` / `owner_name`
8. 真实接口验证通过

---

## 十、非本次范围

以下内容不作为这次第一阶段必做项：

1. 独立新增 `POST /customers/:id/assign-owner`
2. 客户负责人变更审计日志表
3. 客户负责人变更消息通知
4. 前端按钮显隐和页面交互细节

这些可以在本次能力稳定后再做第二阶段。

---

## 十一、最终建议

建议按“权限独立化”落地，不要继续把负责人分配混在 `customer.update` 里。

最稳的落地顺序是：

1. 先补 `customer.assign_owner`
2. 再补 `/auth/me/permissions`
3. 再补 `PATCH /customers/:id` 的独立校验
4. 最后做真实接口验证和前端联调

这样不会破坏当前已上线的客户读写逻辑，也能把“客户归属变更”从普通编辑中剥离出来。

---

## 十二、当前验证结果

本轮已完成真实验证，覆盖以下场景：

1. `/auth/me/permissions` 返回：
   - `customer.read = department`
   - `customer.assign_owner = department`
2. `design_manage` 可查看本部门客户详情
3. `design_manage` 可把客户负责人改给同部门有效员工
4. `design_manage` 不可把客户负责人改给外部门员工
5. `customer.assign_owner` 不会隐式放开 `customer.update`

验证脚本：

- [verify-customer-assign-owner.ts](/Users/leefo/Public/work/gooes/tmp/verify-customer-assign-owner.ts:1)

说明：

- 仓库里的 migration 文件已补齐
- 由于 Supabase CLI 当前临时登录态存在 pooler 认证抖动，本次第二阶段角色补权是通过远端 admin client 直接落库完成的
- 后续 CLI 恢复后，仍建议再补一次正式 `supabase db push`，让远端 migration 记录与仓库完全一致
