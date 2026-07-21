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

preflight 核心逻辑位于 service，CLI 只负责参数解析与安全 JSON 输出。平台详情接口在 `submitted`、`approved` 和 `wechat_editing` 状态返回：

```json
{
  "submission_readiness": {
    "ready": false,
    "review_ready": false,
    "blockers": [
      {
        "code": "APPLYMENT_REQUIRED_FIELD_MISSING",
        "field": "service_phone"
      }
    ]
  }
}
```

- `review_ready` 只判断租户申请资料、附件和敏感资料是否可审核；平台中央支付配置及申请生命周期状态不阻止资料审核。
- `ready` 表示当前申请可直接提交微信，必须同时满足资料、状态和平台服务商配置要求。
- `review_ready=false` 时，详情动作不返回 `approve`，直接调用审核接口也返回 `409 WECHAT_PAY_APPLYMENT_REVIEW_NOT_READY`。
- `ready=false` 时，详情动作不返回 `submit_to_wechat`，直接调用正式提交接口也返回 `409 WECHAT_PAY_APPLYMENT_PREFLIGHT_BLOCKED`。
- 正式提交接口先校验 `platform.wechat_pay.applyment.submit`，无权限时不会运行 preflight 或调用微信。
- 平台普通驳回仅允许用于 `submitted`、`approved` 两个尚未提交微信的状态；申请进入微信审核、账户验证或签约阶段后，直接调用驳回接口返回 `409 WECHAT_PAY_APPLYMENT_STATUS_INVALID`，官方状态只能通过微信查询同步，异常修复继续使用独立权限和原因必填入口。
- 申请进入微信审核、开通或激活阶段后不再返回 `submission_readiness`，避免已完成申请因敏感资料按安全策略清除而显示为“不完整”。

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

- 租户申请页桌面端：`/tmp/gooes-applyment-after-desktop.png`
- 租户申请页移动端：`/tmp/gooes-applyment-after-mobile.png`
- 租户申请页移动端审核区：`/tmp/gooes-applyment-review-mobile.png`
- 平台申请列表桌面端：`/tmp/gooes-platform-applyments-desktop-list.png`
- 平台申请详情桌面端顶部：`/tmp/gooes-platform-applyments-desktop-detail-top-v2.png`
- 平台申请详情桌面端底部：`/tmp/gooes-platform-applyments-desktop-detail-bottom-v2.png`
- 平台申请列表移动端：`/tmp/gooes-platform-applyments-mobile-list-v3.png`
- 平台申请详情移动端：`/tmp/gooes-platform-applyments-mobile-detail-v3.png`
- 平台 readiness 桌面端：`/tmp/gooes-platform-readiness-desktop-viewport.png`
- 平台 readiness 桌面操作栏：`/tmp/gooes-platform-readiness-desktop-action-rail.png`
- 平台 readiness 移动操作栏：`/tmp/gooes-platform-readiness-mobile-action-rail.png`

平台列表筛选已统一使用 shadcn `Select`、`Input` 和 `Button`，支持状态、关键词和重置。平台详情按“平台审核、微信审核、账户验证、商户签约、开通完成、激活收款”展示六阶段进度，安全审核投影按主体证照、法人和超级管理员、经营结算及平台关联分组展示。操作栏使用后端 `submission_readiness` 展示中文待处理项；平台配置阻塞时提供 `/settings?group=payment` 入口。桌面端操作栏随详情工作区滚动保持可见；移动端按“进度、当前操作、审核资料”排序。

支付配置页的证书和公钥上传已收敛为 shadcn 按钮触发，展示中文未选择状态和当前文件名；底层文件字段保持不可见且可参与 `FormData`，表单重置后同步清空文件名。已修复 shadcn `Input` 的 `w-full` 与视觉隐藏样式冲突导致的页面横向溢出，桌面和窄屏文档宽度均不再超过视口。

已核对租户资料、官方状态、附件、审计时间线和后端 `available_actions`；Admin 不本地推导进件动作。页面验收覆盖 1440×1000 和 390×844，无页面级或详情工作区横向溢出、console error 或 4xx/5xx 响应。真实旧申请 `8026f87b-e6de-4bb1-80c6-6aa7066f1759` 的只读详情返回 `review_ready=false`，隐藏生命周期状态后展示 10 个安全待处理项；页面没有“审核通过”按钮，仅保留“驳回租户修改”和“前往支付配置”。验收只执行登录与 GET 请求，未执行审核、驳回、提交微信、同步微信状态、受控修复或激活配置。

2026-07-21 再次通过 CLI 对同一申请执行只读 preflight，结果仍为 `ready=false`。安全阻塞项为：主体类型、法人证件类型及有效期、超级管理员类型、客服电话、结算规则、所属行业、敏感申请资料和平台服务商支付配置缺失；另有当前 `submitted` 生命周期状态提示。该命令未下载 COS 素材、未调用微信、未修改数据库。当前运营动作必须先由平台驳回，租户使用新版表单重新填写并提交；中央 `tenant_service_provider` 配置保存且验证通过后再运行 preflight。

隔离 Admin 必须使用项目实际读取的环境变量启动：

```bash
GOOES_API_BASE_URL=http://127.0.0.1:3100 \
NEXT_PUBLIC_GOOES_API_BASE_URL=http://127.0.0.1:3100 \
pnpm --dir apps/admin exec next dev -p 3110
```

`API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` 不会被 `apps/admin/lib/backend.ts` 读取，不能用于隔离联调。

## 5. 安全与运行前置

真实进件前必须同时满足：

1. `tenant_service_provider` 中央支付配置为 active 且 validation status 为 valid。
2. 商户号、平台小程序 AppID、商户 API 证书序列号、回调地址和 `applyment`/`project_payment` 渠道已配置。
3. secret bundle 引用可读取，bundle revision 与中央配置一致，并包含商户私钥、APIv3 key、微信支付公钥 ID 和公钥正文。
4. `APP_CONFIG_ENCRYPTION_KEY` 已配置且与申请资料加密时一致。
5. 申请资料通过只读 preflight；附件属于申请租户、元数据完整且为不超过 2 MB 的 JPG、PNG 或 BMP。
6. 操作账号具备正式提交或状态同步权限；修复动作继续使用独立权限，不默认授予。
7. 真实进件前完成数据库备份、回滚窗口确认和微信商户平台操作人值守。

平台进件权限在服务端按既有权限模型逐项执行，不再只检查 `isPlatformAdmin`：

- 列表和详情：`platform.wechat_pay.applyment.read`
- 审核通过和驳回：`platform.wechat_pay.applyment.review`
- 人工进度和签约链接：`platform.wechat_pay.applyment.manage`
- 正式提交：`platform.wechat_pay.applyment.submit`
- 官方状态同步：`platform.wechat_pay.applyment.sync`
- 激活租户收款：`platform.wechat_pay.config.activate`
- 异常修复：`platform.wechat_pay.applyment.repair`

后端返回的 `available_actions` 使用同一组权限过滤，前端不会显示当前账号无权执行的动作。

密钥、证书正文和身份证/银行卡原文不得进入 Git、文档、日志、Admin 响应或截图。

## 6. 发布顺序与当前充值阻塞

2026-07-21 核查平台积分充值“平台微信支付暂未启用”时确认：远端 migration `20260720224000` 已开始要求平台支付 profile 具备 `validation_status=valid` 和匹配的 secret bundle revision，但对应 API/Admin readiness 管理代码尚未部署到主服务。远端 `platform_direct_recharge` 当时仍为 `active + unchecked` 且没有 secret bundle revision，数据库在创建订单前即拒绝请求；请求没有到达微信支付，也没有创建充值订单。

这是发布顺序不一致造成的门禁生效，不是小程序 payload、OpenID 或微信网关故障。当前不得通过放宽数据库门禁恢复支付，正确恢复顺序为：

1. 先部署包含支付 profile 保存、密钥 revision 和在线验证能力的 API/Admin。
2. 在平台支付配置页重新上传对应商户的证书与密钥，保存 `platform_direct_recharge`。
3. 执行“验证支付配置”，确认 profile 为 `active + valid`、secret bundle revision 匹配且 readiness 无 blocker。
4. 只读核对后，再在明确授权下执行真实一分钱充值 smoke。
5. `tenant_service_provider` 是租户正式进件的独立中央 profile，必须另行建档、上传服务商密钥并验证；不能复用平台直连商户的验证结果。

后续涉及会立即阻断已有业务的 migration，发布门禁必须使用“兼容 API/Admin 先部署，配置完成并验证，再启用强约束”的顺序；若无法拆分，应安排同一维护窗口原子发布并准备前向回滚 migration。

## 7. 验证与剩余边界

已执行并通过：

```bash
cd apps/api
bun test src/services/wechat-pay-applyment-*.test.ts \
  src/services/wechat-pay-applyments.test.ts \
  src/services/wechat-pay-applyments-activation.test.ts \
  src/services/wechat-pay-applyments-platform-readiness.test.ts \
  src/services/wechat-pay-official-applyment-migration-contract.test.ts \
  src/controllers/platform-wechat-pay-applyments/routes.test.ts \
  src/scripts/wechat-pay-applyment-preflight.test.ts \
  src/scripts/wechat-pay-official-applyment-mock-e2e.test.ts
# 108 pass, 0 fail

cd ../..
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
git diff --check
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

平台 Admin 收口聚焦测试：

```bash
cd apps/admin
bun test \
  components/finance/finance-wechat-pay-applyment-page-layout.test.ts \
  components/finance/finance-wechat-pay-applyment-schema.test.ts \
  components/platform-wechat-pay/platform-wechat-pay-applyments-page-layout.test.ts \
  components/platform-wechat-pay/platform-wechat-pay-applyment-contract.test.ts \
  components/settings/platform-payment-settings-panel.test.ts
# 45 pass, 0 fail
```

API typecheck/build/file-size、Admin typecheck/file-size/production build 和 `git diff --check` 均通过；migration Local/Remote 均包含 `20260721130000` 与 `20260721170000`，无未应用 migration。

隔离环境再次只读验证平台申请列表和申请详情均返回 200；权限收紧后当前平台管理员仍可正常读取，页面无 console error 或 4xx/5xx。支付配置文件字段浏览器 smoke 覆盖 1440×1000 和 390×844，选择文件后显示文件名，页面不存在原生英文文件控件或页面级横向溢出。

安全扫描结果：Admin 中不存在 `sensitive_payload_ciphertext`；`identity_number`、`bank_account_number`、`private_key_pem` 和 `api_v3_key` 仅出现在租户资料写入表单、平台密钥写入表单及对应防泄露测试，不存在于正式进件详情响应类型。本文档只记录字段名，不包含实际敏感值。

全量 `bun test` 的已知基线为 2095 pass、68 fail、2 errors，失败来自仓库既有 Bun 全局 `mock.module` 跨测试污染；本功能以隔离 focused suite、API typecheck/build 和 Admin check/build 作为验收门禁。该问题不影响本次 mock E2E 结果，但应作为独立测试基础设施任务处理。

下一步属于 Task 10，必须再次取得明确授权后才可执行：对指定申请运行只读 preflight、提交真实微信进件、同步官方状态，并在完成后执行真实小额支付 smoke。本记录没有执行 Task 10。
