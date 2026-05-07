# 小程序端部门岗位规则对接文档

## 背景

后端新增 `department_post_rules` 映射表，用来控制“某个部门允许选择哪些岗位”。

员工仍然保存：

```json
{
  "department_id": "部门 ID",
  "post_id": "岗位 ID"
}
```

区别是：员工新增或编辑时，后端会校验 `department_id + post_id` 是否在启用的部门岗位规则内。

## 接口

### 获取部门岗位规则

```http
GET /department-post-rules
Authorization: Bearer <token>
```

权限要求：当前员工需要有 `employee.read` 权限。

响应结构：

```json
{
  "success": true,
  "data": {
    "departments": [
      {
        "id": "department-id",
        "code": "DESIGN",
        "name": "设计部",
        "selected_post_codes": [
          "DESIGN_DIRECTOR",
          "INTERIOR_DESIGNER"
        ],
        "rules": []
      }
    ],
    "post_options": [
      {
        "id": "post-id",
        "code": "INTERIOR_DESIGNER",
        "name": "设计师",
        "sort": 530,
        "status": 1
      }
    ]
  }
}
```

## 小程序端推荐处理

1. 页面初始化时请求 `/department-post-rules`。
2. 部门选择器使用 `data.departments`。
3. 岗位选择器使用 `data.post_options`，并按当前部门的 `selected_post_codes` 过滤。
4. 用户切换部门后：
   - 如果当前已选岗位仍在新部门 `selected_post_codes` 内，可以保留。
   - 如果不在，清空 `post_id`，提示用户重新选择岗位。
5. 保存员工时仍然提交原有字段：

```json
{
  "name": "张三",
  "phone": "18638374738",
  "department_id": "department-id",
  "post_id": "post-id"
}
```

## 过滤示例

```ts
function getAllowedPosts(config, departmentId) {
  const department = config.departments.find((item) => item.id === departmentId);
  if (!department) return [];

  const allowedCodeSet = new Set(department.selected_post_codes);
  return config.post_options.filter((post) => allowedCodeSet.has(post.code));
}
```

## 后端错误处理

如果小程序端没有按规则过滤，或者规则在保存前被后台调整，员工保存接口会返回业务错误：

```json
{
  "success": false,
  "message": "岗位「设计师」不能归属部门「工程部」"
}
```

小程序端建议提示：

```text
当前岗位不属于所选部门，请重新选择岗位
```

然后清空岗位选择，重新加载岗位候选列表。

## 注意事项

- 前端过滤只负责体验，最终合法性以后端校验为准。
- `selected_post_codes` 是岗位业务编码，保存员工时仍然提交 `post_id`。
- 如果页面没有员工新增/编辑能力，只展示员工信息，则暂时不需要接入该接口。
