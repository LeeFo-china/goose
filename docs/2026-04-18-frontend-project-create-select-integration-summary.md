# 项目创建页选择器前端对接摘要

> 2026-05-06 更新：岗位编码已扩展为完整 `EmployeePostCode` 体系，项目员工候选人的最新岗位范围以 [小程序岗位编码对接说明](./2026-05-03-miniprogram-post-code-integration-summary.md) 为准。本文档保留接口路径、字段结构说明，旧的岗位编码筛选口径不再作为最新依据。

本文档只基于当前后端实际实现，用于前端直接对照修改项目创建页里的“客户 / 设计师 / 项目监理”选择弹层，尽量一次联调通过。

请以前端旧需求稿 [2026-04-18-project-create-select-api-summary.md](./2026-04-18-project-create-select-api-summary.md) 为历史参考，不要再按其中的 `/customers`、`/employees` 路径联调。

---

## 1. 当前可用接口

### 关联客户选择

```http
GET /projects/create/customers?page=1&pageSize=10
GET /projects/create/customers?page=1&pageSize=10&keyword=张三
GET /projects/create/customers?page=1&pageSize=10&keyword=138
```

### 设计师 / 项目监理选择

```http
GET /projects/create/employees?page=1&pageSize=10&scene=project_designer
GET /projects/create/employees?page=1&pageSize=10&scene=project_supervisor
GET /projects/create/employees?page=1&pageSize=10&scene=project_designer&keyword=李
GET /projects/create/employees?page=1&pageSize=10&scene=project_supervisor&keyword=139
```

---

## 2. 前端必须修改的点

### 路径改动

- 客户弹层不要再请求 `/customers`
- 员工弹层不要再请求 `/employees`
- 必须改成：
  - `/projects/create/customers`
  - `/projects/create/employees`

### 参数改动

- 员工接口里的 `scene` 当前是必填
- `scene` 只支持：
  - `project_designer`
  - `project_supervisor`
- `keyword` 支持姓名 / 手机号模糊搜索
- `page`、`pageSize` 正常透传即可

### 字段映射改动

员工接口当前返回的不是 `role`，而是：

- `role_label`
- `department`
- `department_name`

前端如果之前按下面口径消费：

```ts
item.role
item.department?.name
```

请改成：

```ts
item.role_label
item.department?.name ?? item.department_name
```

---

## 3. 查询参数说明

### `/projects/create/customers`

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `page` | `number` | 否 | 页码，从 `1` 开始 |
| `pageSize` | `number` | 否 | 每页条数，最大 `100` |
| `keyword` | `string` | 否 | 按 `name / phone` 模糊搜索 |

### `/projects/create/employees`

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `page` | `number` | 否 | 页码，从 `1` 开始 |
| `pageSize` | `number` | 否 | 每页条数，最大 `100` |
| `keyword` | `string` | 否 | 按 `name / phone` 模糊搜索 |
| `scene` | `string` | 是 | 员工筛选场景 |

### `scene` 可选值

```text
project_designer
project_supervisor
```

---

## 4. 当前筛选口径

### 客户接口

- 返回字段只包含 `id`、`name`、`phone`
- 支持 `name` / `phone` 模糊搜索
- 按 `created_at desc` 排序

### 员工接口

- 只返回 `status = active` 的员工
- 支持 `name` / `phone` 模糊搜索
- 按 `created_at desc` 排序
- `scene=project_designer` 时按岗位编码筛选：`INTERIOR_DESIGNER`、`DESIGN_DIRECTOR`
- `scene=project_supervisor` 时按岗位编码筛选：`PROJECT_MANAGER`、`CONSTRUCTION_SUPER`

### 一个需要前端知道的现状

当前后端是按岗位筛选，不是按部门筛选。

所以前端不要假设：

- `project_designer` 返回“设计部”员工
- `project_supervisor` 返回“工程部 / 项目部”员工

应以前端真正需要的岗位候选人为准。

---

## 5. 返回结构

两个接口都返回统一结构：

```json
{
  "data": {
    "list": [],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 0,
      "totalPages": 0
    }
  },
  "message": "success"
}
```

---

## 6. 客户接口返回示例

```json
{
  "data": {
    "list": [
      {
        "id": "9cbf8708-df88-47c2-8f24-57b67308c2d1",
        "name": "张三",
        "phone": "13800000000"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "success"
}
```

### 客户类型建议

```ts
type ProjectCreateCustomerOption = {
  id: string;
  name: string | null;
  phone: string | null;
};
```

---

## 7. 员工接口返回示例

```json
{
  "data": {
    "list": [
      {
        "id": "d2f7a3d0-d8de-4b41-9d11-3f3791b8e111",
        "name": "李四",
        "phone": "13900000000",
        "role_label": "设计师",
        "post": {
          "id": "7de4cb07-2fd0-4f80-9f2e-cb1a26cb31c4",
          "name": "设计师",
          "code": "INTERIOR_DESIGNER"
        },
        "post_code": "INTERIOR_DESIGNER",
        "post_name": "设计师",
        "department": {
          "id": "0b8dc4c4-6fd1-4ad4-8ea9-f63dbd4977c2",
          "name": "设计部"
        },
        "department_name": "设计部"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "success"
}
```

### 员工类型建议

```ts
type ProjectCreateEmployeeOption = {
  id: string;
  name: string | null;
  phone: string | null;
  role_label: string | null;
  post: {
    id: string;
    name: string | null;
    code: string | null;
  } | null;
  post_code: string | null;
  post_name: string | null;
  department: {
    id: string;
    name: string;
  } | null;
  department_name: string | null;
};
```

---

## 8. 前端展示建议

当前后端字段下，员工选择项建议展示优先级：

1. `name`
2. `post?.name ?? post_name ?? role_label`
3. `department?.name ?? department_name`
4. `phone`

客户选择项建议展示：

1. `name`
2. `phone`

---

## 9. 前端调用示例

### 客户弹层

```ts
const res = await request.get("/projects/create/customers", {
  page: 1,
  pageSize: 10,
  keyword: searchValue || undefined,
});

const list = res.data.list;
const pagination = res.data.pagination;
```

### 设计师弹层

```ts
const res = await request.get("/projects/create/employees", {
  page: 1,
  pageSize: 10,
  keyword: searchValue || undefined,
  scene: "project_designer",
});

const list = res.data.list;
```

### 项目监理弹层

```ts
const res = await request.get("/projects/create/employees", {
  page: 1,
  pageSize: 10,
  keyword: searchValue || undefined,
  scene: "project_supervisor",
});

const list = res.data.list;
```

---

## 10. 联调前自检清单

前端在提测前请确认：

- 客户接口已经改为 `/projects/create/customers`
- 员工接口已经改为 `/projects/create/employees`
- 员工请求一定传 `scene`
- 搜索参数名使用 `keyword`
- 列表追加时读取 `data.list`
- 分页信息读取 `data.pagination`
- 员工展示字段读取 `role_label`
- 部门展示字段优先取 `department?.name`，兜底 `department_name`
- 不再依赖 `/customers`、`/employees` 返回项目创建页的候选数据

---

## 11. 一句话结论

项目创建页这次联调，前端只要改成调用：

```http
GET /projects/create/customers
GET /projects/create/employees
```

并把员工字段从 `role` 改为 `role_label`，同时保证 `scene` 必传，基本就能按当前后端一次对通。
