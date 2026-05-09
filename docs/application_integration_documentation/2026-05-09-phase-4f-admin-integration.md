# Phase 4F Admin 对接文档：员工拓客分享链接

日期：2026-05-09

## 适用端

租户 admin / 员工端后台。

## 1. 创建员工分享链接

```http
POST /tenant-share-links
Authorization: Bearer <employee_token>
Content-Type: application/json
```

Body：

```json
{
  "source": "employee_share",
  "target_type": "miniprogram",
  "target_id": null,
  "expires_at": null,
  "metadata": {
    "remark": "员工固定拓客二维码"
  }
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `source` | `employee_share` / `h5_campaign` / `quote_form` / `miniprogram_qrcode` |
| `target_type` | `miniprogram` / `h5_page` / `quote_form` / `campaign` / `custom` |
| `target_id` | 关联业务 ID，可为空 |
| `expires_at` | 过期时间，MVP 可为空表示长期有效 |
| `metadata` | 扩展信息 |

成功返回：

```json
{
  "id": "share-link-id",
  "tenant_id": "tenant-id",
  "share_employee_id": "employee-id",
  "source": "employee_share",
  "target_type": "miniprogram",
  "target_id": null,
  "token": "ts_xxx",
  "status": "active",
  "expires_at": null,
  "use_count": 0,
  "last_used_at": null
}
```

## 2. 员工分享链接列表

```http
GET /tenant-share-links?page=1&pageSize=20&status=active
Authorization: Bearer <employee_token>
```

说明：

- 当前只返回当前登录员工自己创建的分享链接。
- 后续如果租户管理员要查看全员分享链接，可以单独扩展管理接口。

## 3. Admin 生成小程序码建议

Admin 端拿到 `token` 后，生成小程序码时建议把 `share_token` 放到 scene：

```text
share_token=ts_xxx
```

如果 scene 长度受限，可以只放 token：

```text
ts_xxx
```

小程序端解析后统一保存为 `share_token`。

## 4. H5 分享链接建议

H5 活动页或报价表单可以带：

```text
https://h5.goodcms.cn/t/{tenantSlug}/p/{slug}?share_token=ts_xxx
```

H5 页面加载后缓存 `share_token`，用户跳回小程序登录时继续透传。

## 5. 后续展示建议

客户通过分享绑定成功后，后端会写入 `customer_sources`：

- `source`
- `source_employee_id`
- `related_type`
- `related_id`
- `share_link_id`

租户 admin 的客户详情页后续应展示“线索来源时间线”，包含员工分享来源。

## 待后续实现

- 分享链接停用接口。
- 租户管理员查看全员分享链接。
- 分享绑定成功后通知租户管理员和分享员工。
