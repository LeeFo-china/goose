# 客户装修效果图任务交接（微信／抖音）

本契约描述本分支实现；生产是否已发布以发布证据为准。开放付费准入前须完成迁移、确认所用方舟端点的标准安全护栏、额度／预算配置及试点验收。COS 仅用于私有存储，不再执行图片内容审核。微信小程序团队自行实现客户端，本仓库不修改 `orange`。

## 顺序与身份

微信使用 `/visitor/renderings` 与 visitor session；抖音使用 `/douyin-mini/renderings` 与当前安装的小程序 session。所有路径都从服务端会话决定租户、渠道和主体，不接受客户端提交 `tenant_id`、`subject`、手机号或任意图片 URL。跨租户、跨主体或不存在的文件／任务一律返回 404。

1. 读取 `GET /styles?page=1&pageSize=20` 并选择当前公开素材。列表必须保持分页，`pageSize` 最大 100。
2. 用 `POST /uploads:intent` 分别为房间照片（必需）和户型图（可选）申请私有上传，按返回的 `PUT` URL 与完整 headers 直传，再 `POST /uploads/{id}/complete`。请求／响应细节见 [私有上传契约](customer-rendering-private-inputs-api.md)。
3. `GET /uploads/{id}` 查询 `status`。规范化完成的新图片返回 `ready`，可以提交生成任务；迁移将元数据完整的旧 `pending_review`／`approved` 图片转为 `ready`。旧 `rejected`／`failed` 或规范图不完整的图片须重新上传。`ready` 只表示可提交方舟，内容由模型在生成时判断。不要展示或持久化 COS 签名 URL。
4. `POST /jobs` 用新 UUID `idempotency_key` 发起一次任务：

```json
{
  "style_asset_id": "素材 UUID",
  "room_file_id": "已就绪房间文件 UUID",
  "floor_plan_file_id": "可选的已就绪户型图 UUID",
  "space": "living_room",
  "mode": "renovation",
  "keep_notes": "可选，最多 300 字",
  "idempotency_key": "本次任务固定 UUID"
}
```

客户端应在发送前按租户、应用、安装和主体身份隔离保存本次请求字段与幂等键；身份未确认时不得恢复旧请求。网络超时或同一主体页面重进时重发**完全相同**的请求和键以恢复同一 `job_id`；修改任何字段需使用新键。正常接收为 HTTP 202，`data` 含 `job_id`、`status=queued` 与当前 `quota`。幂等键用于不同请求返回 409；已有在途任务返回 `RENDERING_JOB_ACTIVE`，应使用 quota 的 `active_job_id` 查询任务，不能再次创建付费请求。

5. `GET /jobs/{id}` 查询任务。路径必须是 UUID，query 必须为空。`data` 格式：

```json
{
  "job_id": "任务 UUID",
  "status": "queued",
  "created_at": "2026-09-14T00:00:00Z",
  "updated_at": "2026-09-14T00:00:00Z",
  "finished_at": null,
  "failure_reason": null,
  "result": null
}
```

`status` 为 `queued | processing | succeeded | failed | review_required`。`queued/processing` 可有限次轮询并提供手动刷新；`review_required` 只表示模型提交结果、结果保存或结算状态不确定，需要运营对账，不能自动重试。`failure_reason` 仅在 `failed` 时可为 `content_rejected | provider_rejected`，其余情况为 `null`；内容拒绝时提示更换图片或描述，不展示上游原文。只有方舟返回图片、私有结果完整保存且任务 `succeeded` 时，`result` 才是 `{ mime_type: "image/webp", size_bytes, download_url, expires_at }`；URL 是短期私有 GET 签名，过期后重新调用任务详情。客户端页面将其标注为“AI 参考效果图”，不表示施工方案或实际交付承诺。

## 失败与额度

图片解析／规范化失败、文件与当前账号不符、素材下架、日任务／预算上限、额度不足分别返回明确业务错误。显示服务端中文提示，不根据错误自动换素材或重复提交。明确未开始模型调用或方舟明确拒绝的任务会释放预占；方舟成功返回并持久化私有结果才消耗一次额度；模型调用结果不明时保留预占并进入 `review_required`。不可把 `review_required` 当成失败自动新建任务。

## 双端验收

两端均需检查：无会话 401，非法 UUID/额外 query 400，跨租户／跨账号 404；新上传完成后直接 `ready`，旧规范化且原来待审核的图片在迁移后变成 `ready`；重复幂等键只返回同一任务；`queued → processing → succeeded` 仅完整私有结果可读取短期 URL；方舟明确内容拒绝时 `failed`、释放预占并提示更换素材；`review_required` 不自动重发方舟；私有图在其他账号不可读、签名过期后需重新获取。客户端只持久化文件 ID、任务请求与任务 ID，不记录原始图片字节、签名 URL 或模型响应原文。

本仓库已修改 `apps/douyin-mini/src/pages/rendering-style-detail/page.ts` 及其上传／任务 API 解析。微信团队需要在只读参考的 `orange/src/types/api/visitor_rendering_upload.d.ts`、`orange/src/packageVisitor/pages/rendering-upload/index.tsx`、`orange/src/services/visitor_rendering_uploads.ts` 中接收 `ready`、移除“提交审核”文案并按本节接入生成任务；`orange` 的改动与发布由微信团队完成。
