# 项目成员直接添加员工对接方案

日期：2026-05-19

## 背景

组织架构里的“项目角色 / 项目规则”模型对租户来说理解成本偏高。更符合业务心智的方式是：项目成员直接添加员工，员工本身已经有部门、岗位、手机号、头像等基础信息，不需要先维护一套独立的项目角色规则。

因此后续目标是分阶段下线项目角色模型，最终删除 `project_member_role_post_rules` 相关模型、接口和页面入口。

## 当前阶段

当前已完成阶段 1 的 UI 收口，并进入阶段 2 的后端兼容：

- Admin 租户组织架构页移除“项目规则”入口。
- 部门展开后的岗位 item 不再提供“项目角色”绑定入口。
- 部门仍支持启用、停用、岗位配置、岗位别名。
- `POST /projects/:id/members` 已支持只传 `employee_id`。
- `GET /projects/:id/member-candidates` 不再按项目角色过滤员工候选，即使旧端传 `role_code` 也按员工列表返回。
- `GET /projects/create/employees` 保留 `scene` 参数兼容旧端，但不再按项目角色 / 岗位规则过滤员工候选。
- 后端已下线 `/project-member-role-post-rules` 配置接口；`projects/member-roles` 和项目成员角色字段暂时保留，避免影响现有项目成员、验收、施工负责人等兼容链路。
- 小程序端本阶段可以开始按“直接选员工”改造，但不要新增项目角色配置入口。

## 小程序对接口径

### 今天小程序端需要对接的开发项

本次小程序端只做“项目成员直接选择员工”的交互改造，不做项目角色配置，不新增项目规则入口。

#### 1. 项目成员列表展示改造

涉及页面：

- 项目详情页里的项目成员模块
- 项目成员列表 / 成员管理页
- 新增、编辑、删除成员后需要刷新的成员展示区域

需要调整：

- 成员主标题展示员工姓名：优先取 `employee.name`，兜底取 `employee_name`，再兜底取 `role_name`。
- 成员副标题展示真实员工信息：部门、岗位、手机号。
- `role_name` / `role_code` 只作为历史兼容字段，不再作为成员身份的主要展示。
- 如果返回 `is_virtual: true`，说明该成员是后端从客户负责人等关系派生出来的虚拟成员，只展示，不提供编辑和删除。
- 如果员工头像字段存在，继续展示头像；没有头像时展示姓名首字或默认头像。

列表字段口径：

```ts
type ProjectMember = {
  id: string;
  project_id: string;
  employee_id: string;
  employee_name?: string | null;
  role_code?: string;
  role_name?: string | null;
  is_primary?: boolean;
  is_virtual?: boolean;
  employee?: {
    id: string;
    name: string | null;
    avatar: string | null;
    phone: string | null;
    department_name: string | null;
    post_name: string | null;
  } | null;
};
```

展示建议：

- 第一行：`employee.name || employee_name || role_name || "项目成员"`
- 第二行：`department_name`、`post_name`、`phone` 按存在情况拼接
- 标签：仅保留“主责”或“负责人”等业务标签，不新增“设计师 / 监理 / 施工负责人”这种项目角色选择入口

#### 2. 新增成员弹窗 / 页面改造

目标交互：

1. 点击“添加成员”。
2. 打开员工选择器。
3. 搜索员工姓名或手机号。
4. 选择员工。
5. 提交 `employee_id`。
6. 成功后关闭弹窗并刷新成员列表。

需要删除或隐藏：

- 项目角色选择器
- 根据项目角色切换候选员工的逻辑
- 新增成员时必填 `role_code` 的校验
- 依赖 `/projects/member-roles` 初始化新增成员表单的逻辑

提交 payload：

```json
{
  "employee_id": "员工ID",
  "is_primary": false
}
```

不要提交：

```json
{
  "role_code": "construction_manager",
  "role_name": "施工负责人"
}
```

说明：

- 不传 `role_code` 时，后端会写入内部兼容值；小程序端不要感知和展示这个内部值。
- 如果旧代码短期内无法完全删除 `role_code`，可以继续传旧值，但本次新交互不要再让用户选择项目角色。

#### 3. 员工候选选择器改造

新增项目成员时使用：

```http
GET /projects/:id/member-candidates?page=1&pageSize=20&keyword=张
Authorization: Bearer <employee_token>
```

返回数据结构：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": "员工ID",
        "name": "员工姓名",
        "phone": "手机号",
        "avatar": "头像",
        "role_label": "岗位名称",
        "department": {
          "id": "部门ID",
          "name": "部门名称"
        },
        "department_name": "部门名称",
        "post": {
          "id": "岗位ID",
          "name": "岗位名称",
          "code": "岗位编码"
        },
        "post_code": "岗位编码",
        "post_name": "岗位名称"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 0,
      "totalPages": 0
    }
  }
}
```

选择器展示：

- 主标题：`name`
- 副标题：`department_name`、`post_name`、`phone`
- 搜索：把用户输入作为 `keyword` 传给后端
- 分页：沿用 `page` / `pageSize`，滚动加载下一页

不再传：

```http
role_code=designer
role_code=supervisor
role_code=construction_manager
```

即使旧端继续传 `role_code`，后端也不会再按项目角色规则过滤候选员工。

#### 4. 项目创建页员工选择对接

项目创建页仍使用现有接口：

```http
GET /projects/create/employees?scene=project_designer&page=1&pageSize=80
GET /projects/create/employees?scene=project_supervisor&page=1&pageSize=80
Authorization: Bearer <employee_token>
```

本阶段端侧处理：

- `scene` 可以继续保留，避免大改创建页逻辑。
- 候选结果已经改为租户在职员工，不再由项目角色 / 岗位规则决定。
- 创建页 UI 文案可以继续叫“设计师 / 监理”，但不要再引导用户维护项目角色规则。
- 如果后续创建页也要完全去角色化，再单独改为通用“项目成员 / 主责员工”交互。

#### 5. 编辑和删除成员

编辑成员：

```http
PATCH /projects/:id/members/:memberId
Authorization: Bearer <employee_token>
Content-Type: application/json

{
  "employee_id": "新员工ID",
  "is_primary": false
}
```

删除成员：

```http
DELETE /projects/:id/members/:memberId
Authorization: Bearer <employee_token>
```

端侧规则：

- `is_virtual: true` 的成员不允许编辑、删除。
- 修改员工时同样不要要求选择 `role_code`。
- 删除成功后刷新成员列表或本地移除该成员。

#### 6. 错误处理

小程序端需要按后端错误 message 直接提示：

- `401`：登录失效，跳转员工登录 / 重新登录。
- `403`：无项目更新权限，提示“无权限操作项目成员”。
- `400` 且 message 为“该员工已在项目成员中”：提示重复添加。
- `400` 且 message 为“员工不存在或不属于当前租户”：提示员工不可添加。
- `400` 且 message 为“目标员工不是在职状态”：提示员工状态不可添加。
- `400` 且 message 为“跟进员工来自客户归属关系，不能直接修改 / 新增”：隐藏对应虚拟成员的操作入口，避免用户触发。

#### 7. 小程序端本次验收清单

- 项目成员列表能展示员工姓名、部门、岗位、手机号。
- 添加成员入口不再出现项目角色选择。
- 搜索员工能按姓名 / 手机号返回候选。
- 选择员工后只提交 `employee_id`，接口成功。
- 重复添加同一员工时有明确提示。
- 无权限账号点击添加、编辑、删除时提示权限不足。
- 虚拟成员只展示，不出现编辑、删除按钮。
- 旧项目成员仍能展示，不因 `role_code` / `role_name` 弱化而空白。
- 项目创建页的设计师 / 监理选择仍可用，候选员工不依赖项目角色规则。

### 不再依赖项目角色配置

小程序端不要使用以下能力构建新的项目成员交互：

- `/projects/member-roles`
- `/project-member-role-post-rules`
- `project_member_role_post_rules`
- 项目角色与岗位的绑定关系

### 项目成员展示

项目成员列表仍可展示后端返回的现有成员数据，但建议弱化 `role_code` / `role_name`：

- 第一展示字段：员工姓名
- 辅助字段：部门、岗位、手机号
- 兼容字段：如果旧数据只有 `role_name`，可以临时展示，但不要作为新增成员的必填选择

### 新增项目成员

目标交互：

1. 进入项目详情。
2. 点击“添加成员”。
3. 打开员工选择器，支持搜索员工姓名 / 手机号。
4. 选择员工后提交 `employee_id`。
5. 后端负责写入项目成员关系。

接口口径：

```http
POST /projects/:id/members
Content-Type: application/json

{
  "employee_id": "员工ID",
  "is_primary": false
}
```

说明：

- `role_code` 不再是新增项目成员的必填字段。
- 如果旧端仍传 `role_code`，后端继续兼容旧逻辑。
- 如果不传 `role_code`，后端会使用内部兼容值落库，端侧不要展示这个内部值。
- 同一个项目里直接添加员工时，后端会拦截重复员工。

候选员工接口：

```http
GET /projects/:id/member-candidates?page=1&pageSize=20&keyword=张
```

说明：

- `role_code` 参数已不再用于过滤员工。
- 小程序端可以不再传 `role_code`。

项目创建员工候选接口：

```http
GET /projects/create/employees?scene=project_designer&page=1&pageSize=80
GET /projects/create/employees?scene=project_supervisor&page=1&pageSize=80
```

说明：

- `scene` 参数保留，避免旧端请求报错。
- 返回口径已改为租户在职员工列表，不再依赖项目角色岗位规则。

## Admin 对接口径

Admin 后续应在项目详情的成员页增加“添加员工”入口：

- 直接搜索员工并添加到项目。
- 不要求选择项目角色。
- 成员列表展示员工姓名、部门、岗位、手机号、是否主责等真实业务信息。
- 旧的 `role_code` / `role_name` 仅用于历史数据兼容，不作为新的操作入口。

## 后端分阶段计划

### 阶段 1：入口下线

- 租户组织架构页下线“项目规则”tab。
- 岗位 item 下线“项目角色”绑定操作。
- 保留旧接口和旧表，保证现有项目数据不受影响。

验收标准：

- 组织架构页只保留部门相关配置。
- 租户无法再从组织架构进入项目角色规则配置。
- 现有项目详情、项目成员、验收流程不报错。

### 阶段 2：项目成员接口兼容

- 新增或调整项目成员创建接口，支持只传 `employee_id`。
- 后端内部如必须保留旧字段，可写入默认兼容值，但前端不感知项目角色。
- 项目成员候选员工接口不再依赖项目角色规则过滤。

验收标准：

- Admin 可直接选择员工加入项目。
- 小程序可直接选择员工加入项目。
- 不传 `role_code` 时接口成功。
- 旧端继续传 `role_code` 时不受影响。

### 阶段 3：Admin 与小程序完成新交互

- Admin 项目详情成员页上线直接添加员工。
- 小程序项目成员相关页面改为直接选择员工。
- 新增成员链路不再出现项目角色选择。

验收标准：

- 新建项目成员全链路不依赖项目角色。
- 历史项目成员仍可正常展示。

### 阶段 4：数据与依赖清理

排查并替换以下旧依赖：

- `project_members.role_code`
- `project_members.role_name`
- `PROJECT_MEMBER_ROLE_*` 常量
- 项目创建里的设计师 / 监理候选过滤
- 验收、工序、日志里对施工负责人等角色字段的依赖

验收标准：

- 后端、Admin、小程序均不再通过项目角色规则判断成员能力。
- 历史数据迁移脚本完成并可回滚。

### 阶段 5：删除模型

确认无依赖后删除：

- `project_member_role_post_rules` 表
- 项目角色规则相关 repository / service / controller / schema
- Admin 相关旧组件
- domain 里的项目角色规则常量

验收标准：

- 全量类型检查通过。
- 迁移在开发库、预发库、生产库演练通过。
- 项目成员新增、展示、编辑、删除全链路通过验收。

## 注意事项

- 删除模型前必须先完成接口兼容和端侧改造。
- 小程序端不要提前删除历史字段展示兼容，避免旧项目成员显示异常。
- 如果后续需要区分“主责成员”，应在项目成员关系上做 `is_primary` 或类似字段，不要重新引入项目角色模型。
