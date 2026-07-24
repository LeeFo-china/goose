# 微信支付进件 OCR-first 验收与交接

日期：2026-07-24
对应设计：`docs/superpowers/specs/2026-07-23-wechat-pay-applyment-ocr-first-ux-design.md`
状态：Task 9 Step 3-6 已验收，待按发布流程上线

## 1. 发布边界

- 本次交付覆盖租户 Admin 的“上传资料、核对识别、补充信息、确认提交”四阶段流程，以及平台审核所需的 readiness 展示。
- OCR 只提供录入建议。识别结果不会静默覆盖人工值，也不会自动提交进件、平台审核或真实微信支付申请。
- 真实环境 OCR capability 在验收时关闭，因此真实 API/Admin smoke 只验证手工填写降级；未读取、复制、截图或记录任何 OCR 值，也未调用腾讯云 OCR。
- OCR 成功、重试、恢复、字段冲突、readiness 定位和幂等路径由 mock backend 专用 E2E 覆盖。
- 未执行平台审核、`submit-to-wechat` 或真实微信进件；八项本功能 migration 已应用并确认
  Local/Remote 对齐，未执行 `migration repair`。

## 2. 客户端与 API 契约

### 四阶段

1. `上传资料`：选择主体类型和超级管理员身份，私有直传附件；capability 关闭时保留上传并显示手工填写降级。
2. `核对识别`：按资料核对租户档案、OCR 建议和人工值；未知字段不得动态写入业务 payload。
3. `补充信息`：填写 OCR 无法可靠获得的联系人、结算和经营信息。
4. `确认提交`：集中显示 `submission_readiness.blockers`；用户明确确认后才允许提交平台审核。

字段来源优先级保持为“已确认人工值 > 当前文件 OCR 值 > 租户档案 > 空值”。替换附件时，仅空值和仍等于旧 OCR 值的字段可接受新建议；人工修改冲突必须由用户选择。

### 上传与 OCR

```text
POST /uploads/cos/direct-init
PUT  <short-lived upload URL>
POST /uploads/cos/direct-complete

GET  /ocr/capabilities?scene=wechat_pay_applyment
POST /ocr/recognitions
GET  /ocr/recognitions/:id
```

- `direct-complete` 返回的 `file_id` 是 OCR 请求的 `file_object_id`，客户端不得从 object key 猜测文件 ID。
- 创建识别时使用 `scene=wechat_pay_applyment`、受支持的 `document_type`、`file_object_id` 和 UUID 幂等键；草稿已存在时才传 `subject_type/subject_id`。
- 创建或更新草稿时，后端会批量校验附件文件处于 active、租户和场景一致、object key
  精确匹配，并要求当前员工是上传人或该文件已可靠绑定到当前申请；客户端提交的附件 ID
  和 object key 不作为归属事实。
- 创建识别返回 `pending/processing` 时，Admin 会轮询识别详情直到
  `succeeded/failed` 终态；处理中结果不能用空字段进入“待核对”状态。
- capability 返回空列表是关闭状态，不是异常。客户端必须保留附件和手工录入路径。
- 私有附件预览使用短时地址，不记录永久公开 URL。

### 进件草稿

```text
GET  /finance/wechat-pay/applyment/current
POST /finance/wechat-pay/applyments
GET  /finance/wechat-pay/applyments/:id
PUT  /finance/wechat-pay/applyments/:id
POST /finance/wechat-pay/applyments/:id/draft-session
POST /finance/wechat-pay/applyments/:id/submit
```

- `draft-session` 由数据库签发递增 epoch，并把该 epoch 的 revision 从 `0` 重新开始。
- 草稿更新只接受当前 epoch 且严格递增的 revision。RPC 的稳定字面返回值为 `stale_epoch`、`same_or_older_revision` 和 `applied`。
- 需要审计的草稿更新与 `updated` 事件同事务；低风险自动保存允许不写事件。首次草稿
  与 `created` 事件、提交状态转换与 `submitted` 事件也分别在同一事务完成。
- 提交以申请 ID 作为稳定幂等键。已提交重试返回幂等结果，不重复写 `submitted` 事件。
- `submission_readiness` 是是否可提交及阻塞项定位的唯一后端事实来源，前端不复制一套必填规则。

## 3. Migration 与真实数据库

已应用并只读复核以下八个本功能版本：

```text
20260723130000
20260723133000
20260724110000
20260724130000
20260724150000
20260724170000
20260724173000
20260724200000
```

并行开发已先应用
`20260724190000_fix_douyin_authorization_event_upsert_alias.sql`；本分支同步了完全相同的
原始文件后再应用 `20260724200000`，避免 migration 历史漂移。`supabase migration list`
的 Local/Remote 共 `360` 条、差异 `0`，未执行 repair。
后六项本功能 migration 分别用于草稿 revision、跨页面 epoch fencing、需要审计的草稿更新与
事件原子写入、首次草稿与 `created` 事件原子创建，以及附件归属 JSONB containment
查询的 GIN 索引和历史附件可信文件 ID 回填。

历史附件回填只接受“同租户、同场景、active、同 object key、同申请创建人且唯一命中”
的文件。只读复核结果为附件 `4` 个、可信绑定 `3` 个、无法匹配并保持惰性 `1` 个、
错误绑定 `0` 个；无法匹配的旧附件没有预览能力。首次 apply 因 PostgreSQL 不支持
`min(uuid)` 在事务内失败并完整回滚，改为有序 `array_agg(uuid)[1]` 且增加 migration
契约测试后成功应用。

本机执行 Supabase 类型生成时因 Docker daemon 不可用而无法连接 shadow database；
`apps/api/src/types/database.ts` 已按远端已应用的
`create_tenant_wechat_pay_applyment` RPC 契约同步函数类型，并由 API TypeScript
检查覆盖。恢复 Docker 后应重新生成数据库类型并确认无差异。

使用两个独立 `Bun.SQL` 连接完整重跑事务验证，脱敏结果保存在：

```text
/tmp/wechat-pay-applyment-task9-db-verify-redacted.json
/tmp/wechat-pay-applyment-task9-migration-summary-redacted.txt
```

结果：

- 两连接并发提交只有一次状态转换，结果分别为 `submitted`、`idempotent`，只有一条 `submitted` 事件。
- 同一幂等键重试不增加事件。
- 新 draft session 的 epoch 递增；旧 epoch 返回 `stale_epoch`。
- 当前 epoch 的 revision `1` 返回 `applied`，持久化 revision 为 `1`，只写一条原子 `updated` 事件。
- 同 epoch 的相同或更旧 revision 返回 `same_or_older_revision`。
- 对事件表加排他锁后，另一连接以 `300ms` statement timeout 分别验证草稿更新和提交。事件插入失败均返回 SQLSTATE `57014`，申请状态、`submitted_at`、revision 和事件写入全部回滚。
- `finally` 清理后测试申请 `0` 条、测试事件 `0` 条。
- 两个并发首次创建请求返回 `200/400`，仅一条申请和一条 `created` 事件落库，另一条
  返回稳定 `WECHAT_PAY_APPLYMENT_EXISTS`；清理后申请剩余 `0` 条。
- 附件归属查询在强制禁用顺序扫描的 `EXPLAIN ANALYZE` 中命中
  `tenant_wechat_pay_applyments_attachments_gin_idx`，节点为 `Bitmap Index Scan`。

验证脚本只在 `/tmp`，未纳入仓库。纯文本 RPC 使用 `jsonb_build_object` 包装，JSON 参数通过 `::text::jsonb` 传入，`timestamptz` 通过文本往返保留微秒。结果不包含连接串、密钥、租户、人员、申请或附件标识。

## 4. 测试结果

### `test:all` 归因

分支新增的唯一失败来自 `apps/api/src/services/uploads.test.ts` 顶层 `mock.module` 污染 Bun 同进程模块缓存，使后续私有文件 URL resolver suite 命中错误 mock。按 TDD 先用最小双 suite 复现 `11 pass / 3 fail`，再只修改测试隔离：改为针对真实单例的 `spyOn`，并在 suite 结束时逐个 `mockRestore()`，不恢复其他 suite 的 mock。生产代码未改动。

修复后：

- 最小双 suite：`14 pass / 0 fail`。
- 分支与 main 使用完全相同的 `bun run test:all` 命令和失败签名比较。
- main 基线：`77` 个唯一失败签名。
- 分支：`77` 个唯一失败签名，`branch-only=0`、`main-only=0`、`shared=77`。

因此全量命令仍为红色，但没有本分支回归。共享基线主要包括 release contract 的历史 migration 数量断言、Web server 数量断言，以及 API/Admin 的既有跨 suite mock/order 问题；未在本任务中掩盖或扩大范围。

新增上传与替换 E2E 首次运行时发现：四阶段只挂载当前阶段控件，附件 checkpoint
从当前 `FormData` 构造全字段草稿会把未挂载字段写成 `null`。现已改为未挂载字段依次
回退最新本地待保存快照和服务器当前值，而当前阶段中被用户明确清空的控件仍提交
`null`。持久化 fallback 只用于普通字段；手机号、银行卡号和身份证号等敏感 replacement
只能从当前控件或最新本地待保存快照进入 payload，绝不从服务端掩码反推。schema 回归
测试和“人工输入后立即替换附件并刷新”E2E 同时覆盖该边界。

脱敏日志：

```text
/tmp/wechat-pay-applyment-task9-test-all-main.log
/tmp/wechat-pay-applyment-task9-test-all-branch-review-fix.log
/tmp/wechat-pay-applyment-task9-api-mock-pollution-green-final.log
```

### 专项与构建

- API 全部 OCR/微信支付专项：`629 pass / 0 fail`，`1771` assertions，`79` files；
  附件归属、草稿敏感数据、migration 与 OCR 并发终态组合 `52 pass / 0 fail`。
- Admin 全部 OCR/微信支付进件专项：`245 pass / 0 fail`，`1028` assertions，
  `32` files。
- Domain 全量：`35 pass / 0 fail`，`175` assertions，`7` files；domain build 成功。
- `pnpm run api:check`：TypeScript、Bun build、文件大小检查通过。
- `pnpm --dir apps/admin check`：文件大小、Next type generation、TypeScript 通过。
- `pnpm --dir apps/admin build`：Next.js production build 通过，`65` 个静态页面生成成功。
- `pnpm --dir apps/admin test:e2e:wechat-pay-applyment`：`9 pass / 0 fail`，其中新增覆盖上传后自动识别、识别失败重试、替换附件人工值保护和刷新恢复；mock backend 强制校验 `direct-init → PUT → direct-complete → recognition` 顺序、scene、UUID 幂等键和已完成上传的 file object，并在测试结束后关闭。
- 默认 Playwright 配置不收集三项 mock-only applyment spec；常规 E2E 不依赖 `127.0.0.1:3998` mock。

对应日志位于 `/tmp/wechat-pay-applyment-task9-*.log`，未提交。

## 5. API/Admin Browser Smoke

仅从当前 worktree 启动：

```text
API   http://127.0.0.1:3100
Admin http://127.0.0.1:3110
```

桌面 `1440x900` 和窄屏 `390x844` 均通过：

- 首阶段可见主体类型、超级管理员身份和资料上传入口。
- 四个阶段名称和顺序正确，窄屏单列布局无页面级横向溢出。
- capability 关闭时明确显示“证照识别暂不可用”，并保留下一步手工填写。
- 进入补充信息后点击下一步，浏览器把焦点定位到首个缺失必填字段；mock E2E 另行证明服务端 readiness blocker 可定位到对应阶段。
- console error `0`、page error `0`、非预期 HTTP `>=400` 响应 `0`。
- 未点击“提交平台审核”；仅触发既有草稿自动保存，没有填写或替换业务资料。

脱敏结果：

```text
/tmp/wechat-pay-applyment-task9-browser-smoke-redacted.json
```

smoke 结束后 `3100`、`3110` 均已停止监听。

## 6. orange 只读交接

只读搜索了 `/Users/leefo/Public/work/orange` 的 `src/` 和 `docs/`，没有修改、格式化、构建、生成、暂存或提交任何 orange 文件。

当前 orange 没有租户微信支付进件页面或对应 service；现有能力主要是通用 COS 上传和其他微信支付场景，不能把 Admin 页面直接映射为小程序入口。后续若产品决定在小程序提供进件，应由 orange 团队：

1. 在上传类型中稳定保留 `direct-complete.file_id`，业务侧命名为 `file_object_id`。
2. 先查询 capability，再决定显示识别入口；关闭或失败时保留手工录入。
3. 用一次用户动作一个 UUID 的方式创建识别并复用幂等键，按字段白名单映射结果。
4. 复用本文件的 epoch/revision、readiness 和显式提交契约，不在小程序复制审核规则。
5. 不直连腾讯云、不保存 OCR 密钥、不自动提交平台审核或真实微信进件。

当前 Admin 发布不依赖 orange 改动。
