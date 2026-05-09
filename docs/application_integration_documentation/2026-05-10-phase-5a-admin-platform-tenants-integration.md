# Phase 5A Admin 对接文档：平台租户管理

日期：2026-05-10

## 1. 适用范围

本阶段只对接平台超管 admin，不面向普通租户管理员。

建议入口：

```text
/platform/tenants
```

普通租户后台侧边栏不展示该入口。

## 2. 权限要求

所有接口都要求当前登录员工拥有平台角色：

```text
platform_admin
```

非平台超管访问会返回 `403`。

## 3. 接口

### 3.1 租户列表

```http
GET /platform/tenants?page=1&pageSize=20&status=active&keyword=gooes
```

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | number | 否 | 默认 `1` |
| `pageSize` | number | 否 | 默认 `20`，最大 `100` |
| `status` | string | 否 | `active` / `suspended` / `archived` |
| `keyword` | string | 否 | 搜索公司名、slug、联系人、联系电话 |

响应核心结构：

```json
{
  "list": [
    {
      "id": "tenant-id",
      "name": "某某装饰",
      "slug": "demo_tenant",
      "status": "active",
      "contact_name": "张三",
      "contact_phone": "18600000000",
      "created_at": "2026-05-10T00:00:00.000Z",
      "updated_at": "2026-05-10T00:00:00.000Z",
      "usage": {
        "employee_count": 3,
        "customer_count": 20,
        "project_count": 5,
        "h5_page_count": 2,
        "camera_count": 1
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 3.2 创建租户

```http
POST /platform/tenants
```

请求：

```json
{
  "name": "某某装饰",
  "slug": "demo_tenant",
  "contact_name": "张三",
  "contact_phone": "18600000000"
}
```

注意：

- `slug` 创建后本阶段不允许修改。
- `slug` 只允许小写字母、数字、下划线和中划线。
- `slug` 重复时返回 `409 TENANT_SLUG_EXISTS`。
- 本阶段只创建 `tenants` 记录，不自动创建租户管理员。

### 3.3 租户详情

```http
GET /platform/tenants/:id
```

返回结构同列表单项，包含 `usage`。

### 3.4 更新租户

```http
PATCH /platform/tenants/:id
```

请求：

```json
{
  "name": "某某装饰集团",
  "contact_name": "李四",
  "contact_phone": "18700000000"
}
```

本阶段不支持更新：

- `slug`
- `status`

状态变更请走启用/停用接口。

### 3.5 停用租户

```http
POST /platform/tenants/:id/suspend
```

成功返回：

```json
{
  "id": "tenant-id",
  "status": "suspended",
  "suspended": true
}
```

### 3.6 启用租户

```http
POST /platform/tenants/:id/activate
```

成功返回：

```json
{
  "id": "tenant-id",
  "status": "active",
  "activated": true
}
```

## 4. 页面建议

### 4.1 列表页

建议展示：

- 公司名称
- slug
- 状态 badge
- 联系人 / 电话
- 基础用量
- 创建时间
- 操作：详情、编辑、停用、启用

### 4.2 创建弹窗

字段：

- 公司名称
- slug
- 联系人
- 联系电话

创建成功后刷新当前页，不刷新浏览器页面。

### 4.3 状态操作

- `active` 展示“停用”。
- `suspended` 展示“启用”。
- `archived` 本阶段只读，不展示启用/停用。

停用前建议二次确认。

## 5. 后续待接

租户管理员创建、默认部门岗位角色初始化不在 5A 内。等 5B 后再补 admin 表单。
