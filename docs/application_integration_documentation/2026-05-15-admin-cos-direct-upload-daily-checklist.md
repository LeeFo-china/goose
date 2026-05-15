# Admin 2026-05-15 COS 直传对接执行清单

日期：2026-05-15

## 今日 Admin 需要对接/验收的范围

| 模块 | 文档 | 状态 | Admin 动作 |
| --- | --- | --- | --- |
| 员工头像 | `2026-05-15-admin-employee-avatar-cos-direct-upload.md` | 已接入 | 验收新增、编辑、清除、预览 |
| 客户头像 | `2026-05-15-admin-customer-avatar-cos-upload.md` | 已接入 | 验收新增、编辑、清除、预览 |
| 工序验收图片 | `2026-05-15-miniprogram-project-acceptance-cos-direct-upload.md` | Admin 已接入 | 验收现场照片、整改图片、流程记录预览 |
| 费用审批凭证 | `2026-05-15-admin-expense-request-cos-direct-upload.md` | 已接入 | 重点验收登记打款凭证上传和预览 |
| COS 加速和签名预览 | `2026-05-15-platform-cos-signed-preview-and-upload-accelerate.md` | 已接入 | 验收上传 URL 和图片预览策略 |

## 统一技术口径

- Admin 图片上传优先走 COS 直传。
- 正常路径不再走 `POST /uploads/images`。
- 上传三段式：

```text
POST /uploads/cos/direct-init
-> PUT upload_url
-> POST /uploads/cos/direct-complete
```

- 上传成功后业务字段保存稳定引用：`storage_path || object_key || path`。
- 图片预览使用后端返回的可访问 URL，或走 `/uploads/public-url?path=...`。
- 当前生产上传域名应为：

```text
windwill-1259348056.cos.accelerate.myqcloud.com
```

## 今日验收顺序

1. 费用审批打款凭证
2. 工序验收图片
3. 员工头像
4. 客户头像
5. 后端慢日志和 `/uploads/images` 回退检查

## 每个模块的验收项

### 费用审批打款凭证

- 登记打款时上传 1 张凭证成功。
- 登记打款时上传多张凭证成功。
- 大图超过 `1.5MB` 时前端压缩后能上传。
- 提交后费用详情里凭证图片能打开。
- `platform_file_objects.scene = expense_request` 有记录。

### 工序验收图片

- 验收项目现场照片上传成功。
- 整改图片上传成功。
- 保存后重新打开验收详情，图片能预览。
- 流程记录中引用图片能打开。
- `platform_file_objects.scene = project_acceptance` 有记录。

### 员工头像

- 新增员工上传头像成功。
- 编辑员工替换头像成功。
- 清除头像成功。
- 员工列表和详情头像能预览。
- `platform_file_objects.scene = employee_avatar` 有记录。

### 客户头像

- 新增客户上传头像成功。
- 编辑客户替换头像成功。
- 清除头像成功。
- 客户列表和详情头像能预览。
- `platform_file_objects.scene = customer_avatar` 有记录。

## 日志验收

生产后端已配置：

```env
UPLOAD_TIMING_LOG_ENABLED=true
UPLOAD_TIMING_LOG_SCENES=project_log_comment,project_log,project_acceptance,expense_request,employee_avatar,customer_avatar
UPLOAD_TIMING_LOG_MIN_DURATION_MS=1000
```

验收时关注：

- 超过 `1000ms` 的上传阶段才应输出 timing 日志。
- 正常 Admin 上传不应出现新的 `/uploads/images` 请求。
- 直传失败时 Admin 应显示明确错误，不应一直 loading。
