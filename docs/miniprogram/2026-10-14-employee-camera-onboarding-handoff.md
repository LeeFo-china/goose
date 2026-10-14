# 员工小程序设备登记与项目绑定：契约核验及配套计划

日期：2026-10-14。核验基准：gooes `8d5d8486e` 及本机 orange 当前源码。

**状态：后端实现与本地验收已完成，尚未生产部署。下述新接口需在 migration 和 API 完成部署后才能对生产联调；orange 未修改。本文第 3–4 节保留部署前契约与初始审计发现；新增及变更后的契约以第 8 节为准。**

## 1. 目标与分工

员工在现场完成“登记公司设备 → 查看接入参数 → 在设备端配置联网 → 同步通道 → 绑定当前项目”。已有设备直接选择绑定，无需重新登记。项目没有摄像头时显示“添加首台摄像头”，已有摄像头时显示“增加摄像头”。

- gooes：核实并补齐后端可靠性、权限、性能边界，提供接口回执及生产验证结果。
- orange：小程序团队修改页面、service、交互及真机验收。本代理仅只读参考 orange。
- 本期沿用腾讯设备链路；不新增萤石接入或通用硬件配网能力。录入 SN 不会自动配置硬件，必须在设备支持的 GB28181 配置入口填写接入参数并联网。
- 客户和访客不获得设备登记、公司资产池、接入密码或绑定权限。

## 2. 当前实际能力

orange 首页 `src/pages/index/homeModel.tsx` 根据 `project.update` 展示“监控配置”；`src/utils/camera-permission.ts` 没有限制必须为 system_admin。

`src/packageProjects/pages/cameraConfig/index.tsx` 已支持：分页选择项目、选择已登记设备、绑定、解绑、开关查看。首台与追加目前使用同一个表单；没有登记新设备、查询 SIP 配置或同步通道的调用。

`src/services/projects/methods/cameras.ts` 已调用公司资产池 `GET /tenant-devices`，固定腾讯厂商和 `only_unbound=true`。因此 2026-05-12 文档中“小程序不接入 tenant_devices”的笼统结论不再适用于员工端。

## 3. 实施前接口契约（生产尚未更新）

以下路径沿用现有 API base URL、Bearer 员工登录凭证和租户上下文，不由前端传入 `tenant_id` 决定归属。成功响应为 `{ data, message }`；错误经 error-factory 和 error-handler 返回 `{ success:false, message, code, details?, requestId }`。

| 接口 | 权限和输入 | 返回及注意事项 |
| --- | --- | --- |
| GET `/projects/camera-bind-options` | 员工；按 `project.update` 范围筛选；`page=1&pageSize=20`，上限 20；`keyword`、`selected_project_id` 可选 | `data.list`、`data.pagination`；从项目详情进入时用 selected_project_id 重新确认可操作项目，不能只相信页面传入名称 |
| GET `/tenant-devices` | 员工 `project.read`；vendor、status、keyword、only_unbound、page、pageSize；默认 20，上限 100 | `list`、`pagination`；仅本租户。only_unbound 不代表已同步或在线，客户端仍须检查通道和占用 |
| POST `/tenant-devices/tencent` | 员工 `project.update`；hardware_serial 必填，trim 后转大写，1–160 字符；device_type 为 2 IPC 或 3 NVR，默认 2；password 可省略/null | `asset`、`device`、`sip_server`；未传密码时服务端生成。登记与项目无关，source_project_id 为 null |
| GET `/tenant-devices/:id/tencent-access` | 员工 `project.update`；本租户资产 UUID，腾讯设备 | `device`、`sip_server`；用于登记后恢复查看配置；响应 private,no-store |
| POST `/tenant-devices/sync` | 员工 `project.update`；无单设备参数 | `created_count`、`updated_count`、`total_count`；**当前是租户整批同步，不是当前设备同步，不适合在手机端反复轮询** |
| POST `/projects/:projectId/cameras` | 员工 `project.update` + 项目范围 + 项目状态；见下方请求 | `{id}`；服务端用本租户资产解析真实云端标识；拒绝占用、跨租户或无通道资产 |
| PATCH `/projects/:projectId/cameras/:cameraId` | 员工 `project.update` + 项目范围 | 可更新 name、position、can_view 等。当前小程序仅提供 can_view 开关 |
| DELETE `/projects/:projectId/cameras/:cameraId` | 员工 `project.update` + 项目范围 | `{success:true}`；解除项目关联，不等于删除云端物理设备 |
| GET `/project-cameras/projects/:projectId/devices` | 员工 `project.read` + 项目范围；默认 page=1,pageSize=20，上限 20 | 新员工管理页优先复用此分页明细；客户既有播放链路不迁移到该接口 |

设备接口属于 `core.projects` 服务能力，仍受租户服务状态限制。设备登记、接入参数读取与公司资产列表是**公司范围权限**，没有再按单个项目限制资产；项目绑定另有项目范围校验。前端不能将“有权编辑一个项目”描述成“仅能访问该项目设备”。本期复用现有权限，不默认给所有员工开放。

### 登记及接入参数

首版页面默认 IPC、密码由服务端生成；不要求员工填写云端 ID。登记请求示例：

```json
{ "hardware_serial": "DS-DEMO-001", "device_type": 2 }
```

登记返回的 `device` 包括 tenant_device_id、hardware_serial、device_id、device_code、device_name、device_type、device_type_label、sip_username、video_channel_code、sip_password、sip_transport_protocol、request_id。

`sip_server` 包括 sip_server_id、sip_domain、sip_host、sip_port、transport_protocol、request_id。登记服务获取 SIP 服务配置失败时会返回 `sip_server:null`；应保留已经登记的资产，重新读取 tencent-access，**不能重新登记**。

恢复接口的 device 不含 hardware_serial 和数字 device_type，可从资产记录获得；含 source_project_id、bound_project_id。不要假定登记返回与恢复返回结构完全相同。

页面对应显示：SIP 服务器编号、域、地址、端口、用户名、密码、视频通道编码、TCP。参数暂未取到时显示“设备已登记，接入配置获取失败，可重试”。密码只在配置页按需展示/复制，不放入 URL、埋点、日志或持久化草稿。

### 绑定请求与 ID 区别

```json
{
  "tenant_device_id": "00000000-0000-4000-8000-000000000001",
  "name": "客厅施工监控",
  "position": "客厅",
  "vendor": "tencent_iotvideo_industry",
  "vendor_device_serial": "cloud-device-id",
  "vendor_channel_id": "cloud-channel-id",
  "channel_no": 1,
  "can_view": true,
  "can_control": false,
  "capabilities": ["live"],
  "video_encrypted": false,
  "play_protocol": "flv"
}
```

示例 ID 为说明用途。项目内名称 1–80 字符，位置最多 80 字符。当前 schema 即便提供 tenant_device_id 仍要求 vendor_device_serial，腾讯还要求 vendor_channel_id；不要发送 ID-only 请求。字段来自服务端选中资产，不能由 SN 拼装。

- hardware_serial：物理设备标签 SN。
- vendor_device_serial / device_id：腾讯云设备 ID。
- vendor_channel_id：腾讯云通道 ID。
- tenant_device_id：**选中通道对应的本地资产 UUID**。
- 登记返回的资产通道为空；同步发现通道后通常创建另一条资产记录，不能继续拿登记记录 UUID 绑定项目。
- 一通道只能绑定一个项目；同项目重复绑定也拒绝。转移先解绑，再绑定。
- 无效（invalid）和竣工验收（acceptance）项目不能新增绑定，前后端规则保持一致。
- 当前 can_view=false 同时限制客户及员工播放，不能将它标成只影响客户。

### 当前失败契约

| 情况 | 当前响应/处理 |
| --- | --- |
| 未登录、无权限或不属于当前租户 | 401/403；具体路径查不到资产也可能返回 400/404；不展示其他租户信息 |
| SN 预检查发现重复 | 409 CAMERA_ALREADY_BOUND，提示“该设备 SN 已登记”；无 existing_asset_id 返回，不自动再次登记 |
| 绑定占用 | 409 CAMERA_ALREADY_BOUND 或 CAMERA_BOUND_TO_ANOTHER_PROJECT；刷新资产和当前项目列表，清除旧选择 |
| 资产没有通道 | 409 TENCENT_IOT_VIDEO_PLAY_URL_ERROR；不能将此误认为单纯播放失败 |
| 项目状态不允许 | 400 VALIDATION_ERROR；保留已登记公司设备，返回项目选择或退出 |
| 数据库唯一约束并发冲突 | 当前 repository 统一包装 500 DB_ERROR，尚未统一为业务冲突 |
| 登记/绑定请求超时 | 结果未知，不自动重试写入；先查资产及绑定状态，不能将超时直接当作未创建 |

## 4. 初始审计发现（本地修复已完成）

下列为源代码路径确认的问题或可靠性缺口；本轮没有在生产制造并发、超时或脏数据。

### P0：同步没有保留物理 SN

`services/tenant-devices/legacy/sync.ts` 向 `upsertSynced` 传入 hardware_serial，但 `repositories/tenant-devices/legacy/mutations.ts` 只在查询入参中出现该字段，实际 insert/update payload 缺少 hardware_serial。查询函数也不使用额外传入的 SN。结果是新通道资产不能可靠保留物理 SN，按 SN 查找和恢复接入流程会受影响。

现有测试“inherits the physical serial”仅统计源码字符串出现次数，9 项契约测试通过并不代表数据已正确写入。实施时用捕获 insert/update payload 的行为测试覆盖新增通道、重复同步、NVR 多通道，再修复字段持久化。

### P0：登记不是可安全重试的操作

`services/tenant-devices/legacy/tenant-tencent-create.ts` 顺序为查重 → 腾讯 CreateDevice → 本地 insert。现有 SN 唯一索引只防止同租户无通道登记记录重复，不能阻止并发请求已各自在腾讯创建设备；云端成功而本地失败、云端返回超时也没有登记恢复机制。数据库插入冲突目前包装为 500。

实施需要服务端登记幂等/占位及可恢复结果，按租户和规范化 SN 串行保护云端创建；明确云端结果未知时如何核对，不能只加前端 loading。需要持久化状态或约束时通过 migration；不自动删除可能已配置的云端设备。

### P0：手机缺少单设备有界同步与准确通道定位

当前 sync 读取租户前 1000 条资产，然后 gateway 遍历云账号设备及通道，最后才按租户设备集合过滤；计数返回也没有当前设备的通道资产。既存在大租户截断边界，也不适合作为现场单设备刷新。

拟补齐：租户单设备同步入口、按确切云端 device_id 的分页通道资产查询。建议路由 `POST /tenant-devices/:id/sync`，**当前只有 platform 同名形态路由，租户路由尚不存在**。实施契约需明确每次扫描上限、继续同步标识、超时/失败结果；只请求目标设备，不能借用全局同步后在前端过滤。通道列表默认 20、最大 100，空通道与同步失败分开表达。

### P1：绑定与资产占用的失败一致性

绑定先 insert project_cameras，再更新 tenant_devices；解绑也分两次写入，没有同一事务。现有活动通道唯一索引能够防止重复 camera 记录，但第二步失败仍可能造成返回失败与实际状态不一致，或资产显示可用但绑定被拒绝。

实施时将同库绑定/占用及解绑释放原子化，或者采用经验证的等价一致性方案；唯一冲突转明确业务错误。不要把现有唯一约束误写成“完整流程已经幂等”。涉及 RPC/函数一律 migration。

## 5. 小程序交互与文件分工

1. 全局监控配置先选择授权项目；项目详情进入时携带项目 ID 并重新核验，绑定弹层内锁定项目。不能因搜索或刷新静默切到另一项目。
2. 添加首台/增加摄像头都先显示已有可用设备选择；另设“登记新设备”。避免两个同名入口含义相同。
3. 登记表单收集 SN，默认 IPC。展示返回参数，提示用户在设备端完成接入。保留资产 ID 和云端设备 ID 以便恢复，不保存密码。
4. 用户点击“已完成设备配置，检查接入”后调用拟补齐的单设备同步，再读取该设备通道。后端未部署前不得调用拟定路由或拿全租户同步做自动轮询。
5. 没有通道时显示“等待设备接入”；有通道但离线时显示“已发现通道，当前离线”，不虚构在线状态。绑定资格与联网状态分别判断；当前后端不以 offline 本身禁止绑定。
6. IPC 唯一可用通道可预选；多通道必须明确选择，不能默认取整个资产池第一条。
7. 填写项目内名称、安装位置，单次提交绑定；成功后刷新项目设备与可用资产。绑定失败保留表单，重新核实占用。
8. 页面切后台/重新打开可恢复登记结果；权限撤回或切换公司后清空设备选择和接入参数。

orange 团队参考文件：

- `src/pages/index/homeModel.tsx`：全局入口与权限。
- `src/packageProjects/pages/cameraConfig/index.tsx`：当前项目和请求状态、绑定动作。
- `src/packageProjects/pages/cameraConfig/components/CameraConfigContent.tsx`：首台/追加、已有设备/新登记入口。
- `src/packageProjects/pages/cameraConfig/useCameraAssets.ts`：分页资产列表与准确设备过滤。
- `src/packageProjects/pages/cameraConfig/model.ts`：字段转换、禁用原因与错误提示。
- `src/services/projects/methods/cameras.ts`、`src/services/projects/types/camera.ts`：新接口封装和分别定义登记/恢复返回类型。

gooes 实施范围：`controllers/tenant-devices/index.ts`、`schema/tenant-devices.ts`、`services/tenant-devices/legacy/`、`repositories/tenant-devices/legacy/`、腾讯 gateway；绑定一致性涉及 project-cameras 的 service/repository。依现有分层小步修改，不直接在 controller 查库，不新增依赖。

## 6. 实施与验收顺序

- [x] 当前接口、前后端权限和调用路径核验，区分现有与拟建能力。
- [x] 运行既有设备/绑定契约测试，记录其覆盖限制。
- [x] 后端先修同步 SN；用行为测试证明新建/更新通道实际 payload 正确。
- [x] 补登记幂等和未知结果恢复；验证并发、云端成功本地失败、超时不重复创建。
- [x] 补单设备有界同步及精确分页查询；验证不扫描无关设备，超过一页可继续且无遗漏。
- [x] 补绑定/解绑一致性和唯一冲突契约；验证失败不留下占用错位。
- [x] 更新本文第 8 节为已实现契约，记录本地验证。
- [ ] 完成生产 migration/API 部署，提供版本与接口 smoke 回执，小程序再联调新增 API。
- [ ] 小程序体验包绑定后在生产指定项目、指定设备联合真机验收；不得批量同步或修改无关项目设备。

真机清单：

- 有读写权限员工可以操作；只读员工、客户、访客无法登记/看接入密码/绑定。
- 项目详情入口锁定正确项目；超出授权范围、跨租户 ID 和撤权操作被后端拒绝。
- 首台、追加、解绑转移均成功；同通道重复绑定明确拒绝。
- 新登记后参数可复制；返回页面可恢复，不要求重新登记。
- 未接入、无通道、离线、有多个通道分别展示正确。
- 同步后 SN 仍可定位设备，绑定使用通道资产 ID，而不是无通道登记 ID。
- 双击、弱网重试、两员工同时操作不重复登记/绑定，不遗留资产占用错位。
- 绑定后的员工及项目客户按查看权限播放；未获权限项目不可播放。
- 保存员工首台/追加、客户播放、拒绝场景截图；截图和日志不包含 SIP 密码。

## 7. 本轮验证记录与限制

在 `apps/api` 目录执行：

```sh
bun test src/services/tenant-device-asset-contract.test.ts src/services/tenant-device-tencent-access-contract.test.ts src/services/project-camera-tenant-device-binding.test.ts
```

结果：9 pass、0 fail、30 expect。首次在仓库根目录运行因 `@/` 别名未解析失败，改到 API 包目录后通过。上述测试主要为 schema 与源码契约检查，不覆盖腾讯真实设备、数据库写入一致性或手机网络中断。

LightRAG 历史查询登录超时；本轮结论以本地当前实现、migration 和 orange 的 `docs/2026-10-07-camera-backend-alignment.md` 为准。不宣称已完成生产接口新增、现场设备验证或真机验收。

初始审计阶段仅新增本文并给旧交接文档补充适用范围说明；其后的后端实现记录见下一节。


## 8. 后端实施回执（尚未部署）

### 已实现的行为

- 同步写入真实 hardware_serial；旧批量同步也改为单次原子 RPC，在设备锁内读取当前 SN，不覆盖已修改/已清空的 SN，不写回旧 bound_project_id/bound_camera_id。
- 登记在云端创建之前先用租户 + 规范化 SN 建立持久占位；云端回执和本地资产完成分开持久化。本地资产插入失败后复用已保存回执。
- 同 SN 再次 POST 登记返回已有配置，不改写原设备类型或密码。新建云端设备使用 `gooes-reg-<登记UUID>` 唯一名称标记以便核对；公司资产名称仍显示 SN，不能用云端昵称代替物理 SN。
- 云端结果未知时只按完整、精确的登记标记及类型核对，不再次 CreateDevice。找不到唯一结果返回 409 `CAMERA_ALREADY_BOUND`，`details.registration_state=reconciliation_required`，附 registration_id、hardware_serial。小程序应据 details 区分“待核对”和普通“设备被占用”。
- 若进程在建立占位后、发出云端请求前退出，也可能需要人工核对；占位不自动过期。不能宣称任意超时都能自动恢复，不得清除占位后直接重建。已删除或归属不一致的资产不自动恢复，返回冲突。
- 完成登记后读密码失败返回 503，details 包含 tenant_device_id；重新获取配置，不重新创建设备。SIP 服务参数获取失败可返回 sip_server:null。
- 登记表不存储明文 SIP 密码。每次恢复从云端读取当前密码。
- 腾讯设备修改 SN 时，资产及登记记录在同一事务中关联更新；历史 SN 保留登记归属，旧 SN 延迟重试不能重新创建设备或返回新 SN 的配置。新 SN 可以恢复同一云设备；清空 SN 不释放历史登记记录。
- 项目摄像头与资产占用在一个事务中绑定；解绑在一个事务中释放。事务内再次检查租户、项目状态、资产归属与占用，保留现有创建请求格式及成功返回。

### 新接口：单设备同步

```http
POST /tenant-devices/:id/sync?page=1&pageSize=20
```

鉴权：员工 project.update + 当前租户资产；腾讯设备。`:id` 可为本租户登记资产或同一云设备的通道资产；始终同步其归属云设备，不能由前端传 cloud device_id 改变目标。

page 默认 1、最大 1,000,000；pageSize 默认 20、最大 50。**每次调用只同步一页**，只发起一次该设备 DescribeChannels，不扫描云账号全部设备。gateway + 数据库阶段共享 10 秒等待预算；超时可能已提交事务，应通过通道列表核对，重试同一页不会重复创建通道资产。

```json
{
  "data": {
    "synced_count": 20,
    "device_id": "cloud-device-id",
    "sync": {
      "page": 1, "pageSize": 20, "total": 21,
      "has_more": true, "next_page": 2, "state": "partial"
    }
  },
  "message": "success"
}
```

- total 为云端通道总数；厂商未返回可靠总数时为 null，以 has_more/next_page 为准。保持相同 pageSize 继续下一页。
- state=partial：还有下一页。state=complete：本页完成且没有后续页，不代表设备在线或视频可播放。state=waiting_for_device：第一页没有任何通道。
- synced_count 是本次成功处理条数，包含已存在通道的更新，不是新增数。
- 一页写入是事务；发现同一云设备的活动根资产或兄弟通道归属其他租户时，整页拒绝，不能通过尚未入库的新通道绕过归属。同步不改动绑定关系；旧时间状态不覆盖较新状态。
- 厂商失败/不完整或混入其他设备的响应返回错误，不能降级成空列表成功。无效厂商响应：502 TENCENT_DEVICE_CHANNEL_RESPONSE_INVALID；占用归属冲突：409 CAMERA_BOUND_TO_ANOTHER_PROJECT；不存在资产：404 CAMERA_NOT_FOUND。
- 前端采用用户触发的检查与显式继续同步，不无限轮询，不用整租户 POST /tenant-devices/sync 替代新接口。

### 新接口：准确查询该设备通道

```http
GET /tenant-devices/:id/channels?page=1&pageSize=20
```

鉴权：员工 project.read + 当前租户腾讯设备。默认每页 20、最大 100，page 最大 1,000,000；返回 `{ data:{ list,pagination }, message }`。

list 为同一厂商、云端设备 ID、租户下的未删除通道资产，排除通道为空的登记记录；按 vendor_channel_id、id 排序。不把其他设备的搜索结果混入。字段：id、hardware_serial、vendor、vendor_device_serial、vendor_device_code、vendor_device_name、vendor_channel_id、vendor_channel_code、vendor_channel_name、device_type、bound_project_id、bound_camera_id、status、last_synced_at。

每个 list.id 才是绑定时提交的 tenant_device_id。该接口返回已绑定和未绑定通道，客户端根据 bound_project_id/bound_camera_id 禁用已占用项；不要因该接口只读成功就认定有绑定权限。status 为最后同步状态，不能把离线本身视为禁止绑定。

### 小程序团队可按此顺序配套

1. 在现有监控配置页区分“添加首台摄像头/增加摄像头”，从项目详情进入时锁定项目并重新核验权限。
2. 优先选择公司已有可用资产，另提供新设备 SN 登记表单。
3. 登记成功保存非敏感 asset.id 和 device.device_id；显示 SIP 参数，用户在硬件侧配置；退出再进入可重新读取配置。
4. 检查接入时调用单设备同步；有下一页则显式继续。同步成功后调用该设备 channels 接口，选择实际通道资产。
5. 沿用现有 createProjectCamera payload 提交绑定；成功刷新列表，失败保留名称/位置并重新查占用。
6. 单独处理 reconciliation_required 和“已登记但配置读取失败”；不自动循环重发登记，不将 409 都显示成“已经绑定项目”。

### 发布顺序与回滚

待部署 migration 顺序：

1. `20261014090000_tenant_device_registration.sql`：无密码的持久登记占位、回执、历史 SN 归属及原子更名。
2. `20261014091000_atomic_project_camera_binding.sql`：绑定/解绑原子 RPC 及关联索引。
3. `20261014092000_tenant_device_channel_page.sql`：单设备同步、旧同步原子写入 RPC、准确分页查询索引。

发布时先暂停设备登记写入并等待旧版在途创建请求完成，避免新旧创建路径同时工作。先完成 migration plan 与待执行清单核对，再应用 migration，并用 supabase migration list 验证 Local/Remote 对齐；随后部署兼容 API，回传生产版本和 smoke 结果。小程序体验版联调后再发布客户端。

回滚 API 前应先停用登记写操作，保留登记占位与回执，不得直接删除 pending 记录或切回无幂等的创建路径。同步/绑定 RPC 可以在旧调用方退出后移除，但不回删已登记设备或项目关联。数据库修复必须通过 migration，不能手工远端 DML。

### 本地验证结果

- 106 项测试通过，0 失败，622 次断言，覆盖 23 个文件；包括隔离 PostgreSQL 的真实事务、回滚及并发检查，并以 service_role 验证登记 RLS 权限。
- API 类型检查、API 构建、文件大小检查、权限边界检查及 git diff --check 均通过。
- SQL 覆盖旧资产没有登记回执时 SN 更名、历史 SN 重试隔离、无根记录的通道 SN 更名/清空；查询计划使用对应索引。
- [验证记录](../operations/evidence/2026-10-14-employee-camera-onboarding/README.md)与同目录日志保留实际结果。

未执行远端 migration、生产部署、真实腾讯设备创建或真机验收；未修改 orange。生产部署及真实设备联调仍属于后续步骤。
