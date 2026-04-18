# 项目日志删除与图片删除接口方案

本文档用于定义项目日志后续的删除能力，覆盖两类场景：

- 删除整条项目日志
- 从项目日志中删除单张或多张图片

目标是保证：

- 前端交互简单
- 数据库记录与 Supabase Storage 文件保持一致
- 后续支持日志编辑、补图、撤销更容易扩展

---

## 1. 推荐接口设计

建议提供两个接口：

1. 删除日志
   - `DELETE /project_logs/:id`
2. 删除日志中的部分图片
   - `PATCH /project_logs/:id/images`

不建议把“删除日志”和“删除图片”混成一个接口。

原因：

- 语义更清晰
- 前端调用更稳定
- 后续补图、替换图、编辑日志更容易扩展

---

## 2. 接口一：删除整条项目日志

### 路径

```http
DELETE /project_logs/:id
```

### 鉴权

- 需要 `Authorization: Bearer <token>`

### 参数

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `string` | 是 | 日志 ID，合法 UUID |

### 推荐行为

后端执行顺序建议：

1. 校验日志 ID
2. 校验当前用户是否有删除权限
3. 先查出该日志的 `images`
4. 删除 Storage 中对应图片对象
5. 删除数据库中的日志记录
6. 返回成功结果

### 成功响应建议

```json
{
  "data": {
    "id": "2d074cba-3e16-4ae3-85dd-22ae03ae0493"
  },
  "message": "success"
}
```

### 删除失败的处理建议

如果数据库记录已删除但 Storage 文件删除失败，后端应记录日志，后续可通过定时清理任务处理残留文件。

不建议为了删除一条日志而因为单张图片删除失败直接让整个接口报错回滚，除非你们明确要求强一致。

---

## 3. 接口二：删除日志中的部分图片

### 路径

```http
PATCH /project_logs/:id/images
```

### 鉴权

- 需要 `Authorization: Bearer <token>`

### 请求体

建议使用“保留图片列表”而不是“删除图片列表”。

推荐请求体：

```json
{
  "images": [
    "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2/2026/04/18/a.jpg"
  ]
}
```

含义：

- 前端把当前仍然保留的图片路径数组整体提交给后端
- 后端根据原始图片列表与新列表做差集
- 差集部分从 Storage 删除
- 新列表写回 `project_logs.images`

### 为什么推荐“保留列表”

因为前端编辑态天然维护的是“当前还有哪些图片”，而不是“刚删掉了哪些图片”。

这样做的好处：

- 前端实现简单
- 避免重复删除同一张图
- 更适合未来做日志编辑接口

### 成功响应建议

```json
{
  "data": {
    "id": "2d074cba-3e16-4ae3-85dd-22ae03ae0493",
    "images": [
      "https://unqhypivjkpwldhufpjc.supabase.co/storage/v1/object/public/project-logs/c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2/2026/04/18/a.jpg"
    ]
  },
  "message": "success"
}
```

---

## 4. 路径与存储约定

当前项目日志图片建议继续沿用：

- bucket：`project-logs`
- 数据库存储：对象 `path`
- 接口返回：可访问 `url`

示例：

```json
{
  "path": "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2/2026/04/18/a.jpg",
  "url": "https://unqhypivjkpwldhufpjc.supabase.co/storage/v1/object/public/project-logs/c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2/2026/04/18/a.jpg"
}
```

删除时后端应始终使用 `path` 操作 Storage，不要依赖 `url`。

---

## 5. 权限建议

推荐最小权限规则：

- 日志创建人可删除自己创建的日志
- 管理员或有项目管理权限的员工可删除任意日志

如果当前系统暂时没有完整角色权限模型，短期可以先做：

- 仅允许日志创建人删除

后端判断建议基于：

- JWT 中的当前用户
- `employees.user_id`
- `project_logs.employee_id`

---

## 6. 前端交互建议

### 场景一：删除整条日志

1. 弹确认框
2. 调 `DELETE /project_logs/:id`
3. 成功后刷新：
   - `/project_logs/projects`
   - `/project_logs/projects/calendar`

### 场景二：编辑页删除单张图片

1. 前端先在本地移除图片
2. 保存时把剩余的 `images` 路径数组整体提交给后端
3. 后端删除不再保留的 Storage 文件
4. 返回最新日志数据

---

## 7. TypeScript 类型建议

```ts
type DeleteProjectLogResponse = {
  data: {
    id: string;
  };
  message: string;
};

type UpdateProjectLogImagesPayload = {
  images: string[];
};

type UpdateProjectLogImagesResponse = {
  data: {
    id: string;
    images: string[];
  };
  message: string;
};
```

---

## 8. 推荐落地顺序

建议按下面顺序实现：

1. `DELETE /project_logs/:id`
2. `PATCH /project_logs/:id/images`
3. 如果后续有完整编辑页，再补通用 `PATCH /project_logs/:id`

这样可以先覆盖最常见的“删日志”和“删图”需求，再决定是否要做完整编辑能力。
