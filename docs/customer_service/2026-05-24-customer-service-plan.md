# 客户问题提交与客服电话方案

日期：2026-05-24

## 背景

部分租户需要面向客户提供售后/客服入口。客户应能在前端提交问题、上传现场图片，也能直接拨打租户配置的客服电话。客服人员需要在 Admin 看到问题列表、处理状态和客户/项目上下文。

当前仓库已经具备可复用能力：

- 多租户上下文和权限体系。
- 客户自助端接口 `customer-self-service`。
- 图片上传接口 `POST /uploads/images`，支持租户、客户、员工上下文。
- Admin 系统设置页和租户级系统设置能力。
- 员工岗位中已有 `CUSTOMER_SERVICE_MANAGER / CUSTOMER_SERVICE`。

## 目标

1. 租户可配置客服电话。
2. 客户前端可查看客服电话并一键拨打。
3. 客户前端可提交客服问题，支持文字、分类、关联项目、图片。
4. Admin 可查看、筛选、分配、处理客服问题。
5. 所有数据按 `tenant_id` 隔离。
6. 图片走现有文件存储，不新增一套上传链路。

## 非目标

- 第一版不做实时在线客服聊天。
- 第一版不做客服 SLA 自动排班。
- 第一版不接第三方工单系统。
- 第一版不做复杂评价体系，只保留后续可扩展字段。

## 产品流程

### 客户端

入口建议放在客户自助首页或“我的”页：

- 显示租户客服电话。
- 点击电话按钮直接调用系统拨号能力。
- 显示“提交问题”按钮。

提交问题表单：

- 问题分类：售后咨询、施工问题、验收问题、费用问题、其他。
- 关联项目：可选，默认可选客户名下项目。
- 问题描述：必填，最多 1000 字。
- 图片：可选，最多 9 张，复用 `POST /uploads/images`。

提交成功后：

- 返回工单编号和当前状态。
- 客户可在“我的问题”查看历史问题。

### Admin

新增客服问题列表：

- 默认按 `created_at desc`。
- 支持状态、分类、关键词、负责人筛选。
- 列表展示：客户、手机号脱敏、项目、分类、状态、负责人、创建时间、图片数量。

详情页/抽屉：

- 展示客户信息、关联项目、问题描述、图片。
- 支持分配客服、添加内部备注、状态流转。
- 支持拨打客户电话，仍走现有客户手机号权限控制。

## 状态模型

客服问题建议独立状态机，不复用客户销售状态和项目状态。

```text
open -> in_progress -> resolved -> closed
  \                         ^
   -> cancelled ------------|
```

状态含义：

| 状态 | 含义 |
| --- | --- |
| `open` | 客户已提交，待处理 |
| `in_progress` | 客服已接手处理中 |
| `resolved` | 已给出处理结果，待关闭 |
| `closed` | 已关闭 |
| `cancelled` | 客户或客服取消 |

动作：

| 动作 | from | to | 说明 |
| --- | --- | --- | --- |
| `assign` | `open/in_progress` | 当前状态不变或 `in_progress` | 分配客服 |
| `start` | `open` | `in_progress` | 开始处理 |
| `resolve` | `in_progress` | `resolved` | 填写处理结果 |
| `close` | `resolved` | `closed` | 关闭问题 |
| `cancel` | `open/in_progress` | `cancelled` | 取消问题 |
| `reopen` | `resolved/closed/cancelled` | `in_progress` | 重新打开 |

## 数据模型

### `customer_service_tickets`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `tenant_id` | uuid | 租户 |
| `customer_id` | uuid | 提交客户 |
| `project_id` | uuid nullable | 关联项目 |
| `category` | text | 问题分类 |
| `title` | text nullable | 标题，默认从内容截取 |
| `content` | text | 问题描述 |
| `images` | jsonb | 图片对象 key 数组或 image item 数组 |
| `status` | text | 工单状态 |
| `priority` | text | `normal/high/urgent`，第一版默认 `normal` |
| `assigned_employee_id` | uuid nullable | 负责人 |
| `resolved_at` | timestamptz nullable | 解决时间 |
| `closed_at` | timestamptz nullable | 关闭时间 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

建议索引：

- `(tenant_id, created_at desc)`
- `(tenant_id, status, created_at desc)`
- `(tenant_id, customer_id, created_at desc)`
- `(tenant_id, assigned_employee_id, status)`

### `customer_service_ticket_actions`

记录状态流转、分配、备注。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `tenant_id` | uuid | 租户 |
| `ticket_id` | uuid | 工单 |
| `action` | text | 动作 |
| `from_status` | text nullable | 原状态 |
| `to_status` | text nullable | 新状态 |
| `operator_employee_id` | uuid nullable | Admin 操作人 |
| `operator_auth_user_id` | uuid nullable | 客户/用户操作人 |
| `content` | text nullable | 备注或处理结果 |
| `metadata` | jsonb | 扩展信息 |
| `created_at` | timestamptz | 创建时间 |

## 租户配置

新增租户级系统设置：

| key | 类型 | 说明 |
| --- | --- | --- |
| `CUSTOMER_SERVICE_ENABLED` | boolean | 是否启用客服入口 |
| `CUSTOMER_SERVICE_PHONE` | string | 客服电话 |
| `CUSTOMER_SERVICE_WORKING_HOURS` | string | 工作时间文案 |
| `CUSTOMER_SERVICE_NOTICE` | string | 客服入口提示文案 |

读取规则：

- 客户端 bootstrap 返回客服配置。
- 未启用时不展示入口。
- 启用但未配置电话时，只展示提交问题入口，不展示拨号按钮。

## API 设计

### 客户端接口

#### 获取客服配置

可以并入现有：

```http
GET /customer/bootstrap
```

返回新增：

```json
{
  "customer_service": {
    "enabled": true,
    "phone": "400-000-0000",
    "working_hours": "周一至周日 09:00-18:00",
    "notice": "施工、验收和售后问题可提交客服"
  }
}
```

#### 创建客服问题

```http
POST /customer/service-tickets
```

请求：

```json
{
  "project_id": "uuid",
  "category": "construction",
  "content": "墙面有开裂情况，请安排处理",
  "images": ["tenant/xxx/customer_service/xxx.webp"]
}
```

返回：

```json
{
  "id": "uuid",
  "status": "open",
  "created_at": "2026-05-24T10:00:00.000Z"
}
```

#### 客户查看自己的问题

```http
GET /customer/service-tickets?page=1&pageSize=20
GET /customer/service-tickets/:id
```

约束：

- 只能查看当前登录客户自己的工单。
- `project_id` 必须属于当前客户。

### Admin 接口

#### 列表

```http
GET /customer-service-tickets?page=1&pageSize=20&status=open&category=construction&keyword=墙面
```

#### 详情

```http
GET /customer-service-tickets/:id
```

#### 分配负责人

```http
POST /customer-service-tickets/:id/assign
```

```json
{
  "assigned_employee_id": "uuid"
}
```

#### 状态动作

```http
POST /customer-service-tickets/:id/action
```

```json
{
  "action": "resolve",
  "content": "已联系客户，安排明天上门处理"
}
```

## 图片上传

复用现有：

```http
POST /uploads/images
```

建议新增上传场景：

```text
customer_service
```

上传规则：

- 最多 9 张。
- 允许 `image/jpeg,image/png,image/webp,image/heic,image/heif`。
- 客户端上传后拿 `storage_path/object_key` 写入 `customer_service_tickets.images`。
- 展示时通过现有 `resolveStoredFileUrlList` 或 image item 解析为可访问 URL。

## 权限

新增权限建议：

| 权限 | 说明 |
| --- | --- |
| `customer_service.read` | 查看客服问题 |
| `customer_service.update` | 处理客服问题 |
| `customer_service.assign` | 分配客服 |
| `customer_service.settings.update` | 修改客服配置，可复用 `system.settings.update` |

第一版可以先复用：

- 客服问题读取/处理：`customer.update` 或新增 `customer_service.*`。
- 客服电话配置：复用 `system.settings.update`。

长期建议新增 `customer_service.*`，避免客服人员获得过宽客户编辑权限。

## 前端设计

### 客户端

组件建议：

- `CustomerServiceEntryCard`
- `CustomerServiceTicketForm`
- `CustomerServiceTicketList`
- `CustomerServiceTicketDetail`

拨号：

- Web/H5：`window.location.href = "tel:" + phone`
- 微信小程序：`wx.makePhoneCall({ phoneNumber })`

### Admin

新增菜单建议：

```text
客户 -> 客服问题
```

页面：

- `apps/admin/app/(console)/customer-service/page.tsx`
- `components/customer-service/customer-service-table.tsx`
- `components/customer-service/customer-service-detail-drawer.tsx`
- `components/customer-service/customer-service-actions.tsx`

UI 原则：

- 列表高密度、可扫描，不做营销式卡片。
- 详情抽屉展示图片、客户、项目和处理动作。
- 状态动作按钮只展示当前可执行动作。

## 后端落地结构

建议新增：

```text
apps/api/src/schema/customer-service.ts
apps/api/src/repositories/customer-service-tickets.ts
apps/api/src/services/customer-service-tickets.ts
apps/api/src/controllers/customer-service/index.ts
supabase/migrations/YYYYMMDDHHMMSS_create_customer_service_tickets.sql
```

分层规则：

- controller：读 request、校验参数、调用 service、包装响应。
- service：做权限、租户、状态动作、项目归属校验。
- repository：访问 Supabase。

错误响应必须经过 `Errors` / `error-factory.ts`。

## 关键校验

- 客户端创建问题时，必须有客户身份。
- `project_id` 如传入，必须属于当前客户和当前租户。
- 图片数量不能超过 9。
- `content` 必填，最长 1000。
- 租户未启用客服入口时，客户不能创建工单。
- Admin 操作必须在同租户内。
- 非负责人是否可处理由权限决定，不由前端判断。

## 通知策略

第一版建议只做站内可见，不强制通知。

后续可以增加：

- 客户提交后通知客服负责人。
- 分配后通知被分配客服。
- 处理完成后通过小程序订阅消息或短信通知客户。

## 分阶段计划

### 阶段 0：规则和配置

- 冻结本文档。
- 增加系统设置定义：启用、电话、工作时间、提示文案。
- 增加 domain 常量：分类、状态、动作。

### 阶段 1：数据模型和后端

- 新增 `customer_service_tickets`。
- 新增 `customer_service_ticket_actions`。
- 实现客户创建/列表/详情接口。
- 实现 Admin 列表/详情/动作接口。
- 新增上传场景 `customer_service`。

### 阶段 2：客户前端

- bootstrap 返回客服配置。
- 客服入口展示电话和提交问题。
- 创建问题支持图片上传。
- 问题历史列表和详情。

### 阶段 3：Admin

- 客服问题列表。
- 详情抽屉。
- 分配、处理、关闭、重新打开。
- 图片预览。

### 阶段 4：通知和运营增强

- 待处理计数接入任务中心。
- 可选短信/订阅消息通知。
- 处理时长统计和导出。

## 推荐第一版范围

第一版建议做最小闭环：

1. 租户配置客服电话和是否启用。
2. 客户端展示电话和提交问题。
3. 客户端上传图片。
4. Admin 查看问题并处理状态。

暂缓：

- 客户评价。
- 自动派单。
- 在线聊天。
- SLA 统计。

## 待确认问题

1. 客服电话是租户统一一个号码，还是支持多个门店/部门号码？
2. 客户提交问题是否必须绑定项目？
3. 工单是否允许客户主动取消？
4. 是否需要客户看到客服回复，还是第一版只由客服电话回访？
5. 是否需要把客服问题接入任务中心首页待办？

