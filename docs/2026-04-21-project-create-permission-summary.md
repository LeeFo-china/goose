# 项目创建权限对接摘要

## 目标

实现项目模块的读写分离：

- 普通员工可以查看项目列表
- 普通员工可以进入项目详情
- 普通员工可以看到每个项目的摘要信息
- 但普通员工**不能创建项目**

也就是说，权限应该拆成：

- `project.read`
- `project.create`

不能只用一个笼统的“项目权限”。

## 当前前端预期

前端会按下面的规则实现：

### 1. 首页快捷操作

- 有 `project.read`：显示 `项目列表`
- 有 `project.create`：显示 `项目录入`

所以普通员工如果只有读权限，会看到：

- `项目列表`

不会看到：

- `项目录入`

### 2. 项目列表页

只要有 `project.read`，员工就可以进入项目列表。

列表里每个 item 可以展示项目摘要信息，例如：

- 项目名称
- 当前状态
- 小区 / 地址摘要
- 客户姓名
- 设计师 / 监理
- 开工时间 / 创建时间

这类信息属于“项目列表摘要展示”，应当归属 `project.read`。

### 3. 项目创建页

只有有 `project.create` 的账号，才允许：

- 看到创建入口
- 进入项目创建页
- 提交 `POST /projects`

没有 `project.create` 时：

- 前端不显示入口
- 即使手输路由进入，也会在页面加载时拦截并返回
- 提交按钮也应禁用

## 后端需要配合的点

### 1. `/auth/me/permissions`

需要准确返回：

- `project.read`
- `project.create`

示例：

```json
{
  "data": {
    "permissions": [
      { "code": "project.read", "scope": "self" },
      { "code": "project.create", "scope": "none" }
    ]
  }
}
```

更常见的情况是：

#### 普通员工

```json
{
  "data": {
    "permissions": [
      { "code": "project.read", "scope": "department" }
    ]
  }
}
```

#### 项目管理/管理员

```json
{
  "data": {
    "permissions": [
      { "code": "project.read", "scope": "all" },
      { "code": "project.create", "scope": "all" }
    ]
  }
}
```

重点是：

- `project.read` 和 `project.create` 必须拆开返回

### 2. `GET /projects`

只要账号具备 `project.read`，就应允许访问项目列表接口。

接口需要返回列表页摘要所需字段，至少建议包含：

```json
{
  "data": {
    "list": [
      {
        "id": "project-id",
        "name": "张三·橙城花园",
        "status": "constructing",
        "budget": 180000,
        "start_date": "2026-04-01",
        "created_at": "2026-03-20T08:00:00.000Z",
        "customer": {
          "id": "customer-id",
          "name": "张三"
        },
        "property": {
          "community": "橙城花园",
          "building_info": "3号楼2单元1502"
        },
        "designer": {
          "id": "employee-id",
          "name": "李设计"
        },
        "supervisor": {
          "id": "employee-id",
          "name": "王监理"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 20,
      "totalPages": 2
    }
  }
}
```

### 3. `GET /projects/:id`

只要账号具备 `project.read`，并且在其可访问范围内，就应允许查看项目详情。

### 4. `POST /projects`

这里必须做后端强校验。

要求：

- 有 `project.create`：允许创建
- 没有 `project.create`：返回 `403`

不要只依赖前端隐藏入口，因为前端无法防止直接调接口。

推荐返回：

```json
{
  "statusCode": 403,
  "code": "FORBIDDEN",
  "error": "Forbidden",
  "message": "你没有创建项目的权限"
}
```

## 推荐权限规则

### 普通员工

- `project.read`
- 没有 `project.create`

效果：

- 可以看项目列表
- 可以看项目摘要
- 可以看项目详情
- 不可以创建项目

### 项目管理 / 管理员

- `project.read`
- `project.create`

效果：

- 可以看项目列表
- 可以看项目详情
- 可以创建项目

## 前后端职责划分

### 前端负责

- 按 `project.read` / `project.create` 做入口显隐
- 项目创建页做路由兜底
- 没权限时给出明确提示

### 后端负责

- `/auth/me/permissions` 返回正确权限
- `GET /projects` / `GET /projects/:id` 按 `project.read` 放行
- `POST /projects` 按 `project.create` 强校验

## 验收标准

### 场景 1：普通员工

前提：

- `/auth/me/permissions` 返回 `project.read`
- 不返回 `project.create`

验收：

- 首页看到 `项目列表`
- 首页看不到 `项目录入`
- 可以进入项目列表页
- 可以看到每个项目 item 的摘要信息
- 不能进入项目创建页
- 直接调用 `POST /projects` 返回 `403`

### 场景 2：管理员 / 项目管理

前提：

- `/auth/me/permissions` 返回 `project.read`
- 返回 `project.create`

验收：

- 首页同时看到 `项目列表` 和 `项目录入`
- 可以正常进入项目创建页
- `POST /projects` 成功

## 一句话结论

项目模块权限要按“读 / 写”拆开：

- 员工可以看项目列表和项目摘要
- 没有 `project.create` 的员工不能创建项目
- 最终是否能创建，必须由后端 `POST /projects` 强校验保证

## 当前后端状态

这份对接稿对应的后端能力已经完成落地。

当前实现结果：

1. `project.read` 和 `project.create` 已拆开生效
2. `GET /projects` 已按 `project.read` 放行
3. `GET /projects/:id` 已按 `project.read + 可访问范围` 放行
4. `POST /projects` 已按 `project.create` 强校验
5. 普通员工默认权限已去掉 `project.create`

## 本次后端调整

### 1. 修正普通员工默认项目创建权限

问题：

- 原先 `employee_base` 默认模板里错误包含了 `project.create`
- 导致普通员工在 `/auth/me/permissions` 里会拿到：
  - `project.read`
  - `project.create`

这与本文档目标冲突。

本次已处理：

- 新增 migration：
  - `20260421131803_remove_project_create_from_employee_base.sql`
- 作用：
  - 删除 `employee_base` 对 `project.create` 的默认授权

### 2. 补齐项目列表摘要返回

问题：

- `GET /projects` 之前虽然能按 `project.read` 正常访问
- 但列表返回结构主要是裸表字段
- 不足以直接支撑前端列表 item 摘要展示

本次已处理：

- `GET /projects` 改为返回摘要所需字段
- 当前返回至少包含：
  - `id`
  - `name`
  - `status`
  - `budget`
  - `start_date`
  - `created_at`
  - `address`
  - `customer`
  - `property`
  - `designer`
  - `supervisor`

对应代码：

- `controllers/projects/index.ts`

## 当前权限表现

### 普通员工

当前复查结果：

```json
[
  {
    "code": "project.read",
    "scope": "self"
  },
  {
    "code": "project.update",
    "scope": "self"
  }
]
```

说明：

- 普通员工现在已不再默认拥有 `project.create`
- 所以首页只应显示“项目列表”，不应显示“项目录入”

### 管理员

管理员仍保留完整项目权限。

因此：

- 可以看项目列表
- 可以看项目详情
- 可以创建项目

## 当前接口口径

### 1. `/auth/me/permissions`

当前后端会按真实角色模板和权限覆盖返回：

- `project.read`
- `project.create`

这两条权限已经拆开，不再绑定返回。

### 2. `GET /projects`

当前语义：

- 有 `project.read` 即可访问
- 返回项目列表摘要
- 列表数据会按权限范围收敛

### 3. `GET /projects/:id`

当前语义：

- 有 `project.read`
- 且目标项目在当前账号可访问范围内
- 才能查看详情

### 4. `POST /projects`

当前语义：

- 有 `project.create`：允许创建
- 没有 `project.create`：返回 `403`

## 验证结果

本次已完成两类验证。

### 1. 构建验证

已执行：

```bash
bun build app.ts --outdir dist --target node
```

结果：通过。

### 2. 真实权限验证

已用普通员工账号复查 `/auth/me/permissions` 聚合结果。

验证结论：

- `project.create` 已从普通员工默认权限中移除
- 普通员工仍保留 `project.read`

## 更新后的结论

这份对接稿现在已经不是“待后端配合”，而是“后端已对齐”：

- 普通员工可以看项目列表、项目摘要、项目详情
- 普通员工不能创建项目
- 管理员 / 项目管理可以创建项目
- 前端可以按 `project.read` / `project.create` 直接做入口显隐和路由拦截
