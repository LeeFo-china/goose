# 抖音装修行业小程序模板运维手册

## 1. 适用范围与操作边界

本文用于 Gooes 平台统一运营的原生抖音装修行业小程序，覆盖第三方服务商回调、授权小程序绑定、模板开发安装、商户版本上传、测试、提审、发布和回滚。

只有同时满足以下条件的员工可以执行平台安装与发布操作：

- 平台管理员身份；
- 有效员工身份；
- `platform.douyin_miniapp.manage` 权限范围为 `all`。

所有发布操作都以单个安装为目标，没有批量发布接口。远端 migration、真实模板上传、商户提审和发布均属于外部状态变更，每次执行前必须取得明确授权。

## 2. 环境配置

生产环境必须配置下列变量。这里只记录变量名和格式要求，不在文档、日志、工单或聊天中粘贴值。

| 变量名 | 用途 | 要求 |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase 项目地址 | 服务端配置 |
| `SUPABASE_PUBLISH` | Supabase publishable key | 服务端现有客户端配置 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务角色访问 | 仅服务端；禁止进入小程序包 |
| `JWT_SECRET` | Gooes 会话签名 | 至少 32 字节的高熵值 |
| `DOUYIN_MINIAPP_SESSION_EXPIRES_IN` | 小程序会话时长 | 可选；代码默认 2 小时，最大 24 小时 |
| `DOUYIN_COMPONENT_APP_ID` | 抖音第三方小程序应用 AppID | 与开放平台服务商主体一致 |
| `DOUYIN_COMPONENT_APP_SECRET` | 第三方应用密钥 | 仅服务端 |
| `DOUYIN_COMPONENT_MESSAGE_TOKEN` | 消息校验 Token | 与开放平台控制台一致 |
| `DOUYIN_COMPONENT_MESSAGE_AES_KEY` | 消息加密 AES Key | 43 位大小写字母或数字；补 `=` 后规范 Base64 解码为 32 字节 |
| `DOUYIN_TEMPLATE_APP_ID` | 模板开发小程序 AppID | 与模板开发安装一致 |
| `DOUYIN_TEMPLATE_APP_SECRET` | 模板开发小程序密钥 | 仅服务端 |
| `DOUYIN_CREDENTIAL_KEYS_JSON` | 授权凭证信封密钥环 | JSON object；每个值是 32 字节标准 Base64 |
| `DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION` | 当前写入密钥版本 | 必须存在于密钥环中 |
| `DOUYIN_SUBJECT_HASH_KEY` | OpenID 等主体标识散列密钥 | 至少 32 字符，仅服务端 |
| `GOOES_DEPLOY_ENV` | 商户版本部署目标 | 仅允许 `development` 或 `production`；由服务器配置 |

小程序 API Origin 由运行环境和商户版本中服务端写入的
`deployment_environment` 共同决定：

| envType | 部署目标 | API Origin |
| --- | --- | --- |
| `development` | 不读取 | `https://api-dev.goodcms.cn` |
| `preview` | `development` | `https://api-dev.goodcms.cn` |
| `preview` | `production` | `https://api.goodcms.cn` |
| `production` | `production` 或旧版本缺失 | `https://api.goodcms.cn` |

商户版本上传时，API 根据自身 `GOOES_DEPLOY_ENV` 写入
`extConfig.deployment_environment`，租户和客户端不能覆盖。体验版缺失或携带非法目标、
正式版显式携带开发目标、未知运行环境或不支持该 API 时均失败关闭，不静默回落。
`deployment_key` 仍只用于商户实例识别。

模板 `0.1.6` 及更早代码把 `preview` 固定到开发 API，不能通过服务端配置原地修复。
生产商户必须上传并确认包含本规则的新模板，再生成新的商户体验版本并重新扫码验收。

启动前检查：

```bash
bun run douyin-mini:check
bun run api:check
```

任何 `DOUYIN_CONFIG_INVALID` 都应按返回的字段名检查配置；错误响应不会返回配置值。

## 3. 开放平台回调配置

按本次获批的目标环境替换 `<API_ORIGIN>`，不附加多余路径或查询参数，禁止跨环境复用回调配置：

| 目标环境 | `<API_ORIGIN>` | 授权边界 |
| --- | --- | --- |
| 开发联调 | `https://api-dev.goodcms.cn` | 仅用于开发 E2E，需取得开发回调配置授权 |
| 生产上线 | `https://api.goodcms.cn` | 不属于开发 E2E，需另行取得生产配置授权 |

| 控制台用途 | 回调 URL | 方法与成功响应 |
| --- | --- | --- |
| 授权事件 | `<API_ORIGIN>/douyin-thirdparty/events/authorization` | `POST`，HTTP 200，纯文本 `success` |
| 消息与 Ticket 事件 | `<API_ORIGIN>/douyin-thirdparty/events/message` | `POST`，HTTP 200，纯文本 `success` |

控制台的消息 Token、EncodingAESKey 必须分别与 `DOUYIN_COMPONENT_MESSAGE_TOKEN`、`DOUYIN_COMPONENT_MESSAGE_AES_KEY` 一致。EncodingAESKey 即使是规范的 43 位无填充 Base64，只要含 `+` 或 `/` 也不满足当前控制台字符集要求，必须重新生成，禁止手工替换字符。上线前用控制台校验功能确认公网证书、DNS、WAF 和请求体透传正常。不要把回调 URL 配到普通小程序会话接口。

空环境的首个合法 `PUSH Ticket` 在完成回调时间窗口、签名、AES 解密和 Component AppID 校验后，
先由 `claim_douyin_authorization_event` 幂等建立 active 组件并申领事件，再由
`complete_douyin_ticket_event` 保存服务端封装后的 Ticket 密文信封并完成事件。首次处理只有完成函数返回成功后
才能响应小写纯文本 `success`；已完成的重复事件可幂等响应 `success`。普通授权、撤销或未知事件不能注册组件，
已有 disabled 组件不会被回调自动启用。不得手工插入组件、事件或 Ticket 数据，也不得绕过两个 RPC 直接写表。

## 4. Migration 门禁

本功能分支相对 `main` 包含以下 7 个抖音 migration，必须按文件名顺序审核和执行：

1. `20260719100000_create_douyin_miniapp_foundation.sql`
2. `20260719101000_create_douyin_miniapp_marketing.sql`
3. `20260719102000_create_douyin_miniapp_releases.sql`
4. `20260719110000_add_douyin_installation_binding_rpc.sql`
5. `20260719190232_create_douyin_authorization_event_ledger.sql`
6. `20260720100000_harden_douyin_platform_installation_management.sql`
7. `20260720110000_add_douyin_authorizer_force_refresh_claim.sql`

先确认目标，再检查本地。审批单必须写明环境和预期 Supabase project ref；执行人用 `supabase projects list` 核对账号可见项目，并将本地已 link 的 project ref 与审批单逐字符比较。目标不一致时禁止运行任何远端命令。

```bash
bun x supabase projects list
```

本地数据库可用时执行：

```bash
bun x supabase start
bun x supabase db reset
bun x supabase migration list --local
```

确认 Local 列完整包含上述版本。远端应用前必须再次逐个审查 SQL，先用只读命令保存目标远端的现状证据，再取得绑定到“环境 + project ref + migration 版本集合”的明确授权：

```bash
bun x supabase migration list --linked
```

未经授权不得运行 `supabase db push`。获批后才执行：

```bash
bun x supabase db push
bun x supabase migration list --local
bun x supabase migration list --linked
```

Local/Remote 任一不对齐时立即停止，禁止在远端 SQL Editor 手工补 DDL/DML。破坏性回滚应先停止回调、会话签发和发布入口；删除凭证表会要求商户重新授权。每个 migration 文件都包含位置不固定的 `Rollback` 注释，执行前必须把相关注释整理成单独回滚方案并再次审批，不能直接把注释当成已批准脚本。

## 5. 授权安装与租户绑定

### 5.1 商户授权

1. 商户通过抖音开放平台授权第三方服务商。
2. 服务端接收 `AUTHORIZED` 或 `UPDATE_AUTHORIZED` 回调，保存加密后的授权凭证和权限快照。
3. 在平台安装列表中确认该 AppID 为 `merchant / authorized_unbound`。
4. 选择目标装修公司租户并调用：

```text
POST /platform/douyin-miniapps/:id/bind
```

请求体只允许 `tenant_id` 和完整 `runtime_config`。`deployment_key` 由服务端生成，客户端不得提交。绑定后确认状态为 `active`，并检查租户名称、AppID、功能开关和隐私政策版本。

### 5.2 模板开发安装

模板开发小程序不能伪装成商户安装。使用独立入口创建：

```text
POST /platform/douyin-miniapps/template-development
```

请求体同样包含目标 `tenant_id` 和完整 `runtime_config`。服务端从 `DOUYIN_TEMPLATE_APP_ID` 建立 `template_development` 安装，不生成 deployment key，也不持有商户授权刷新凭证。每个环境只保留一个与当前组件、模板 AppID、租户一致的记录。

## 6. 模板交付流程

### 6.1 模板库准备

1. 在抖音开发者工具中打开 `apps/douyin-mini`。
2. 本地调试商户安装时，先配置开发 AppID 和部署键并执行
   `bun run douyin-mini:write-ext`；该工具固定写入 `development`，不得用于生产商户构建。
3. 执行 `bun run douyin-mini:check`，再完成 Android、iOS 真机检查。
4. 确认 `project.config.json` 使用固定模板开发 AppID
   `tt0d647bd99301341b01`，经明确授权后从 IDE 上传代码。
5. 平台运营进入 Gooes 平台后台「抖音模板」，核对最新草稿后点击「确认最新模板」。
   服务端负责把该草稿加入模板库并记录唯一的新 `template_id`，不得手工选择商户安装。
6. 同一最新草稿重复确认会返回当前记录，不会重复加入模板。多个 Gooes 环境共享同一抖音模板库时，仅当既有模板的 `template_id` 与最新 `draft_id` 相同，且版本、描述、创建时间全部一致，当前环境才能复用该模板；不得绑定仅元数据相同的历史模板。如果加入后仍没有唯一身份或新增记录证据，流程失败关闭。

部署 `20260813200000_create_douyin_deployable_templates.sql` 前先执行只读预检：

```sql
SELECT installation_id, count(*) AS unfinished_count
FROM public.douyin_miniapp_releases
WHERE status IN (
  'created', 'uploaded', 'testing', 'audit_pending', 'audit_approved'
)
GROUP BY installation_id
HAVING count(*) > 1;
```

结果必须为空。若存在记录，migration 会以
`DOUYIN_UNFINISHED_RELEASE_DUPLICATES_EXIST` 失败关闭；不得手工修改数据库，必须核对抖音版本证据后提交单独评审的数据修复 migration。

开发库安装 `82061c96-29ac-4426-baff-5efc1061fbc8` 的历史 `0.1.1`、`0.1.2`
体验版已由 `0.1.3` 替代，由
`20260813190000_reconcile_dev_douyin_testing_releases.sql` 在严格匹配安装、AppID、
release ID、模板版本，并确认二维码、抖音日志存在且操作租约为空后收敛。目标安装不存在时该 migration
不修改数据；任一证据变化时失败关闭，不得把这条一次性规则扩展到其他安装。

### 6.2 租户发布 API

租户 Admin 在 `/douyin-miniapp/workspace` 完成自己已授权小程序的发布。客户端不得提交租户 ID、AppID、安装 ID 或模板 ID；服务端从登录租户和当前确认模板解析这些标识。`:releaseId` 是当前租户拥有的发布记录 UUID。

| 顺序 | API | 关键输入/结果 |
| --- | --- | --- |
| 1 | `POST /tenant/douyin-miniapp/releases/from-current-template` | 无 body/query；服务端使用当前确认模板生成体验版 |
| 2 | `POST /tenant/douyin-miniapp/releases/:releaseId/test-qr` | 无 body/query；保存安全的二维码结果 |
| 3 | `POST /tenant/douyin-miniapp/releases/:releaseId/submit-audit` | 唯一 `host_names` 和非敏感 `audit_note` |
| 4 | `POST /tenant/douyin-miniapp/releases/:releaseId/sync-status` | 无 body/query；仅接受抖音数值状态 0/1/2/3 |
| 5 | `POST /tenant/douyin-miniapp/releases/:releaseId/publish` | 无 body/query；要求 `douyin_miniapp.publish`，只发布刚同步为审核通过的精确版本 |

租户发布记录通过以下分页接口查询，默认 `page=1&pageSize=20`，`pageSize` 最大 100：

```text
GET /tenant/douyin-miniapp/releases?page=1&pageSize=20
```

平台支持人员仅可通过
`GET /platform/douyin-miniapps/:id/releases?page=1&pageSize=20` 查看分页历史；平台代商户上传、提审和发布的写接口已移除。

推荐状态序列：

```text
created -> uploaded -> testing -> audit_pending -> audit_approved -> released
```

`audit_rejected` 或 `failed` 必须先查明安全错误码和抖音 `log_id`，修复后可从当前确认模板创建新的交付记录；终态本身不显示无效的重复提审或状态同步按钮。`created`、`uploaded`、`testing`、`audit_pending`、`audit_approved` 未结束时，数据库通过每个安装最多一个未完成版本的唯一约束拒绝覆盖；其他版本仍有未过期操作租约时同样不能创建新版。其中 `created` 通过「继续生成体验版」恢复原发布，不能改用新模板。并发请求会按商户安装串行化。遇到 `DOUYIN_RELEASE_OPERATION_IN_PROGRESS` 时等待当前操作结束后查询状态，不要循环快速重试。

若抖音已受理但本地写入失败，服务端会用精确版本证据恢复。这里的“精确版本证据”是抖音版本列表中 `current`（当前线上）、`audit`（审核中/结果）或 `latest`（最新上传）的版本号与发布记录 `template_version` 完全相同；“claim”是服务端两分钟操作租约，不能由运营手工编辑。

`DOUYIN_RELEASE_OUTCOME_UNCERTAIN` 的处置流程：

1. 立即停止该安装的自动和人工重复操作，记录安装 UUID、发布 UUID、操作名、版本、发生时间、安全错误码和脱敏 `log_id`，升级给发布负责人。
2. 等待至少两分钟租约窗口，再在抖音控制台核对该 AppID 的 `current`、`audit`、`latest` 版本；不要清 claim、不要改数据库。
3. 若目标版本已成为 `current`，经发布负责人批准后重试原接口一次；服务端只修复本地 released 状态，不会再次发布。
4. 上传不确定时，若目标版本出现在 `latest/audit/current`，用完全相同的 upload 请求重试一次进行对账；提审不确定时，只有目标版本出现在 `audit/current` 才用完全相同的 host/note 重试一次。
5. 发布不确定且目标版本仍只在 `audit`、未成为 `current` 时，禁止重放 publish。保存控制台截图并联系抖音支持确认；确认未发布后，应由发布负责人批准创建一个新 SemVer 交付记录重新走完整流程。
6. 任一证据相互矛盾或控制台仍延迟时保持停止状态，不能通过删除发布记录、缩短租约或手工更新状态解锁。

## 7. 凭证与部署标识轮换

### 7.1 凭证信封密钥

1. 在 `DOUYIN_CREDENTIAL_KEYS_JSON` 中加入新版本，保留所有仍被数据库信封引用的旧版本。
2. 将 `DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION` 切到新版本并滚动发布 API。
3. 验证新写入使用新版本，再安排受控的旧信封重加密。
4. 只有确认数据库不再引用旧版本后才能删除旧密钥。

组件 AppSecret、消息 Token 或 AES Key 的轮换必须与开放平台控制台同步并安排短维护窗口。先验证新配置能处理 Ticket/授权回调，再撤销旧值。

### 7.2 授权 token 刷新告警

关注组件和商户 token 刷新成功率、耗时、租约冲突、`DOUYIN_AUTHORIZATION_EXPIRED`、`DOUYIN_OPEN_PLATFORM_ACCESS_TOKEN_REFRESH_FAILED`。短暂网络故障可按退避策略重试；授权过期或 refresh token 被拒绝时停止发布并通知商户重新授权。

### 7.3 Deployment key

```text
POST /platform/douyin-miniapps/:id/rotate-deployment-key
```

响应中的 `requires_rebuild: true` 表示必须重新上传、提审和发布。已上线包仍携带旧 key：轮换后，新会话交换会立即因 key mismatch 被拒绝；已经签发的 Gooes JWT 不因 key 本身立刻失效，但仍会在安装停用/撤销时失败关闭，并最迟在会话过期后需要新 key。由于新旧用户影响窗口不同，只能在明确维护窗口执行：记录旧值对应的稳定版本、轮换、立即走完整交付流程、完成 smoke 后恢复推广。deployment key 是公开部署标识，不是访问凭证，但仍不得由客户端自行选择或改写。

## 8. 停用、撤销与回滚

- 临时停用：调用 `POST /platform/douyin-miniapps/:id/disable`。会话、内容和留资应失败关闭；问题解决且租户仍有效后调用 `/enable`。
- 商户撤销授权：由可信 `UNAUTHORIZED` 回调把安装置为 `revoked` 并清除可用授权状态。禁止手工 enable；必须让商户重新授权。
- 租户停用：即使安装仍存在，也不得返回装修内容或创建线索。
- 模板回滚：保留上一个稳定模板库 ID。用该稳定模板代码创建一个新的交付 SemVer，经 upload、测试二维码、提审、状态同步、publish 完整流程发布。禁止直接改数据库状态、复用旧版本号或绕过审核。

## 9. 监控与排障

| 环节 | 最低监控项 | 常见停止条件 |
| --- | --- | --- |
| 授权回调 | 验签失败、解密失败、重复事件、处理耗时 | 回调持续非 200、事件积压 |
| 会话交换 | 成功率、AppID/deployment mismatch、授权过期、耗时 | 租户串线迹象、凭证异常 |
| Bootstrap/内容 | 成功率、分页参数错误、模块关闭、空态 | 越权字段或跨租户数据 |
| 短信 | 发送/验证成功率、限流、过期/错误码 | 限流失效、验证码泄露 |
| 留资 | 成功率、幂等冲突、24 小时去重、租户路由 | 重复线索或错误租户 |
| 事件批次 | accepted 数、allowlist 拒绝、批次越界 | 任意事件绕过白名单 |
| Token 刷新 | 成功率、租约占用、过期授权、提供方耗时 | 连续刷新失败或 reauth |
| 模板发布 | 各状态数量、provider 错误码、安全 `log_id`、不确定结果 | 重复外部操作或版本不一致 |

日志允许记录安装/发布 UUID、规范化事件名、安全错误码和符合白名单的 `log_id`。禁止记录 AppSecret、access/refresh token、Ticket、session key、claim token、原始 OpenID、短信验证码、完整手机号、凭证信封明文或原始提供方响应。

发生租户隔离、凭证泄露或重复发布风险时：立即停止相关入口，禁用受影响安装，保全脱敏日志和发布记录，不做手工数据库修补，并按安全事件流程升级。

## 10. Smoke 请求速查

以下是测试环境的接口契约，不包含真实身份或秘密值。除会话交换外，小程序接口使用 `Authorization: Bearer <GOOES_SESSION>`；平台接口使用具备发布权限的后台会话。

| 场景 | 方法与路径 | 最小输入/预期 |
| --- | --- | --- |
| 会话 | `POST /douyin-mini/auth/session` | `app_id`、可选 `deployment_key`、一次性 `code`、完整 `launch_context`；伪造 AppID/key 应失败 |
| Bootstrap | `GET /douyin-mini/bootstrap` | 返回当前安装品牌、功能开关和隐私版本，不含租户选择参数 |
| 案例 | `GET /douyin-mini/cases?page=1&pageSize=20` | 默认/最大分页正确；101 被拒绝 |
| 工地 | `GET /douyin-mini/sites?page=1&pageSize=20` | 仅公开投影；详情为 `/sites/:id`，日志为 `/sites/:id/logs` |
| 短信 | `POST /douyin-mini/sms/send` | `phone`、完整 `attribution`；使用专用测试号码 |
| 留资 | `POST /douyin-mini/leads` | `name`、`phone`、`sms_code`、隐私版本、同意时间、UUID 幂等键、`attribution` |
| 事件 | `POST /douyin-mini/events` | `events` 1–20 条；事件名仅允许六个客户端事件 |

测试数据必须预先准备：两个 active 租户、各自公开/未公开案例与工地、一个可停用租户、一个模板开发安装、一个已授权测试商户、专用测试手机号和可查看测试短信的账号。没有这些数据时，对应项记录为 `BLOCKED`，不能填写通过。

“provider 成功但本地写失败”、并发租约和不确定结果属于自动化故障测试，证据使用聚焦测试输出；禁止在共享/生产环境通过断数据库、篡改 claim 或伪造 provider 响应进行演练。

```bash
cd apps/api
bun test src/services/platform-douyin-miniapp-releases/operation-service.recovery.test.ts
```

`launch_context` 和 `attribution` 使用同一严格对象：

```json
{
  "entry_path": "pages/home/index",
  "scene": "1001",
  "source_type": "direct",
  "campaign_code": "optional-code",
  "content_id": "optional-code"
}
```

- `entry_path` 只允许：`pages/home/index`、`pages/company/index`、`pages/privacy/index`、`pages/cases/index`、`pages/case-detail/index`、`pages/sites/index`、`pages/site-detail/index`、`pages/lead/index`、`pages/lead-success/index`。
- `scene` 是 1–20 位数字字符串。
- `source_type` 只允许：`short_video`、`live`、`search`、`profile`、`share`、`direct`、`other`。
- `campaign_code`、`content_id` 可省略；提供时只能是 1–64 位字母、数字、下划线或连字符。

营销事件请求示例：

```json
{
  "events": [
    {
      "event_name": "page_view",
      "occurred_at": "2026-07-19T10:00:00+08:00",
      "attribution": {
        "entry_path": "pages/home/index",
        "scene": "1001",
        "source_type": "direct"
      }
    }
  ]
}
```

`event_name` 只允许 `app_launch`、`page_view`、`case_view`、`site_view`、`lead_cta_click`、`phone_call_click`；`entity_id` 可选且必须是 UUID；每批 1–20 条。负例应分别替换一个字段，验证未知事件、未来超过 5 分钟、早于 7 天、未知归因字段和客户端伪造租户均被拒绝。

## 11. 分阶段上线

1. 仅在模板开发安装完成全部本地与真机检查。
2. 选择一个已明确授权的测试商户，执行 smoke 清单。
3. 经业务负责人批准后发布一个真实商户，观察至少一个工作日并人工核对线索路由。
4. 扩到 3–5 个商户，继续逐商户操作和观察。
5. 保留上一稳定模板库 ID 和每次发布记录；任何阶段异常都停止扩量。

上传、提审、发布是三个独立外部变更，审批单必须分别留下“操作 + 安装 UUID + 版本”的授权记录；一次笼统的“允许测试”不能覆盖三项。不得以“试运行”为理由开启批量发布、跳过审核、直接修远端数据库或把测试租户配置带入生产商户。
