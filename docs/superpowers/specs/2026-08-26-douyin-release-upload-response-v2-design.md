# 抖音发布上传响应 v2 设计

## 问题

`20260825102000_split_douyin_release_qr_stages.sql` 为发布记录新增了
`latest_test_qr_url` 和 `audit_qr_url`，但原上传 claim RPC 仍返回旧字段集合。
API 的严格 `ClaimedUploadReleaseSchema` 已要求两个新字段，因此 RPC 创建并锁定
发布记录后，repository 会将其合法旧响应判为
`DOUYIN_MINIAPP_RELEASE_REPOSITORY_RESPONSE_INVALID`。

## 方案

新增 `get_or_create_and_claim_douyin_miniapp_release_upload_v2`。新 RPC 保留原函数
的校验、锁、幂等和冲突语义，仅在返回表中补齐两个二维码阶段字段。旧 RPC 保留，
保证数据库先部署、API 后部署期间的旧实例仍可运行。API repository 切换到 v2，
并继续使用严格响应 schema，不做字段猜测或二次查询。

## 安全与发布

- 新函数使用 `SECURITY DEFINER` 和固定 `search_path = pg_catalog, public`。
- 撤销 PUBLIC、anon、authenticated 执行权限，仅向 service_role 授权。
- 只新增 forward migration，不修改已应用 migration，不修改表数据。
- 回滚时先部署调用旧 RPC 的兼容 API，再撤销并删除 v2 RPC。

## 验证

- repository 测试必须证明调用 v2，并接受包含两个二维码字段的严格响应。
- migration contract 必须锁定函数字段、原子 claim 语义、ACL 和旧函数保留。
- 开发库执行 migration 后核对 migration list、catalog 和真实 RPC 返回列。
- 完成 API focused tests、`bun run api:check`、开发 API 部署及健康检查。
