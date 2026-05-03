# 小程序岗位编码对接说明

本文档给小程序前端对接“岗位编码”相关字段使用。

本次调整后，岗位编码不再是固定枚举。岗位编码由后台“组织架构 / 岗位”页面维护，保存在 `posts.code` 字段。

---

## 1. 前端结论

小程序不要把岗位编码写死成固定枚举。

以前可以假设：

```ts
type PostCode =
  | "INTERIOR_DESIGNER"
  | "PROJECT_MANAGER"
  | "CONSTRUCTION_SUPER";
```

现在应改成：

```ts
type PostCode = string | null;
```

岗位编码只是一个业务标识，可能出现后台新增的自定义值，例如：

```text
CUSTOMER_SERVICE
AFTER_SALE_MANAGER
DELIVERY_COORDINATOR
```

---

## 2. 编码格式

后台保存岗位编码时会校验格式：

```text
^[A-Z][A-Z0-9_]{1,63}$
```

含义：

- 必须以大写字母开头
- 只能包含大写字母、数字、下划线
- 长度 2 到 64 个字符
- 可以为空，表示该岗位不设置编码

---

## 3. 小程序展示规则

涉及员工信息时，优先展示岗位名称，不要直接展示岗位编码。

推荐展示优先级：

```ts
const postLabel =
  item.post?.name ??
  item.post_name ??
  item.role_label ??
  item.post_code ??
  "未分配岗位";
```

如果确实需要展示编码，按普通字符串展示即可，不要做枚举映射失败兜底。

---

## 4. 项目创建员工选择接口

项目创建页选择设计师 / 项目监理仍然使用：

```http
GET /projects/create/employees?page=1&pageSize=10&scene=project_designer
GET /projects/create/employees?page=1&pageSize=10&scene=project_supervisor
```

返回里的岗位字段仍然是：

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

注意：`post.code` / `post_code` 现在是动态字符串，不再保证属于 `@gooes/domain` 的 `POST_CODE_VALUES`。

---

## 5. 业务筛选口径

当前项目创建页的 `scene` 仍由后端控制筛选范围：

- `project_designer`
- `project_supervisor`

小程序只需要继续传 `scene`，不要在前端根据岗位编码自行过滤员工。

原因：后台以后可以新增岗位编码，但某个业务场景应该匹配哪些岗位，应该由后端统一维护，避免小程序发版才能生效。

---

## 6. 兼容建议

前端如果有基于岗位编码的 UI 判断：

```ts
if (post_code === "INTERIOR_DESIGNER") {
  // ...
}
```

需要评估是否必须保留。

推荐改成：

- 展示逻辑：使用 `post_name` / `post.name`
- 权限逻辑：使用后端返回的权限，不用岗位编码判断
- 场景筛选：使用后端接口参数 `scene`

---

## 7. 一句话版本

`post_code` 从“固定枚举”调整为“后台可维护的动态业务编码”。小程序可以展示它，但不要依赖它做固定枚举判断；员工选择、权限和场景筛选继续交给后端接口处理。
