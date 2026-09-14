# 客户装修效果图任务交接（微信／抖音）

本契约只描述当前仓库实现。生产生成入口与 Worker 仍默认关闭；必须完成迁移、COS CI 与 Ark 真实验证、额度／预算配置及试点验收后再开放。微信小程序团队自行实现客户端，本仓库不修改 `orange`。

## 顺序与身份

微信使用 `/visitor/renderings` 与 visitor session；抖音使用 `/douyin-mini/renderings` 与当前安装的小程序 session。所有路径都从服务端会话决定租户、渠道和主体，不接受客户端提交 `tenant_id`、`subject`、手机号或任意图片 URL。跨租户、跨主体或不存在的文件／任务一律返回 404。

1. 读取 `GET /styles?page=1&pageSize=20` 并选择当前公开素材。列表必须保持分页，`pageSize` 最大 100。
2. 用 `POST /uploads:intent` 分别为房间照片（必需）和户型图（可选）申请私有上传，按返回的 `PUT` URL 与完整 headers 直传，再 `POST /uploads/{id}/complete`。请求／响应细节见 [私有上传契约](customer-rendering-private-inputs-api.md)。
3. `GET /uploads/{id}` 查询 `status`。只有 `approved` 可用于生成；`pending_review` 且 `review_state=manual` 时提示人工审核、停止自动轮询；`rejected` 要求重新选择合规照片。不要展示或持久化 COS 签名 URL。
4. `POST /jobs` 用新 UUID `idempotency_key` 发起一次任务：

```json
{
  "style_asset_id": "素材 UUID",
  "room_file_id": "已审核房间文件 UUID",
  "floor_plan_file_id": "可选的已审核户型图 UUID",
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
  "result": null
}
```

`status` 为 `queued | processing | succeeded | failed | review_required`。`queued/processing` 可有限次轮询并提供手动刷新；`review_required` 表示模型请求或审核结果需人工核对，不能自动重试。只有 `succeeded` 且输出 CI 审核通过时 `result` 才是 `{ mime_type: "image/webp", size_bytes, download_url, expires_at }`；URL 是短期私有 GET 签名，过期后重新调用任务详情。客户端页面将其标注为“AI 参考效果图”，不表示施工方案或实际交付承诺。

## 失败与额度

上传文件未通过审核、与当前账号不符、素材下架、日任务／预算上限、额度不足分别返回明确业务错误。显示服务端中文提示，不根据错误自动换素材或重复提交。明确未开始模型调用或 Ark 明确拒绝的任务会释放预占；成功且结果通过审核才消耗一次额度；模型调用结果不明时保留预占并进入 `review_required`。不可把 `review_required` 当成失败自动新建任务。

## 双端验收

两端均需检查：无会话 401，非法 UUID/额外 query 400，跨租户／跨账号 404；上传完成后 `pending_review → approved/rejected/manual`；重复幂等键只返回同一任务；`queued → processing → succeeded` 仅批准结果可读取短期 URL；`review_required` 不自动重发 Ark；私有图在其他账号不可读、签名过期后需重新获取。客户端只持久化文件 ID、任务请求与任务 ID，不记录原始图片字节、签名 URL 或服务端审核原文。
