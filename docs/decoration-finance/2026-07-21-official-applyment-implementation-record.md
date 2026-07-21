# 微信支付正式进件实施与验收记录

**日期：** 2026-07-21
**范围：** 平台服务商模式下的租户特约商户正式进件，覆盖资料加密、素材上传复用、提交、状态同步、签约状态展示和租户支付配置激活。
**结论：** Task 1-9 已完成代码与模拟链路验收；未调用微信真实进件接口，未创建真实微信进件申请。

## 1. 实施基线

| 能力 | 版本或提交 |
| --- | --- |
| 正式进件表结构、权限、提交认领 RPC | migration `20260721130000` |
| 原子激活租户支付配置 RPC | migration `20260721170000` |
| 正式进件存储 | `3e0fe757` |
| 敏感资料加密 | `a9a45137` |
| 微信支付进件网关 | `2ff803f6` |
| 素材上传与复用 | `bee695a8` |
| 正式提交 | `1d25844e` |
| 官方状态同步 | `f1a030f4` |
| 租户申请表单 | `10ff0c02` |
| 原子激活 | `a786c613` |
| 平台进件控制台 | `292c51f1` |

数据库迁移使用版本库 migration 应用；`supabase migration list` 的 Local/Remote 已对齐到 `20260721170000`。激活 RPC 在同一数据库事务内创建或更新租户支付配置、更新申请状态、清除进件敏感密文并写入审计事件。

## 2. 只读 preflight

执行入口：

```bash
cd apps/api
bun run wechat-pay:applyment-preflight -- --applyment-id=<UUID>
```

脚本只读取申请、加密资料和平台服务商配置，不下载 COS 文件、不上传微信素材、不提交进件、不同步微信状态，也不修改数据库。输出固定为：

```json
{
  "ready": false,
  "blockers": [
    { "code": "APPLYMENT_SENSITIVE_PAYLOAD_MISSING" },
    {
      "code": "APPLYMENT_MEDIA_TYPE_UNSUPPORTED",
      "category": "license_copy"
    }
  ]
}
```

输出字段仅允许 `ready`、`blockers[].code`、`blockers[].field` 和 `blockers[].category`。不会输出姓名、手机号、身份证号、银行卡号、密文、私钥、APIv3 key、证书正文、对象 key、签名 URL 或微信原始请求体。

## 3. 模拟微信状态链

测试文件：`apps/api/src/scripts/wechat-pay-official-applyment-mock-e2e.test.ts`

固定模拟标识：

- applyment ID：`33333333-3333-4333-8333-333333333333`
- business code：`1561816121_WPA202607210001`
- WeChat applyment ID：`2000002124775691`
- payment config ID：`55555555-5555-4555-8555-555555555555`

模拟状态链：

```text
approved
-> applying
-> APPLYMENT_STATE_AUDITING / reviewing
-> APPLYMENT_STATE_TO_BE_CONFIRMED / account_verifying
-> APPLYMENT_STATE_TO_BE_SIGNED / signing
-> APPLYMENT_STATE_SIGNING / opening
-> APPLYMENT_STATE_FINISHED / opened
-> active
```

验收结果：

- 首次提交模拟超时后，按同一个 business code 查询并重试。
- 两次提交使用同一份请求及同一组 MediaID；附件解析和素材解析只执行一次。
- 全链路保持同一个 business code 和 WeChat applyment ID。
- 状态审计严格记录 `applying -> reviewing -> account_verifying -> signing -> opening -> opened -> active`。
- 激活后申请绑定 active 租户支付配置，且关联中央服务商支付配置。
- 激活后敏感密文、敏感资料版本和敏感资料存在标记均已清除。
- API 投影不包含身份证号、银行卡号、进件密文、商户私钥或密文字段名。

此测试使用内存仓储、内存素材缓存和 mock 微信网关，没有访问微信、COS 或远端数据库。

## 4. Admin 验收证据

本地隔离服务：API `http://127.0.0.1:3100`，Admin `http://127.0.0.1:3110`。

- 桌面端进件详情：`/tmp/gooes-applyment-after-desktop.png`
- 移动端进件详情：`/tmp/gooes-applyment-after-mobile.png`
- 移动端审核区：`/tmp/gooes-applyment-review-mobile.png`

已核对租户资料、官方状态、审计时间线和后端 `available_actions`；Admin 不本地推导进件动作。页面验收未执行提交微信、同步微信状态或激活配置。

## 5. 安全与运行前置

真实进件前必须同时满足：

1. `tenant_service_provider` 中央支付配置为 active 且 validation status 为 valid。
2. 商户号、平台小程序 AppID、商户 API 证书序列号、回调地址和 `applyment`/`project_payment` 渠道已配置。
3. secret bundle 引用可读取，bundle revision 与中央配置一致，并包含商户私钥、APIv3 key、微信支付公钥 ID 和公钥正文。
4. `APP_CONFIG_ENCRYPTION_KEY` 已配置且与申请资料加密时一致。
5. 申请资料通过只读 preflight；附件属于申请租户、元数据完整且为不超过 2 MB 的 JPG、PNG 或 BMP。
6. 操作账号具备正式提交或状态同步权限；修复动作继续使用独立权限，不默认授予。
7. 真实进件前完成数据库备份、回滚窗口确认和微信商户平台操作人值守。

密钥、证书正文和身份证/银行卡原文不得进入 Git、文档、日志、Admin 响应或截图。

## 6. 验证与剩余边界

已执行并通过：

```bash
cd apps/api
bun test src/services/wechat-pay-applyment-*.test.ts \
  src/services/wechat-pay-official-applyment-migration-contract.test.ts \
  src/controllers/platform-wechat-pay-applyments/routes.test.ts \
  src/scripts/wechat-pay-applyment-preflight.test.ts \
  src/scripts/wechat-pay-official-applyment-mock-e2e.test.ts
# 75 pass, 0 fail

cd ../..
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
git diff --check
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

API typecheck/build/file-size、Admin typecheck/file-size/production build 和 `git diff --check` 均通过；migration Local/Remote 均包含 `20260721130000` 与 `20260721170000`，无未应用 migration。

安全扫描结果：Admin 中不存在 `sensitive_payload_ciphertext`；`identity_number`、`bank_account_number`、`private_key_pem` 和 `api_v3_key` 仅出现在租户资料写入表单、平台密钥写入表单及对应防泄露测试，不存在于正式进件详情响应类型。本文档只记录字段名，不包含实际敏感值。

全量 `bun test` 的已知基线为 2095 pass、68 fail、2 errors，失败来自仓库既有 Bun 全局 `mock.module` 跨测试污染；本功能以隔离 focused suite、API typecheck/build 和 Admin check/build 作为验收门禁。该问题不影响本次 mock E2E 结果，但应作为独立测试基础设施任务处理。

下一步属于 Task 10，必须再次取得明确授权后才可执行：对指定申请运行只读 preflight、提交真实微信进件、同步官方状态，并在完成后执行真实小额支付 smoke。本记录没有执行 Task 10。
