# Admin 员工头像 COS 直传对接说明

日期：2026-05-15  
适用端：Admin 租户员工管理  
状态：Admin 已优先走 COS 直传，失败时回退 `/uploads/images`。

## 1. 背景

员工头像原来走：

```text
浏览器 -> Admin Next 代理 -> API /uploads/images -> API 服务器 PUT COS
```

线上日志显示 900KB 左右头像在 API 服务器 PUT COS 时偶发 18-19 秒。为减少中转链路，Admin 员工头像改为优先直传 COS。

## 2. 上传流程

优先路径：

```text
选择头像
-> POST /uploads/cos/direct-init，scene=employee_avatar
-> 浏览器 PUT upload_url
-> POST /uploads/cos/direct-complete
-> POST/PATCH /employees 时写入 storage_path/object_key
```

兜底路径：

```text
直传失败
-> POST /uploads/images，scene=employee_avatar
-> 后端中转上传 COS
-> 返回 storage_path/object_key/path/url
```

## 3. 字段口径

- `employees.avatar` 支持保存稳定 object key、历史 URL 或兼容 path。
- Admin 表单提交时，优先写 `storage_path || object_key || path || url`。
- 后端员工列表、创建、更新接口会把 `avatar` 通过 `resolveStoredFileUrl` 转成可访问 URL。
- Admin 登录态返回的员工头像也会解析为可访问 URL。

## 4. 限制

- 格式：JPG、PNG、WebP、HEIC、HEIF。
- 大小：单张不超过 2MB。
- 直传失败自动回退中转上传。

## 5. 验收标准

- Admin 新增员工时可以上传头像，保存后列表能显示头像。
- Admin 编辑员工时可以替换头像。
- Admin 编辑员工时可以清除头像。
- 正常情况下后端 `/uploads/images` 不应再出现 `scene = employee_avatar` 的新头像上传请求；只有直传失败时才会回退。
- `platform_file_objects` 有 `scene = employee_avatar` 的记录。
