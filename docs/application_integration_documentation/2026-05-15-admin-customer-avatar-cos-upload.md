# Admin 客户头像 COS 上传对接说明

日期：2026-05-15  
适用端：Admin 租户客户管理  
状态：第一版已接入 Admin；Admin 已优先走 COS 直传，失败时回退 `/uploads/images`；微信小程序端不在本次改动范围。

## 1. 后端变更

新增客户头像字段：

```sql
alter table public.customers
add column if not exists avatar text;
```

字段口径：

- `customers.avatar` 保存稳定存储引用。
- 新上传默认优先保存后端返回的 `storage_path` / `object_key` / `path`，不保存短期 signed URL。
- 接口出参会通过 `resolveStoredFileUrl` 转为可访问 URL。

## 2. Admin 上传流程

Admin 客户新增/编辑弹窗增加头像上传控件，优先直传 COS：

```text
选择头像
-> POST /uploads/cos/direct-init，scene=customer_avatar
-> 浏览器 PUT upload_url
-> POST /uploads/cos/direct-complete
-> POST/PATCH /customers 时写入 storage_path/object_key
```

直传失败时回退兼容上传：

```text
选择头像
-> POST /uploads/images，scene=customer_avatar
-> 后端写入 COS 和 platform_file_objects
-> 返回 storage_path/object_key/path/url
-> POST/PATCH /customers 时写入 avatar
```

上传限制：

- 格式：JPG、PNG、WebP、HEIC、HEIF。
- 大小：单张不超过 2MB。
- 失败时停留在表单内提示，不提交脏数据。

## 3. 接口字段

创建客户：

```http
POST /customers
```

更新客户：

```http
PATCH /customers/:id
```

请求可带：

```json
{
  "name": "张三",
  "avatar": "tenants/{tenant_id}/customer-avatar/unassigned/2026/05/15/a.jpg"
}
```

响应会返回：

```json
{
  "id": "...",
  "name": "张三",
  "avatar": "https://...signed-or-public-url..."
}
```

## 4. 微信小程序端说明

本次不修改微信小程序代码。

如果后续小程序端需要展示客户头像：

- 直接使用客户接口返回的 `avatar`。
- 不要在小程序端拼接 COS 域名或 Supabase 域名。
- 头像为空时使用本地默认头像或姓名首字占位。

如果后续小程序端需要上传客户头像：

- 先复用后端上传口径：`POST /uploads/images`，`scene=customer_avatar`。
- 上传成功后将返回的 `storage_path || object_key || path || url` 写入客户更新接口的 `avatar` 字段。
- 后续如要改为 COS 直传，需要另行接入 `/uploads/cos/direct-init` 和 `/uploads/cos/direct-complete`，并由后端开放 `customer_avatar` 直传场景。

## 5. 验收标准

- Admin 新增客户时可以上传头像，保存后列表/详情再次打开能显示头像。
- Admin 编辑客户时可以替换头像。
- Admin 编辑客户时可以清除头像。
- 正常情况下后端 `/uploads/images` 不应再出现 `scene = customer_avatar` 的新头像上传请求；只有直传失败时才会回退。
- `customers.avatar` 有值时，接口返回可访问 URL。
- `platform_file_objects` 有 `scene = customer_avatar` 的记录。
- 小程序端不需要为了本次后端/Admin 变更改代码。
