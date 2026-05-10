# 阶段 5H Admin 对接文档：多租户隔离验收

日期：2026-05-10

## 1. 结论

本阶段不新增 admin 页面，也不改变 admin 业务交互。

新增的是验收脚本：

```bash
bun run seed:tenant:phase5h
bun run verify:tenant:phase5h
```

用于上线前验证 admin 相关业务接口是否按租户隔离。

## 2. Admin 需要关注的接口

脚本覆盖以下 admin 常用接口：

| 模块 | 接口 |
| --- | --- |
| 客户 | `GET /customers` |
| 项目 | `GET /projects/status` |
| 员工 | `GET /employees` |
| 组织 | `GET /departments` / `GET /posts` / `GET /roles` |
| 费用 | `GET /expense-requests` |
| 工序验收 | `GET /project-acceptances` |
| 施工日志 | `GET /project_logs/projects` |
| 摄像头 | `GET /project-cameras/projects` |
| 营销页 | `GET /marketing-pages` |
| H5 线索 | `GET /marketing-leads` |
| 员工拓客 | `GET /tenant-share-links` |
| 通知 | `GET /notifications` |
| 待办 | `GET /task-center/todos` |
| 自媒体 | `GET /admin/social-video/scripts` |
| 自媒体用量 | `GET /admin/social-video/usage-summary` |
| 平台接口防护 | `/platform/tenants` / `/platform/leads` / `/platform/audit-logs` |

## 3. 推荐验收方式

准备：

- 一个新租户管理员 token。
- 若干默认租户或另一个租户的资源 ID。

执行：

```bash
API_BASE_URL=https://api.goodcms.cn \
TENANT_VERIFY_TOKEN=<新租户管理员 token> \
TENANT_OWN_PROJECT_ID=<当前租户项目ID> \
TENANT_FORBIDDEN_IDS=<默认租户资源ID,逗号分隔> \
STRICT_TENANT_VERIFY=1 \
bun run verify:tenant:phase5h
```

如需先构造一组 A/B 租户验收数据，可执行：

```bash
bun run seed:tenant:phase5h --format=shell > /tmp/gooes-phase5h.env
```

本轮本地严格模式验收结果：`27 passed, 0 failed, 0 skipped`。

生产部署后，通过服务器本机 API 严格模式验收结果：`27 passed, 0 failed, 0 skipped`。

`api.goodcms.cn` 已完成 DNS、nginx 反代和 HTTPS 证书配置。公网 API 严格模式验收结果：`27 passed, 0 failed, 0 skipped`。

注意：

- `https://admin.goodcms.cn/api/backend` 是 admin BFF 代理，依赖 admin 登录 cookie，不适合作为脚本直接 Bearer token 验证入口。
- `https://api.goodcms.cn` 是后端公网 API 入口，反代到 `127.0.0.1:3000`，可用于脚本验证和小程序/外部联调。

如果有其它租户详情 ID，建议一起传入：

```bash
TENANT_OTHER_CUSTOMER_ID=<其它租户客户ID>
TENANT_OTHER_PROJECT_ID=<其它租户项目ID>
TENANT_OTHER_EXPENSE_REQUEST_ID=<其它租户费用ID>
TENANT_OTHER_PROJECT_ACCEPTANCE_ID=<其它租户验收ID>
TENANT_OTHER_CAMERA_ID=<其它租户摄像头ID>
TENANT_OTHER_MARKETING_PAGE_ID=<其它租户营销页ID>
TENANT_OTHER_SOCIAL_VIDEO_TRANSCRIPTION_ID=<其它租户转写任务ID>
```

## 4. 通过标准

- 新租户 token 查询列表时，不出现默认租户或其它租户资源 ID。
- 新租户 token 访问其它租户详情资源时返回 400 / 403 / 404。
- 新租户 token 访问 `/platform/*` 时返回 400 / 403 / 404。
- 严格模式下无 fail、无 skip。

## 5. 后续处理

如果脚本失败：

1. 先记录失败接口和响应片段。
2. 排查对应 service/repository 是否缺少 `tenant_id` 条件。
3. 修复后重新跑脚本。
4. 通过后再进入阶段 6。
