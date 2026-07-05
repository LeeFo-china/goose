# 微信支付开通申请合并后 smoke 记录

日期：2026-07-01

## 范围

- 分支 `feature/wechat-pay-applyments` 已 fast-forward 合并到 `main`。
- migration `20260701210000_wechat_pay_applyments.sql` 已应用到远端数据库。
- API 服务监听 `3000`，Admin 服务监听 `3010`。

## Migration

执行前 `supabase migration list` 显示：

- `20260701210000` 只存在 Local。

执行：

```bash
PGSSLMODE=disable supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --yes
```

执行后 `supabase migration list` 确认：

- `20260701210000 | 20260701210000`

说明：当前数据库入口拒绝 TLS，Supabase CLI 需要显式设置 `PGSSLMODE=disable`。

## API Smoke

租户账号：

- `188****0001 / 风清扬`
- tenant ID：`3eebca47-961f-4899-b976-a3d3208d326b`
- 租户：固始晴天装饰工程有限公司

平台账号：

- `199****0001 / Dev 超级管理员`
- roles：`system_admin`, `platform_admin`

执行链路：

1. `POST /admin/auth/login`：租户账号 `200`
2. `GET /finance/wechat-pay/applyment/current`：当前无申请
3. `POST /finance/wechat-pay/applyments`：创建草稿 `200`
4. `POST /finance/wechat-pay/applyments/:id/submit`：提交 `200`
5. `GET /platform/finance/wechat-pay/applyments?page=1&pageSize=5&status=submitted`：可见 submitted 申请
6. `GET /platform/finance/wechat-pay/applyments/:id`：详情 `200`
7. `POST /platform/finance/wechat-pay/applyments/:id/approve`：审核通过 `200`
8. `POST /platform/finance/wechat-pay/applyments/:id/mark-applying`：标记进件中 `200`
9. `PUT /platform/finance/wechat-pay/applyments/:id/wechat-status`：回填 opened + bound `200`
10. `POST /platform/finance/wechat-pay/applyments/:id/activate-config`：激活配置 `200`
11. `GET /finance/wechat-pay/config`：可见 active 服务商子商户配置

回填结果：

- applyment ID：`5a3709f1-447e-46a7-bf49-627c0133faae`
- payment config ID：`0d28ca36-e61e-4169-8309-49fdbba5b144`
- final status：`active`
- applyment state：`opened`
- AppID binding state：`bound`
- merchant mode：`service_provider_sub_merchant`
- validation status：`unchecked`
- events count：`6`

注意：本次使用的是 smoke 子商户号和 smoke secret ref，只验证开通申请流程闭环，不代表真实微信支付可用。真实小额支付 smoke 需要替换为微信侧实际开通并绑定成功的 `sub_mchid/sub_appid` 和安全密钥引用。

## Admin Smoke

Playwright 只读访问结果：

| 页面 | 账号 | 结果 |
| --- | --- | --- |
| `/finance/wechat-pay/applyment` | `188****0001` | `200`，可见支付开通和已启用状态 |
| `/platform/wechat-pay/applyments` | `199****0001` | `200`，可见支付进件列表 |
| `/platform/wechat-pay/applyments/5a3709f1-447e-46a7-bf49-627c0133faae` | `199****0001` | `200`，可见支付进件详情 |

页面 smoke 结果：

- 未跳回登录页
- 未发现非预期 4xx/5xx
- 未发现前端 console error
- 未发现 page error

## 修复记录

Admin 首次 smoke 暴露两个问题：

1. 租户支付开通页和平台列表的 client component 导入了 server-only request 模块，触发 `next/headers` 不能进入 client bundle 的 Next.js 运行时错误。
2. 平台模式仍渲染租户通知菜单，导致 `/api/backend/notifications/summary` 返回 `403` 并产生 console error。

修复：

- 将微信支付申请的纯类型、状态文案和时间格式化移动到 client-safe shared 模块。
- client panel/table 只导入 shared 模块，不再导入 server-only request 模块。
- 平台详情页同步从 shared 模块导入展示工具。
- AdminShell 在平台模式下不渲染租户通知菜单。

## Verification

```bash
bun test ./packages/domain/src/permission.test.ts
pnpm --dir apps/admin exec bun test components/finance/finance-wechat-pay-applyment-page-layout.test.ts components/platform-wechat-pay/platform-wechat-pay-applyments-page-layout.test.ts components/layout/admin-shell-platform-mode.test.ts components/finance/finance-module-tabs.test.ts
cd apps/api && bun test src/schema/wechat-pay-applyments.test.ts src/services/wechat-pay-applyments.test.ts src/services/wechat-pay-migration-contract.test.ts src/types/database-wechat-pay-contract.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/admin run check
bun run api:check-file-size
bun run check:file-size
bun run check:permission-boundaries
git diff --check
```

结果：

- domain tests：`4 pass`
- admin targeted tests：`13 pass`
- api targeted tests：`18 pass`
- API typecheck：通过
- Admin check：通过
- file-size checks：通过
- permission boundary check：通过
- `git diff --check`：通过
