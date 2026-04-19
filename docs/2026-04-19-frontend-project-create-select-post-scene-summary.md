# 项目创建页员工选择器前端修改摘要

本文档给前端直接对照修改项目创建页里的“设计师 / 项目监理”选择弹层。

当前后端已经改为按 **岗位** 筛选，不再按部门筛选。

---

## 1. 接口不要再按旧口径调用

不要再请求：

- `/employees`

项目创建页员工选择器请统一请求：

```http
GET /projects/create/employees
```

---

## 2. 请求参数怎么传

### 设计师弹层

```http
GET /projects/create/employees?page=1&pageSize=10&scene=project_designer
GET /projects/create/employees?page=1&pageSize=10&scene=project_designer&keyword=李
```

### 项目监理弹层

```http
GET /projects/create/employees?page=1&pageSize=10&scene=project_supervisor
GET /projects/create/employees?page=1&pageSize=10&scene=project_supervisor&keyword=王
```

### 参数说明

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `page` | `number` | 否 | 页码，从 `1` 开始 |
| `pageSize` | `number` | 否 | 每页条数，最大 `100` |
| `keyword` | `string` | 否 | 按姓名 / 手机号模糊搜索 |
| `scene` | `string` | 是 | 员工筛选场景 |

### `scene` 允许值

```text
project_designer
project_supervisor
```

前端建议直接从 `@gooes/domain` 引用，不要在页面里写死字符串。

```ts
import type { ProjectCreateEmployeeScene } from "@gooes/domain";
import { PROJECT_CREATE_EMPLOYEE_SCENE_VALUES } from "@gooes/domain";
```

---

## 3. 后端现在按什么逻辑筛人

### `scene=project_designer`

后端按岗位编码筛：

- `INTERIOR_DESIGNER`
- `DESIGN_DIRECTOR`

### `scene=project_supervisor`

后端按岗位编码筛：

- `PROJECT_MANAGER`
- `CONSTRUCTION_SUPER`

所以前端不要再按“设计部 / 工程部 / 项目部”理解这个接口。

---

## 4. 前端最需要改的字段映射

如果你之前是按这种方式读数据：

```ts
item.role
item.department?.name
```

请改成：

```ts
item.post?.name ?? item.post_name ?? item.role_label
item.department?.name ?? item.department_name
```

### 原因

当前接口返回了岗位对象：

- `post`
- `post_code`
- `post_name`

同时保留了兼容字段：

- `role_label`

推荐前端展示优先级：

1. `name`
2. `post?.name ?? post_name ?? role_label`
3. `department?.name ?? department_name`
4. `phone`

---

## 5. 返回结构怎么取

接口统一返回：

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

前端读取方式：

```ts
const list = res.data.list;
const pagination = res.data.pagination;
```

---

## 6. 员工项类型建议

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

## 7. 前端调用示例

### 设计师

```ts
const res = await request.get("/projects/create/employees", {
  page: 1,
  pageSize: 10,
  keyword: searchValue || undefined,
  scene: "project_designer",
});

const list = res.data.list;
```

### 项目监理

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

## 8. 改动清单

前端提测前请确认：

- 员工选择器接口改成 `/projects/create/employees`
- 每次请求都传 `scene`
- `scene` 只传 `project_designer` 或 `project_supervisor`
- 搜索参数名使用 `keyword`
- 列表从 `data.list` 取
- 分页从 `data.pagination` 取
- 岗位展示优先读 `post?.name ?? post_name ?? role_label`
- 部门展示读 `department?.name ?? department_name`
- 不再按部门口径理解 `scene`

---

## 9. 一句话版本

前端这次只要把员工选择器改成调用 `/projects/create/employees`，并且传 `scene`，展示字段改读 `post` / `post_name` / `role_label`，就能和当前后端对上。
