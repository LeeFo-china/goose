# Admin 客服问题对接文档

日期：2026-05-24

## 对接目标

Admin 需要承接客户提交的问题，完成查看、分配、处理、关闭的最小闭环。客服问题独立于客户销售状态和项目交付状态，不通过修改客户/项目状态来表达处理进度。

## 当前后端状态

已落地第一版 API：

- `GET /customer-service-tickets`
- `GET /customer-service-tickets/:id`
- `POST /customer-service-tickets/:id/assign`
- `POST /customer-service-tickets/:id/action`
- `GET /admin/system-settings`
- `PATCH /admin/system-settings/:key`

当前权限先复用：

- 查看：`customer.read`
- 分配和状态动作：`customer.update`
- 客服配置：`system.settings.read` / `system.settings.update`

## 页面入口

建议菜单：

```text
客户 -> 客服问题
```

建议路由：

```text
/customer-service
```

建议文件：

```text
apps/admin/app/(console)/customer-service/page.tsx
apps/admin/components/customer-service/customer-service-table.tsx
apps/admin/components/customer-service/customer-service-detail-drawer.tsx
apps/admin/components/customer-service/customer-service-actions.tsx
```

## 状态和分类

状态：

| 状态 | 展示 |
| --- | --- |
| `open` | 待处理 |
| `in_progress` | 处理中 |
| `resolved` | 已解决 |
| `closed` | 已关闭 |
| `cancelled` | 已取消 |

分类：

| 分类 | 展示 |
| --- | --- |
| `after_sale` | 售后咨询 |
| `construction` | 施工问题 |
| `acceptance` | 验收问题 |
| `billing` | 费用问题 |
| `other` | 其他 |

## 列表接口

```http
GET /customer-service-tickets?page=1&pageSize=20&status=open&category=construction&assigned_employee_id=uuid&keyword=墙面
```

返回建议：

```json
{
  "list": [
    {
      "id": "uuid",
      "ticket_no": "CS202605240001",
      "category": "construction",
      "status": "open",
      "priority": "normal",
      "content": "墙面有开裂情况",
      "image_count": 2,
      "created_at": "2026-05-24T10:00:00.000Z",
      "customer": {
        "id": "uuid",
        "name": "张三",
        "phone_masked": "199****0001"
      },
      "project": {
        "id": "uuid",
        "name": "张三设计项目",
        "status": "constructing"
      },
      "assigned_employee": {
        "id": "uuid",
        "name": "客服A"
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

列表展示字段：

- 编号
- 客户
- 手机号脱敏
- 关联项目
- 分类
- 状态
- 负责人
- 图片数量
- 创建时间

## 详情接口

```http
GET /customer-service-tickets/:id
```

返回包含：

- 工单基础信息。
- 客户信息。
- 项目信息。
- 图片 URL：`images[]`。
- 图片预览项：`image_items[]`。
- 动作历史 `actions[]`。
- 当前可执行动作 `available_actions[]`。

## 动作接口

### 分配

```http
POST /customer-service-tickets/:id/assign
```

```json
{
  "assigned_employee_id": "uuid"
}
```

取消负责人时传：

```json
{
  "assigned_employee_id": null
}
```

### 状态动作

```http
POST /customer-service-tickets/:id/action
```

```json
{
  "action": "resolve",
  "content": "已联系客户，安排明天上门处理"
}
```

动作按钮规则：

| 当前状态 | 可展示动作 |
| --- | --- |
| `open` | 分配、开始处理、取消 |
| `in_progress` | 分配、解决、取消 |
| `resolved` | 关闭、重开 |
| `closed` | 重开 |
| `cancelled` | 重开 |

前端只展示后端返回的 `available_actions`，不要自行放行。

## 客服配置

客服开关和电话复用系统设置页。

需要支持配置：

- `CUSTOMER_SERVICE_ENABLED`
- `CUSTOMER_SERVICE_PHONE`
- `CUSTOMER_SERVICE_WORKING_HOURS`
- `CUSTOMER_SERVICE_NOTICE`

Admin 设置页可以先使用现有系统设置表单，不强制新增独立客服设置页。

租户配置接口：

```http
GET /admin/system-settings
PATCH /admin/system-settings/:key
```

租户侧只会看到可租户覆盖的短信配置和客服配置。客服配置位于 `customer_service` 分组。

## 图片展示

后端详情返回可访问 URL 或 image item。

Admin 需要：

- 缩略图网格。
- 点击预览大图。
- 支持最多 9 张。

图片不在 Admin 二次上传，第一版只展示客户提交图片。

## 权限

长期建议新增权限：

- `customer_service.read`
- `customer_service.update`
- `customer_service.assign`

第一版已临时复用：

- 查看：`customer.read`
- 处理：`customer.update`
- 配置：`system.settings.update`

长期必须收敛到 `customer_service.*`，避免客服人员获得过宽客户编辑权限。

## 错误处理

后端返回中文错误，Admin 直接展示。

典型错误：

- `客服入口未启用`
- `客服问题不存在`
- `无权查看该客服问题`
- `当前状态不能执行该动作`
- `处理结果不能为空`

## 刷新策略

以下操作完成后刷新列表和详情：

- 分配负责人。
- 开始处理。
- 解决。
- 关闭。
- 取消。
- 重开。

## 第一版验收

- 能进入客服问题列表。
- 能按状态筛选。
- 能打开详情查看图片。
- 能分配客服。
- 能执行开始处理、解决、关闭。
- 已关闭问题不可继续解决，只能重开。
- 操作历史完整展示。
