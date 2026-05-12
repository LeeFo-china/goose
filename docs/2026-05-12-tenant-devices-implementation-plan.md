# tenant_devices 租户设备资产落地方案

日期：2026-05-12

## 背景

当前摄像头设备的租户归属由 `project_cameras.tenant_id` 表示，也就是设备通道绑定到项目后，才继承项目租户。

这个方案能保证“已绑定摄像头”的租户隔离，但无法严格回答“已在腾讯云/萤石创建、还未绑定项目的设备属于哪个租户”。如果现场先创建设备、后绑定通道，就需要本地设备资产表记录未绑定设备的归属。

## 目标

新增 `tenant_devices`，把第三方设备资产沉淀为本地租户资产：

- 设备创建成功后立即有租户归属。
- 未绑定项目的设备也能按租户过滤。
- 绑定项目时校验设备租户和项目租户一致。
- 解绑项目后，设备仍归属原租户，可以重新绑定到同租户其他项目。
- 平台超管可查看全量设备资产和归属。

## 非目标

- 不把腾讯云、萤石拆成每个租户一套第三方账号。
- 不改变现有已绑定摄像头播放链路。
- 不让前端传 `tenant_id` 决定设备归属。
- 不在本阶段做平台设备资产运营大盘。

## 数据模型

新增表：

```sql
CREATE TABLE IF NOT EXISTS public.tenant_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  vendor text NOT NULL,
  vendor_device_serial text NOT NULL,
  vendor_device_code text NULL,
  vendor_device_name text NULL,
  vendor_channel_id text NULL,
  vendor_channel_code text NULL,
  vendor_channel_name text NULL,
  device_type text NULL,
  source_project_id uuid NULL REFERENCES public.projects(id),
  bound_project_id uuid NULL REFERENCES public.projects(id),
  bound_camera_id uuid NULL REFERENCES public.project_cameras(id),
  status text NOT NULL DEFAULT 'unknown',
  raw_status text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES public.employees(id),
  updated_by uuid NULL REFERENCES public.employees(id),
  last_synced_at timestamptz NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `tenant_id` | 设备所属租户，后端从登录上下文和项目归属推导 |
| `vendor` | `ezviz` / `tencent_iotvideo_industry` |
| `vendor_device_serial` | 第三方设备主 ID；腾讯云为 `DeviceId`，萤石为设备序列号 |
| `vendor_device_code` | 第三方设备编码；腾讯云为 `DeviceCode` |
| `vendor_channel_id` | 通道 ID；腾讯云必填，萤石可为空 |
| `vendor_channel_code` | 通道编码；腾讯云为 `ChannelCode` |
| `source_project_id` | 创建设备时使用的项目 ID，用于追踪来源 |
| `bound_project_id` | 当前绑定项目，未绑定为空 |
| `bound_camera_id` | 当前绑定的 `project_cameras.id`，未绑定为空 |
| `metadata` | 第三方返回的扩展信息，如 SIP、group、protocol |
| `created_by` | 创建设备的员工 |

约束与索引：

```sql
ALTER TABLE public.tenant_devices
ADD CONSTRAINT tenant_devices_vendor_check
CHECK (vendor IN ('ezviz', 'tencent_iotvideo_industry'));

ALTER TABLE public.tenant_devices
ADD CONSTRAINT tenant_devices_status_check
CHECK (status IN ('online', 'offline', 'unknown'));

CREATE UNIQUE INDEX IF NOT EXISTS tenant_devices_vendor_device_channel_unique
ON public.tenant_devices(
  vendor,
  vendor_device_serial,
  COALESCE(vendor_channel_id, '')
)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tenant_devices_tenant_vendor_idx
ON public.tenant_devices(tenant_id, vendor, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tenant_devices_tenant_bound_project_idx
ON public.tenant_devices(tenant_id, bound_project_id)
WHERE deleted_at IS NULL;
```

说明：

- 唯一索引仍是全局唯一，防止同一个物理设备通道被多个租户重复占用。
- 查询按 `tenant_id` 过滤，保证租户端只看到自己的设备资产。
- 软删除用于保留历史审计。

## 迁移策略

### 1. 新增表

新增 Supabase migration：

```text
supabase/migrations/YYYYMMDDHHMMSS_create_tenant_devices.sql
```

包含表结构、约束、索引、updated_at trigger、字段注释。

### 2. 回填已绑定摄像头

从 `project_cameras` 回填现有设备资产：

```sql
INSERT INTO public.tenant_devices (
  tenant_id,
  vendor,
  vendor_device_serial,
  vendor_device_code,
  vendor_channel_id,
  vendor_channel_code,
  vendor_channel_name,
  source_project_id,
  bound_project_id,
  bound_camera_id,
  status,
  metadata,
  last_synced_at,
  created_at,
  updated_at
)
SELECT
  camera.tenant_id,
  camera.vendor,
  camera.vendor_device_serial,
  camera.vendor_device_code,
  camera.vendor_channel_id,
  camera.vendor_channel_code,
  camera.name,
  camera.project_id,
  camera.project_id,
  camera.id,
  camera.status,
  jsonb_build_object(
    'position', camera.position,
    'channel_no', camera.channel_no,
    'play_protocol', camera.play_protocol
  ),
  camera.last_status_checked_at,
  camera.created_at,
  camera.updated_at
FROM public.project_cameras camera
WHERE camera.deleted_at IS NULL
  AND camera.tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

### 3. 保持兼容

上线初期 `project_cameras` 仍是播放和项目摄像头列表主表。`tenant_devices` 先作为设备资产归属和候选设备过滤表。

## 后端改造

### Repository

新增：

```text
apps/api/src/repositories/tenant-devices.ts
```

核心方法：

- `upsertFromProjectCamera(camera)`
- `createTenantDevice(input)`
- `findByVendorDeviceChannel(vendor, deviceSerial, channelId)`
- `listByTenant(input)`
- `markBound(input)`
- `markUnbound(input)`
- `softDelete(id, tenantId)`

所有租户端查询必须带 `tenantId`；平台超管接口可以不带。

### Service

新增：

```text
apps/api/src/services/tenant-devices.ts
```

负责：

- 从 authContext 推导租户。
- 校验项目租户。
- 统一做设备资产归属判断。
- 处理第三方设备和本地资产的合并展示。
- 平台超管可按租户、厂商、状态、绑定状态检索全量设备资产。

### 平台设备资产视图

新增平台超管接口：

```http
GET /platform/tenant-devices?page=1&pageSize=20
```

支持参数：

| 参数 | 说明 |
| --- | --- |
| `tenant_id` | 按租户过滤 |
| `vendor` | 按厂商过滤：`ezviz` / `tencent_iotvideo_industry` |
| `status` | 按设备状态过滤：`online` / `offline` / `unknown` |
| `only_unbound` | 仅看未绑定项目摄像头的资产 |
| `keyword` | 搜索设备名、设备 ID、通道 ID |

返回中补充租户、来源项目、绑定项目、绑定摄像头的轻量信息，便于平台排查设备归属：

```json
{
  "tenant": { "id": "租户ID", "name": "装修公司", "slug": "tenant-slug" },
  "source_project": { "id": "项目ID", "name": "来源项目" },
  "bound_project": { "id": "项目ID", "name": "当前绑定项目" },
  "bound_camera": { "id": "摄像头ID", "name": "当前摄像头" }
}
```

Admin 新增页面：

```text
/platform/devices
```

用于查看全平台设备资产归属，不提供编辑和删除操作。租户侧仍在工地监控页维护自己的设备资产池。

### 租户端设备接入页

租户工地监控页的“设备接入”tab 只保留“设备资产池”作为主入口：

- 资产池头部展示总数、未绑定数、在线数。
- “新增设备”放在资产池头部，当前创建腾讯云设备。
- “同步资产”放在资产池头部，用于补齐当前租户已有设备的第三方通道。
- 不再常驻展示“腾讯云设备与通道”和“萤石设备通道”底层列表。
- 第三方通道列表接口保留给运维排查或后续弹窗式纳入资产使用。

### 腾讯云创建设备

当前接口：

```http
POST /projects/:project_id/cameras/tencent-devices
```

改造后流程：

1. `resolveActor` 校验员工有 `project.update`。
2. 读取项目并确认 `project.tenant_id = actor.tenantId`。
3. 调腾讯云 `CreateDevice`。
4. 如果云端已有同名设备，后端自动追加 4 位短后缀后再创建，例如 `客厅IPC` -> `客厅IPC-1234`。
5. 写入 `tenant_devices`：
   - `tenant_id = actor.tenantId`
   - `source_project_id = project_id`
   - `vendor = tencent_iotvideo_industry`
   - `vendor_device_serial = DeviceId`
   - `vendor_device_code = DeviceCode`
   - `created_by = actor.employeeId`
6. 返回设备接入信息；如发生自动改名，返回 `original_device_name` 和 `name_adjusted=true`，Admin 在成功弹窗提示最终名称。

### 腾讯云/萤石设备列表

当前设备列表从第三方平台拉取，再用 `project_cameras` 判断是否绑定。

改造后：

1. 仍可从第三方拉取最新设备和通道。
2. 查询当前租户 `tenant_devices`。
3. 合并第三方设备与本地资产：
   - 属于当前租户的设备：展示。
   - 已绑定到其他租户的设备：展示为已占用，隐藏详情。
   - 不在 `tenant_devices` 且未绑定的第三方设备：默认不展示给租户端。
4. 平台超管可以查看全部。

已落地补充：

- 第三方设备列表同时读取 `project_cameras` 和 `tenant_devices`。
- 已纳入当前租户资产池但未绑定项目的通道，展示为“已纳入资产”。
- 已纳入其他租户资产池的通道，展示为“其他租户资产”，不允许再次纳入。
- 只有既未绑定项目、也未纳入任何租户资产池的通道，才显示“纳入资产”。

### 绑定项目摄像头

当前接口：

```http
POST /projects/:project_id/cameras
```

改造后新增校验：

1. 按当前租户读取项目。
2. 查 `tenant_devices` 是否存在该设备通道。
3. 如果设备资产存在：
   - 要求 `tenant_devices.tenant_id = project.tenant_id`。
   - 如果已绑定其他项目，拒绝。
4. 如果设备资产不存在：
   - MVP 建议拒绝并提示“请先将设备纳入当前租户资产”。
   - 兼容期可由后端自动创建资产，但必须从当前项目租户继承。
5. 创建 `project_cameras`。
6. 回写 `tenant_devices.bound_project_id`、`bound_camera_id`。

### 解绑项目摄像头

当前解绑是软删 `project_cameras`。

改造后：

1. 软删 `project_cameras`。
2. 将对应 `tenant_devices` 置为未绑定：
   - `bound_project_id = null`
   - `bound_camera_id = null`
3. 设备仍归属原租户。

### 状态同步

现有播放和列表会刷新腾讯云状态并回写 `project_cameras.status`。

改造后同步写：

- `project_cameras.status`
- `tenant_devices.status`
- `tenant_devices.raw_status`
- `tenant_devices.last_synced_at`

## API 设计

### 租户设备资产列表

```http
GET /tenant-devices?vendor=tencent_iotvideo_industry&status=online&keyword=入口&page=1&pageSize=20
Authorization: Bearer <admin-token>
```

返回：

```json
{
  "list": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "vendor": "tencent_iotvideo_industry",
      "vendor_device_serial": "DeviceId",
      "vendor_device_code": "DeviceCode",
      "vendor_device_name": "工地入口 IPC",
      "vendor_channel_id": "ChannelId",
      "vendor_channel_code": "ChannelCode",
      "vendor_channel_name": "工地入口",
      "status": "online",
      "bound_project_id": "uuid",
      "bound_camera_id": "uuid",
      "created_at": "2026-05-12T00:00:00.000Z"
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

权限：

```text
project.read
```

### 租户设备资产详情

```http
GET /tenant-devices/:id
```

权限：

```text
project.read
```

### 修改租户设备资产

```http
PATCH /tenant-devices/:id
Authorization: Bearer <admin-token>
Content-Type: application/json
```

请求体：

```json
{
  "vendor_device_name": "工地入口 IPC",
  "vendor_channel_name": "入口通道",
  "device_type": "IPC",
  "status": "unknown"
}
```

权限：

```text
project.update
```

说明：

- 只修改本地设备资产展示信息，不直接修改第三方平台设备名称。
- 不允许修改 `tenant_id`、`vendor`、`vendor_device_serial`、`vendor_channel_id` 等归属和唯一识别字段。

### 删除租户设备资产

```http
DELETE /tenant-devices/:id
Authorization: Bearer <admin-token>
```

权限：

```text
project.update
```

说明：

- 删除为软删除。
- 已绑定项目的设备资产不能直接删除，需要先解绑项目摄像头。
- 删除本地资产不等于删除腾讯云/萤石远端设备。

### 同步租户设备资产

```http
POST /tenant-devices/sync
Authorization: Bearer <admin-token>
```

权限：

```text
project.update
```

说明：

- 后端只同步当前租户已经拥有的设备资产对应的第三方通道。
- 不会把平台共享第三方设备池里的陌生设备自动纳入租户。
- 腾讯云设备创建后如果先只有设备级资产，待通道上报后可通过该接口补齐通道资产。
- 萤石会按当前租户已有设备序列号同步通道状态和通道信息。

返回：

```json
{
  "created_count": 1,
  "updated_count": 2,
  "total_count": 3
}
```

### 手动纳入设备资产

用于萤石或历史设备补录：

```http
POST /tenant-devices
```

请求体：

```json
{
  "vendor": "ezviz",
  "vendor_device_serial": "EZVIZ_SERIAL",
  "vendor_device_code": null,
  "vendor_channel_id": null,
  "vendor_channel_code": null,
  "vendor_channel_name": "通道 1",
  "source_project_id": "uuid"
}
```

权限：

```text
project.update
```

### 平台全量设备资产

后续平台超管接口：

```http
GET /platform/tenant-devices?tenant_id=uuid&vendor=tencent_iotvideo_industry
```

权限：

```text
platform_admin
```

## Admin 对接

### 工地监控页

绑定设备弹窗调整：

1. 先展示“当前租户设备资产”。
2. 对腾讯云设备，支持“新增腾讯云设备”后立即进入当前租户资产。
3. 选择资产后绑定到项目。
4. 不展示其他租户资产详情。

设备状态建议：

| 状态 | 展示 |
| --- | --- |
| 未绑定 | 可选择绑定 |
| 已绑定当前项目 | 已绑定当前项目 |
| 已绑定当前租户其他项目 | 展示项目名，可提示先解绑 |
| 已被其他租户占用 | 只提示已占用 |

### 设备资产页

可以在后续新增租户端页面：

```text
设备资产
```

用于查看当前租户的未绑定设备、已绑定设备和离线设备。

首期也可以不新增页面，只在工地监控绑定弹窗内消费 `tenant_devices`。

## 微信小程序对接

小程序不需要直接接入 `tenant_devices`。

原因：

- 客户只访问项目下已绑定摄像头。
- 播放接口仍通过 `project_id + camera_id` 校验客户、项目和租户一致。
- 未绑定设备资产不应暴露给客户。

如果后续小程序需要展示“设备列表”，只能展示项目下已绑定摄像头，不展示租户设备资产池。

## 兼容与灰度

建议分三步上线：

### 第一步：表和回填

- 新增 `tenant_devices`。
- 回填历史 `project_cameras`。
- 不改变现有 API 响应。

### 第二步：写链路双写

- 腾讯云创建设备写 `tenant_devices`。
- 绑定摄像头后回写 `tenant_devices`。
- 解绑摄像头后清空绑定字段。
- 状态同步双写。

### 第三步：读链路切换

- 工地监控绑定弹窗改为优先读取 `tenant_devices`。
- 第三方设备列表只作为同步源，不再作为租户端直接候选池。
- 平台超管保留查看全量能力。

## 风险与处理

| 风险 | 处理 |
| --- | --- |
| 历史数据缺少 `tenant_id` | 回填时从 `project_cameras.tenant_id` 或 `projects.tenant_id` 获取 |
| 同一物理设备已被多个租户历史绑定 | 迁移前用唯一键扫描，先出冲突清单人工处理 |
| 腾讯云创建成功但本地写入失败 | 返回失败并记录审计；后续可通过同步任务补偿 |
| 第三方设备被平台删除 | 本地标记 `status=unknown` 或软删除，不直接删除历史绑定 |
| 解绑后设备再次绑定到其他租户 | 绑定校验 `tenant_devices.tenant_id = project.tenant_id`，禁止跨租户 |

## 验收标准

- 已绑定摄像头全部回填到 `tenant_devices`。
- 腾讯云新建设备后，即使未绑定项目，也能在当前租户资产中查到。
- 当前租户看不到其他租户未绑定设备资产。
- 当前租户看到其他租户已占用通道时，只能看到“已占用”，看不到对方项目详情。
- 绑定项目时，设备资产租户和项目租户不一致会被拒绝。
- 解绑摄像头后，`tenant_devices` 仍保留设备归属，但绑定字段为空。
- 小程序播放项目摄像头链路不受影响。

## 建议实施文件

后端：

- `supabase/migrations/YYYYMMDDHHMMSS_create_tenant_devices.sql`
- `apps/api/src/schema/tenant-devices.ts`
- `apps/api/src/repositories/tenant-devices.ts`
- `apps/api/src/services/tenant-devices.ts`
- `apps/api/src/controllers/tenant-devices/index.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/services/project-cameras.ts`
- `apps/api/src/repositories/project-cameras.ts`

Admin：

- `apps/admin/components/cameras/*`
- `apps/admin/app/(console)/cameras/page.tsx`

文档：

- 本文档
- `docs/2026-05-12-tenant-device-access-ownership.md`

## 本次已落地

已完成第一阶段和部分第二阶段：

- 新增 migration：`supabase/migrations/20260512120000_create_tenant_devices.sql`。
- 新增 `tenant_devices` 表、唯一约束、租户索引、绑定索引、updated_at trigger。
- migration 会从历史 `project_cameras` 回填已绑定设备资产。
- 新增租户设备资产 API：
  - `GET /tenant-devices`
  - `GET /tenant-devices/:id`
  - `POST /tenant-devices`
  - `PATCH /tenant-devices/:id`
  - `DELETE /tenant-devices/:id`
  - `POST /tenant-devices/sync`
- 腾讯云创建设备成功后，会立即写入一条当前租户的设备级资产。
- 项目摄像头绑定成功后，会写入或更新对应通道资产，并记录 `bound_project_id`、`bound_camera_id`。
- 项目摄像头解绑后，不删除设备资产，只清空绑定字段。
- 摄像头状态刷新时，同步更新 `tenant_devices.status`、`raw_status`、`last_synced_at`。
- Admin 设备资产区已提供“同步资产”，用于把当前租户已有设备的第三方通道补齐到资产池。

暂未切换：

- Admin 工地监控绑定弹窗已切换为优先读取 `tenant_devices?only_unbound=true`。
- 第三方设备通道列表保留为“纳入资产”入口；通道纳入资产后，再进入绑定弹窗绑定项目。
- 小程序仍不直接接入 `tenant_devices`，只读取项目下已绑定摄像头。
