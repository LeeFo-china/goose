# 小程序岗位编码对接说明

本文档给微信小程序前端对接 `posts.code` / `post_code` 使用。当前后端已将岗位编码语义明确为 `EmployeePostCode`：员工岗位的业务编码，用于项目成员候选人筛选，也可用于前端展示兜底。

---

## 1. 前端结论

小程序需要关注这次变化，但大多数页面不需要改业务流程：

- 如果只展示后端返回的员工候选列表：基本无感。
- 如果前端本地写死了 `post_code` 判断：需要改掉或补全岗位编码。
- 如果前端类型把 `post_code` 写成旧的 8 个枚举：需要更新。

现在岗位编码不再允许为空。建议类型：

```ts
type EmployeePostCode = string;

type ProjectCreateEmployeeOption = {
  id: string;
  name: string | null;
  phone: string | null;
  avatar?: string | null;
  role_label: string | null;
  post: {
    id: string;
    name: string | null;
    code: EmployeePostCode;
  } | null;
  post_code: EmployeePostCode | null;
  post_name: string | null;
  department: {
    id: string;
    name: string;
  } | null;
  department_name: string | null;
};
```

说明：接口兼容历史员工没有岗位的情况，所以 `post` / `post_code` 仍可能为 `null`；但只要岗位记录存在，`posts.code` 已是必填。

---

## 2. 岗位编码格式

后端校验规则：

```text
^[A-Z][A-Z0-9_]{1,63}$
```

含义：

- 必须以大写字母开头
- 只能包含大写字母、数字、下划线
- 长度 2 到 64 个字符
- 新增/编辑岗位时不能为空

---

## 3. 完整岗位编码

当前标准岗位编码如下：

```ts
type EmployeePostCode =
  | "GENERAL_MANAGER"
  | "OPERATIONS_DIRECTOR"
  | "GENERAL_MANAGER_ASSISTANT"
  | "HR_ADMIN_MANAGER"
  | "HR_SPECIALIST"
  | "ADMIN_SPECIALIST"
  | "MARKETING_DIRECTOR"
  | "MARKETING_MANAGER"
  | "NEW_MEDIA_OPERATOR"
  | "VIDEO_EDITOR"
  | "LIVE_STREAM_OPERATOR"
  | "AD_OPERATOR"
  | "CUSTOMER_INVITER"
  | "SALES_MANAGER"
  | "SALES_CONSULTANT"
  | "TELESALES"
  | "CHANNEL_MANAGER"
  | "DESIGN_DIRECTOR"
  | "CHIEF_DESIGNER"
  | "INTERIOR_DESIGNER"
  | "ASSISTANT_DESIGNER"
  | "RENDERING_DESIGNER"
  | "ENGINEERING_DIRECTOR"
  | "PROJECT_MANAGER"
  | "CONSTRUCTION_SUPER"
  | "QUALITY_INSPECTOR"
  | "SAFETY_OFFICER"
  | "HYDROPOWER_FOREMAN"
  | "TILE_FOREMAN"
  | "CARPENTRY_FOREMAN"
  | "PAINT_FOREMAN"
  | "MAINTENANCE_WORKER"
  | "PROCUREMENT_MANAGER"
  | "PROCURE_OFFICER"
  | "MATERIAL_CLERK"
  | "WAREHOUSE_KEEPER"
  | "DELIVERY_COORDINATOR"
  | "FINANCE_MANAGER"
  | "FINANCE_ACCOUNTANT"
  | "CASHIER"
  | "COST_ACCOUNTANT"
  | "CUSTOMER_SERVICE_MANAGER"
  | "CUSTOMER_SERVICE"
  | "AFTER_SALES_SPECIALIST"
  | "CUSTOMER_RETURN_VISITOR"
  | "SYSTEM_ADMIN"
  | "DATA_SPECIALIST"
  | "IT_SUPPORT";
```

后端仍允许后台按格式创建自定义岗位编码。因此小程序不要把上面的类型当成绝对封闭枚举；更稳妥的类型是：

```ts
type EmployeePostCode = string;
```

---

## 4. 展示规则

前端展示员工岗位时，优先展示中文岗位名，不要直接展示编码：

```ts
const postLabel =
  item.post?.name ??
  item.post_name ??
  item.role_label ??
  item.post_code ??
  "未分配岗位";
```

不要依赖 `post_code` 做权限判断。权限应以后端返回的权限数据为准。

---

## 5. 项目创建员工选择

项目创建页继续使用：

```http
GET /projects/create/employees?page=1&pageSize=10&scene=project_designer
GET /projects/create/employees?page=1&pageSize=10&scene=project_supervisor
GET /projects/create/employees?page=1&pageSize=10&scene=project_construction_manager
```

`scene` 由后端负责筛选岗位，小程序不要再二次按岗位编码过滤员工。

当前后端筛选范围：

| scene | 岗位编码 |
|---|---|
| `project_designer` | `DESIGN_DIRECTOR`, `CHIEF_DESIGNER`, `INTERIOR_DESIGNER` |
| `project_construction_manager` | `ENGINEERING_DIRECTOR`, `PROJECT_MANAGER`, `CONSTRUCTION_SUPER` |
| `project_supervisor` | `ENGINEERING_DIRECTOR`, `PROJECT_MANAGER`, `CONSTRUCTION_SUPER`, `QUALITY_INSPECTOR` |

---

## 6. 项目成员候选人

项目详情里添加成员继续使用后端接口，不要前端自行过滤：

```http
GET /projects/:id/member-candidates?page=1&pageSize=10&role_code=designer
```

当前后端角色映射：

| role_code | 岗位编码 |
|---|---|
| `customer_owner` | `MARKETING_DIRECTOR`, `SALES_MANAGER`, `SALES_CONSULTANT`, `TELESALES`, `CHANNEL_MANAGER` |
| `sales_followup` | `SALES_CONSULTANT`, `TELESALES`, `CHANNEL_MANAGER`, `CUSTOMER_INVITER` |
| `designer` | `DESIGN_DIRECTOR`, `CHIEF_DESIGNER`, `INTERIOR_DESIGNER` |
| `supervisor` | `ENGINEERING_DIRECTOR`, `PROJECT_MANAGER`, `CONSTRUCTION_SUPER`, `QUALITY_INSPECTOR` |
| `construction_manager` | `ENGINEERING_DIRECTOR`, `PROJECT_MANAGER`, `CONSTRUCTION_SUPER` |
| `site_manager` | `PROJECT_MANAGER`, `CONSTRUCTION_SUPER`, `HYDROPOWER_FOREMAN`, `TILE_FOREMAN`, `CARPENTRY_FOREMAN`, `PAINT_FOREMAN` |
| `budget_manager` | `FINANCE_MANAGER`, `FINANCE_ACCOUNTANT`, `COST_ACCOUNTANT` |
| `material_manager` | `PROCUREMENT_MANAGER`, `PROCURE_OFFICER`, `MATERIAL_CLERK`, `WAREHOUSE_KEEPER` |

---

## 7. 兼容注意

需要小程序检查这些代码：

```ts
if (post_code === "INTERIOR_DESIGNER") {}
```

推荐调整：

- 展示：用 `post_name` / `post.name`
- 权限：用后端权限接口
- 选择候选人：用后端 `scene` / `role_code`
- 特殊 UI：如果确实要按岗位编码展示，可以保留字符串判断，但要覆盖完整岗位编码，并做好未知编码兜底

一句话：`post_code` 现在是可配置但必填的员工岗位业务编码。小程序可以展示它，但不要把候选人筛选和权限判断写死在前端。
