# Admin COS 直传真实验收计划

状态：已落计划，待在具备腾讯云 COS 配置的开发/预发环境执行。

## 背景

Admin 端已经把员工头像、客户头像、费用审批附件、H5 活动页图片、工序验收图片等入口收口到统一工具：

- `apps/admin/lib/cos-direct-upload.ts`
- `POST /uploads/cos/direct-init`
- `PUT upload_url`
- `POST /uploads/cos/direct-complete`

本计划用于补齐真实文件上传验收，避免只依赖类型检查和页面冒烟测试。

## 前置条件

1. API 服务使用真实 COS 配置启动：
   - `PLATFORM_STORAGE_PROVIDER=tencent_cos`
   - `TENCENT_COS_SECRET_ID`
   - `TENCENT_COS_SECRET_KEY`
   - `PLATFORM_COS_BUCKET`
   - `PLATFORM_COS_REGION`
   - `PLATFORM_COS_PUBLIC_BASE_URL`
   - `PLATFORM_COS_UPLOAD_USE_ACCELERATE`
   - `PLATFORM_FILE_ACCESS_POLICY`
2. Admin 服务和 API 服务均指向同一套开发/预发数据库。
3. COS bucket 已配置 CORS，允许 Admin 来源执行 `PUT`。
4. 测试账号具备对应业务权限。
5. 准备测试文件：
   - `avatar-small.jpg`：100KB 以内。
   - `avatar-large.jpg`：1MB 到 3MB。
   - `receipt.png`：费用附件。
   - `acceptance-1.jpg`、`acceptance-2.jpg`：工序验收多图。
   - `h5-banner.jpg`：H5 活动页图片。

## 验收范围

| 场景 | Admin 入口 | scene | 期望 |
| --- | --- | --- | --- |
| 员工头像 | 员工新增/编辑 | `employee_avatar` | 上传后员工头像可预览，刷新后仍可访问 |
| 客户头像 | 客户新增/编辑 | `customer_avatar` | 上传后客户头像可预览，刷新后仍可访问 |
| 费用附件 | 费用审批登记/编辑附件 | `expense_request` | 附件保存到审批记录，详情页可打开 |
| H5 图片 | H5 活动页编辑器图片字段 | `h5_marketing_page` | 图片保存后预览页可访问 |
| 工序验收图片 | 项目详情 > 工序验收 | `project_acceptance` | 多图保存成功，刷新详情后仍展示 |

## 执行步骤

1. 启动服务。
   ```bash
   bun run api:dev
   pnpm --dir apps/admin dev
   ```

2. 打开浏览器 DevTools Network，过滤：
   ```text
   /uploads/cos/direct-init
   /uploads/cos/direct-complete
   cos.
   ```

3. 逐个执行“验收范围”中的场景。

4. 每个上传动作必须满足：
   - `direct-init` 返回 200。
   - 浏览器直接 `PUT upload_url` 返回 200 或 204。
   - `direct-complete` 返回 200。
   - 业务保存接口 payload 中保存稳定 object key 或后端认可的文件对象引用，不保存短期 signed URL。
   - 页面刷新后图片/附件仍可访问。

5. 数据库抽验。
   ```sql
   select scene, object_key, access_mode, created_at
   from platform_file_objects
   where created_at > now() - interval '2 hours'
   order by created_at desc
   limit 50;
   ```

6. COS 控制台抽验。
   - 对照 `platform_file_objects.object_key`，确认 bucket 中存在对象。
   - 私有场景不要求 object 公网直开，必须通过后端返回的 signed URL 或 public-url 解析链路访问。

## 失败注入

1. 临时改错 `PLATFORM_COS_BUCKET` 或关闭 COS CORS，重启 API。
2. 重新执行员工头像上传。
3. 期望：
   - 前端显示明确错误。
   - 不自动回退 `/uploads/images`。
   - 不创建业务记录中的坏图片引用。
4. 恢复配置后重新上传，确认链路恢复。

## 验收记录模板

| 时间 | 环境 | 场景 | 文件 | init | PUT | complete | 刷新后可访问 | object_key | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 待填 | dev/pre | 员工头像 | avatar-small.jpg | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |

## 通过标准

- 表格中的全部场景至少各完成 1 次真实上传。
- 工序验收图片完成 2 张并发/连续上传验收。
- `platform_file_objects` 有对应 scene 和 object key。
- 页面刷新后无 403、404、过期 signed URL 写库问题。
- 失败注入不会回退 `/uploads/images`，不会产生坏业务引用。

## 回归命令

代码侧改动后继续执行：

```bash
pnpm admin:check
pnpm --dir apps/admin build
pnpm --dir apps/admin test:e2e
```

