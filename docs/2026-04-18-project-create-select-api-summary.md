# 项目创建页选择器接口总摘要

本文档用于和后端一次性确认：项目创建页里“客户 / 设计师 / 项目监理”选择弹层所需的接口能力。

对应前端页面：

- `src/packageProjects/pages/index/index.tsx`

当前前端已经完成：

- 选择弹层远程拉取数据
- 关键词搜索
- 分页加载
- 当前已选摘要展示
- 清空当前选择
- 设计师 / 项目监理按 `scene` 传参请求员工列表

所以后端只需要确认并实现列表查询能力，不需要前端再改交互。

---

## 1. 当前业务场景

项目创建页里有 3 个选择项：

- 关联客户
- 设计师
- 项目监理

当前前端行为：

1. 打开弹层时请求第一页
2. 输入姓名或手机号关键词时，重新请求第一页
3. 弹层滚动到底部时，继续请求下一页
4. 前端不做本地过滤，只使用后端返回结果

---

## 2. 需要后端支持的接口

### 客户列表

```http
GET /customers?page=1&pageSize=10&keyword=张三
GET /customers?page=1&pageSize=10&keyword=138
```

### 员工列表

```http
GET /employees?page=1&pageSize=10&keyword=李&scene=project_designer
GET /employees?page=1&pageSize=10&keyword=139&scene=project_supervisor
```

---

## 3. 查询参数约定

| 参数       | 类型     | 必填 | 说明                           |
| :--------- | :------- | :--- | :----------------------------- |
| `page`     | `number` | 否   | 页码，默认 `1`                 |
| `pageSize` | `number` | 否   | 每页条数，默认 `10`            |
| `keyword`  | `string` | 否   | 按姓名 / 手机号模糊搜索        |
| `scene`    | `string` | 否   | 仅员工接口使用，按业务场景过滤 |

---

## 4. 搜索规则建议

后端建议支持：

- `name` 模糊匹配
- `phone` 模糊匹配

即：

```sql
name ilike %keyword%
or phone ilike %keyword%
```

如果 `keyword` 为空：

- 直接返回正常分页结果
- 不做搜索过滤

---

## 5. 员工角色过滤建议

当前前端已经按业务场景透传 `scene`，后端只需要按该参数过滤员工候选集，不需要前端再改交互。

### 推荐方案

```http
GET /employees?page=1&pageSize=10&keyword=李&scene=project_designer
GET /employees?page=1&pageSize=10&keyword=王&scene=project_supervisor
```

推荐 `scene` 枚举：

- `project_designer`
- `project_supervisor`

当前前端实际传参规则：

- 设计师选择弹层：`scene=project_designer`
- 项目监理选择弹层：`scene=project_supervisor`

如果你们后端已经有稳定的角色枚举，也可以改成：

```http
GET /employees?page=1&pageSize=10&keyword=李&role=designer
GET /employees?page=1&pageSize=10&keyword=王&role=supervisor
```

但从长期维护看，`scene` 更稳。

---

## 6. 员工接口过滤执行顺序建议

后端建议逻辑：

1. 先按 `scene` 过滤候选员工范围
2. 再在候选范围内按 `keyword` 搜索 `name / phone`
3. 最后做分页

即：

```sql
where employee matches scene
  and (
    keyword is null
    or name ilike %keyword%
    or phone ilike %keyword%
  )
order by created_at desc
limit ...
offset ...
```

---

## 7. 返回结构要求

前端当前兼容多种结构，但推荐统一成标准分页结构：

```json
{
  "data": {
    "list": [
      {
        "id": "xxx",
        "name": "张三",
        "phone": "13800000000"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 23,
      "totalPages": 3
    }
  },
  "message": "success"
}
```

---

## 8. 字段要求

### `/customers`

前端最少依赖字段：

- `id`
- `name`
- `phone`

### `/employees`

前端最少依赖字段：

- `id`
- `name`
- `phone`
- `role`

更推荐返回：

- `department.id`
- `department.name`

因为当前页面展示优先顺序是：

1. `department.name`
2. `role`
3. `phone`

---

## 9. 后端需要确认的口径

请后端确认：

1. `/customers` 是否已支持 `keyword` 搜索 `name / phone`
2. `/employees` 是否已支持 `keyword` 搜索 `name / phone`
3. 两个接口是否都支持 `page / pageSize`
4. 返回结构是否为 `data.list + data.pagination`
5. `/employees` 是否能稳定返回 `department.name`
6. 是否支持 `scene` 过滤
7. “设计师”“项目监理”的筛选口径分别是什么

---

## 10. 推荐结论

当前前端联调目标：

```http
GET /customers?page=1&pageSize=10&keyword=张三
GET /employees?page=1&pageSize=10&keyword=李&scene=project_designer
GET /employees?page=1&pageSize=10&keyword=王&scene=project_supervisor
```

这样前端就可以直接稳定联调，不需要再改页面交互。
