# 客户私有房间照片 / 户型图上传交接

2026-09-13：本文描述分支中的实现合同，不代表接口已发布。共享 DTO、账本仓储、COS 网关、双端 HTTP 与 raw 清理 worker 已有本地实现；`20260913035110_create_customer_rendering_private_inputs.sql` 尚未应用远端。没有发布路由、部署 worker、真实 COS/AI 调用，也没有修改 orange。客户端页面仍需各团队实施。

## 四条接口与身份

以下为 API origin 下完整路径，无额外 `/api` 前缀；均为 POST，返回单条结果，无列表/分页参数。

| 客户端 | 创建上传意图 | 确认上传 |
| --- | --- | --- |
| 微信 | `/visitor/renderings/uploads:intent` | `/visitor/renderings/uploads/:id/complete` |
| 抖音 | `/douyin-mini/renderings/uploads:intent` | `/douyin-mini/renderings/uploads/:id/complete` |

业务 API 传 `Authorization: Bearer <当前会话 token>`、`Content-Type: application/json`。四条接口均标记 `tenantServiceAccess=session`，不是匿名上传入口，也不要求将上传绑定到员工身份。

- 微信接受 `visitor_session`（可信 openid、visitor_id），通过服务器最近有效的选公司记录找租户；或者 `auth` + `login_channel=wechat`（可信 openid、tenant_id）。没有选公司返回 409，客户端进入既有选公司流程后重试。租户停用返回 403。
- 抖音接受 `douyin_miniapp`，或者 `auth` + `login_channel=douyin`；使用 token 内 tenant_id、subject_hash、douyin_app_id、douyin_installation_id，miniapp 的 sub 必须匹配 subject_hash。安装必须有效且 app/tenant/scope 相符，停用安装返回 409。缺少完整可信身份返回 401，不能由 body 补齐公司信息。
- 后端按 tenant + channel + HMAC 主体版本/摘要 + app/installation scope 绑定文件。不同主体访问同一 ID 与不存在统一 404。body 不接受 tenant_id、subject、openid、任意 URL、bucket 或 object key。
- 微信 visitor 的精确 POST uploads 白名单已接入；抖音 token 仍限于既有抖音命名空间，不获得通用上传能力。旧 `/visitor/picture-library/*` 与本合同不兼容，不能复用旧图库的 401 匿名回退。

## DTO 与调用顺序

共享定义：`packages/domain/src/customer-rendering.ts`。成功包裹为 `{ "data": <以下 DTO>, "message": "success" }`；客户端若现有 request wrapper 已解包 data，不要二次解包。

1. 选择并检查真实静态 JPEG / PNG / WebP，读取最终待上传文件字节数。HEIC/HEIF 需真实转码，不能只改扩展名或 MIME。原文件要求 `1 <= size_bytes <= 10485760`（10 MiB）。
2. intent body 为严格对象：`{ "purpose": "room", "mime_type": "image/jpeg", "size_bytes": 1024 }`。purpose 仅 `room | floor_plan`，mime_type 仅 `image/jpeg | image/png | image/webp`，size_bytes 是整数。额外字段返回 400。
3. intent data 为 `{ intent_id: UUID, method: "PUT", upload_url: HTTPS签名URL, headers: Record<string,string>, expires_at: ISO日期 }`。期限最多 10 分钟，以返回 expires_at 为准。URL 是临时上传凭据，不能显示为原图预览、写埋点、日志或持久化到通用文件库。
4. 客户端按返回 method 对 upload_url 直接发送文件原始字节，不能使用 multipart 表单封装。COS 请求不得带业务 Bearer token。必传返回 headers 的 `Content-Type`、`Content-Length`、`x-cos-acl: private`、`x-cos-forbid-overwrite: true`。Host 由 URL 决定；平台自动管理 Content-Length 时必须验证实际传输长度精确相符。微信/抖音原生网络层、域名白名单及 CORS 的可行性须分别真机验证。
5. PUT 成功后，以 intent_id 替换 UUID 路径参数调用 complete，body 必须是 `{}`（允许无 body，不允许 null 或额外字段）。不传 URL、对象位置或图片字节。
6. complete data 为 `{ file_id: UUID, status: "pending_review", mime_type: "image/webp", width: 正整数, height: 正整数, size_bytes: 正整数 }`。file_id 等于本意图 ID；大小和宽高属于服务器规范图，不是声明原图。响应没有任何原图/规范图公共 URL。

服务器先验证 HEAD 的大小和 MIME，再限量读取并实际解码静态图，规范化为私有 WebP 并验证长度/MIME/SHA-256 元数据才提交 `pending_review`。已安装 COS SDK 2.15.4 **不签名 Content-Type**：它是必传头，但不是加密绑定的签名头。签名绑定 Content-Length、Host、ACL 与 forbid-overwrite；不能据此跳过 HEAD 和图片解码。

`pending_review` 只表示上传及规范化完成，不代表内容审核通过，更不代表 AI 任务资格。两个客户端显示“待审核”，生图按钮保持关闭；审核、原子额度与预算、任务创建、生成和结果获取均属于后续计划。

## 重放、并发与错误映射

intent 没有幂等键，每次成功请求生成新 ID；按钮需防双击，响应不确定时不要无界自动重发。频控为同 tenant/channel/主体/scope 的 **best-effort 预检查**：10 分钟 3 个、上海本地自然日 10 个；countRecent 后 createIssued 不是原子操作，并发可能突破阈值，不能对外宣称硬上限。失败的已签发账本记录也会计数。

PUT 禁止覆盖；首次成功但客户端未收到响应时可尝试 complete，由服务器核实对象。不要用重传覆盖已有对象。已到 `pending_review` 的 complete 重放返回同一 file_id 和元数据，包括原图已清理之后。有效 processing 租约期间返回 409；客户端退避重试同一 ID。处理租约过期后允许恢复，即使原 intent 期限已过；服务器重读 raw 并核对确定性规范图 SHA-256，绝不盲目覆盖未知写入。已过期且从未处理的 issued 返回过期错误。清理关闭后的 deleted 返回状态冲突。

错误由统一处理器返回 HTTP 状态及 `code`、`message`（可能含 details/requestId）；客户端以 HTTP + code 判定，不解析中文消息。

| HTTP | code / 情况 | 客户端行为 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR`，参数/Zod 校验失败 | 修复 UUID、body、MIME、大小，不重试原参数 |
| 401 | 会话缺失/无效/错误渠道 | 重新获取相应渠道会话，禁止匿名回退 |
| 403 | `TENANT_NOT_AVAILABLE` 或鉴权拒绝 | 停止上传，提示服务不可用 |
| 404 | `RENDERING_INPUT_NOT_FOUND` | 不暴露其他主体文件，提示重新选择 |
| 409 | `RENDERING_TENANT_CONTEXT_REQUIRED` | 微信先选公司 |
| 409 | `DOUYIN_INSTALLATION_DISABLED` | 停止，重新加载安装状态 |
| 409 | `RENDERING_UPLOAD_EXPIRED` | 创建新意图并重新上传 |
| 409 | `RENDERING_UPLOAD_PROCESSING` | 退避重试同一 complete |
| 409 | `RENDERING_INPUT_STATE_CONFLICT` | 停止确认，按最新状态重新上传 |
| 422 | `RENDERING_IMAGE_REJECTED` | 图片不存在、声明不符或解码拒绝，换文件 |
| 429 | `RENDERING_UPLOAD_RATE_LIMITED` | 提示稍后重试，不自动密集签发 |
| 502 | `RENDERING_INPUT_STORAGE_FAILED` | 暂时失败，有限重试，不能记录签名 URL |
| 502 | `RENDERING_INPUT_STORAGE_NORMALIZED_UNKNOWN` | 保留同一 ID，等待租约恢复，不重复创建成品 |
| 503 | `RENDERING_INPUT_STORAGE_UNAVAILABLE` / `RENDERING_STORAGE_UNAVAILABLE` / `RENDERING_IDENTITY_KEY_UNAVAILABLE` | 服务端配置就绪后再试 |
| 500 | `DB_ERROR` 等服务端失败 | 有限重试并报错，不上传身份/URL/图片到日志 |

## 双端实施边界

已只读参考微信 `orange/src/services/visitor_rendering_styles.ts`、`orange/src/packageVisitor/pages/rendering-style-detail/index.tsx`：现有 service/详情页仅消费公开素材。微信团队应新增独立私有上传 service 与房间照片/可选户型图页面，接既有会话、选公司及错误 UI；不得将公共素材 image_url 规范化函数用于私有输入。同步独立 DTO 类型，核对 wrapper 解包与二进制 PUT 支持，清除上传凭据和本地预览生命周期数据。

已参考 gooes `apps/douyin-mini/src/api/rendering-styles.ts`、`apps/douyin-mini/src/pages/rendering-style-detail/page.ts`：现有 API 只做目录/详情。抖音团队应新增私有上传 API 模块及页面，以现有 ApiClient 完成 intent/complete，以独立二进制请求完成 COS PUT；页面沿用 startup 会话和 requestEpoch 防陈旧响应机制。两端 UI 不在本次代码范围，orange 严格只读。

## 清理部署与运行门禁

raw_cleanup_after 默认创建后 24 小时。清理复用 `gooes-cos-reconcile-worker` / `gooes-cos-reconcile-worker-dev` 的 API 镜像与现有源文件入口；不新增服务、Redis、队列或 API fire-and-forget。原 worker 的 enabled 开关仍控制整个循环；新 `CUSTOMER_RENDERING_INPUT_CLEANUP_ENABLED` 默认 false。legacy reconcile 失败后仍 await 清理子任务，清理失败只记录计数，不含原始错误、主体、签名 URL 或字节。

每轮只执行一次 indexed due 查询，`raw_deleted_at IS NULL AND raw_cleanup_after <= now`，按 due/id 排序且 limit=100。每条原子比较状态和原 due，推进 5 分钟租约；issued 只有过期、processing 只有处理租约过期才被关闭为 deleted，保护进行中的 complete。pending_review/approved 仅删除 raw，成品及状态不变。删除失败不填 raw_deleted_at，后续重试；成功写入也必须匹配本次尚有效的 due 租约。网关使用账本 bucket/region/raw key，旧位置凭据必须仍可访问。

启用顺序（尚未执行）：

1. 明确唯一待应用 migration `20260913035110`，走批准的 migration `plan → apply`，随后 `supabase migration list` 核对 Local/Remote；本任务不 apply。
2. 完成真实 COS 私有 bucket policy、CORS/平台必传头、禁止覆盖与旧位置访问 smoke；按既有镜像发布流程发布 API 和复用镜像的 COS worker。
3. 在对应 compose env_file 配置 `PROJECT_LOG_COMMENT_COS_RECONCILE_WORKER_ENABLED=true`、`CUSTOMER_RENDERING_INPUT_CLEANUP_ENABLED=true`、`PROJECT_LOG_COMMENT_COS_RECONCILE_APPLY=false`，先观察 bounded scanned 计数。apply=false 只读，既不领取也不删除；这也令原有 reconcile 为 dry-run，变更前需协调运营窗口。
4. 具备上线授权后恢复 `PROJECT_LOG_COMMENT_COS_RECONCILE_APPLY=true`；观察 `private_inputs` 的 scanned/claimed/deleted/failed/lost。部署 healthcheck 仅判断进程存活，不保证清理进度，需对持续 failed/lost 和积压告警。

默认间隔 10 分钟，理论最多 100 条/轮（约 600 条/小时），实际还受 legacy 时长、COS 请求耗时、受保护记录占位和失败重试影响；不是 24 小时精确删除 SLA。大规模启用前验证积压与吞吐，不能取消 limit 以追平积压。回退先关闭新入口与新清理开关，保留账本/私有对象，修正用 forward migration，不 DROP。

**公开上线阻塞项：** 除 migration、真实 COS/真机验证、数据库真实并发 claim/fencing 验证外，必须以独立 migration/RPC 实现并验证原子频控/额度预占。规范图 PUT 成功但账本未提交、最终处理失败等情形可能遗留 normalized 孤儿；本 worker 明确不删除 normalized，因此其对账、保留期限、删除授权和重试政策必须在公开上线前落地。内容审核未连通亦不能开放 AI 生成。

## Fastify inject 与客户端 smoke

本地、不联网的回归命令（从仓库根目录开始，测试需在 apps/api 解析 `@/` 别名）：

```sh
cd apps/api
bun test src/controllers/visitor-renderings/index.test.ts src/controllers/douyin-miniapp/renderings-controller.test.ts src/services/customer-rendering/inputs.test.ts src/repositories/customer-rendering-inputs.test.ts src/gateways/customer-rendering-input-storage/client.test.ts src/workers/customer-rendering-input-cleanup-worker.test.ts
cd ../..
bun run api:typecheck
bun run api:build
```

controller 测试通过 Fastify inject + 签名测试会话、注入 service 替身验证路由；service/repository/gateway 测试验证相应业务和边界，不能把组合替身结果宣称为远端端到端证明。交接验收需双端分别覆盖：合法会话 intent/complete 200、无会话 401、微信未选公司 409、非法 DTO/ID 400、跨主体 404、过期 issued 409 / RENDERING_UPLOAD_EXPIRED、并发 processing 409、complete 重放同 file_id、raw 清理后仍可重放 pending_review、响应始终无原图公共 URL。真实 CORS、COS policy、PUT 网络重放和真机测试仍待发布前执行，不在本地 smoke 结果中。
