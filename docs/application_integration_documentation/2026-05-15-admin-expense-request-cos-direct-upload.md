# Admin 费用审批附件 COS 直传对接记录

日期：2026-05-15

## 背景

费用审批登记打款凭证原来走 `POST /uploads/images`，会经过 API 服务器中转。现在已改为 COS 直传，减少服务器中转和慢上传风险。

## 当前链路

```text
选择打款凭证图片
-> 前端按需压缩图片
-> POST /uploads/cos/direct-init，scene=expense_request
-> PUT upload_url 到腾讯云 COS
-> POST /uploads/cos/direct-complete
-> 保存 storage_path/object_key 到 evidence_images
```

## 后端支持

`/uploads/cos/direct-init` 和 `/uploads/cos/direct-complete` 已支持：

```json
{
  "scene": "expense_request",
  "filename": "evidence.jpg",
  "mimetype": "image/jpeg",
  "size_bytes": 382144
}
```

返回上传 URL 应为：

```text
windwill-1259348056.cos.accelerate.myqcloud.com
```

## Admin 接入结果

- 文件：`apps/admin/components/expenses/expense-mutations.tsx`
- 保留原有 shadcn `Input`、`Button`、`Field` 表单交互。
- 保留原有图片压缩逻辑，单张超过 `1.5MB` 时先压缩。
- 上传成功后保存 `storage_path`，预览通过 `/uploads/public-url` 解析。
- 正常路径不再调用 `POST /uploads/images`。

## 验收标准

- `platform_file_objects.scene = expense_request`。
- 上传 URL host 为 COS 全球加速域名。
- 打款凭证提交后，详情返回的 `evidence_images` 可以正常预览。
- 后端慢日志过滤包含 `expense_request`。
- 上传失败时 Admin 显示明确错误，不让按钮一直 loading。
