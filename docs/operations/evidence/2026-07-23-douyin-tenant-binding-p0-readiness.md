# 抖音租户绑定 P0-R 生产就绪只读核查

> 核查编号：`DOUYIN-TENANT-BINDING-P0-R`
> 核查环境：development
> 核查时间：2026-07-23 23:30–23:38 +0800
> Component AppID：仅记录尾号 `cd67`
> Template AppID：仅记录尾号 `1b01`

## 1. 核查范围与结论

本轮仅核查第三方小程序的发布状态、授权域名、回调与 Ticket、开发部署和
migration 对齐情况。未获取或轮换 Token，未生成授权链接，未建立商户授权，
未写数据库，未修改抖音控制台，未部署或重启服务。

### 总体结论：`BLOCKED / NO-GO`

- **开发回调基础链路：PASS。** Component `cd67` 的 authorization 回调持续返回
  `200`，Ticket 加密信封完整且持续更新，开发 API、运行配置和 migration 均稳定。
- **真实装修公司租户授权上线：NO-GO。** 第三方小程序“全网发布状态”和“授权域名”
  缺少本轮控制台权威回读；最近一次直接控制台证据仍为“未发布”，授权域名的最近
  直接基线为“未配置”。在取得当前控制台 PASS 证据前，不得进入授权链接生成或真实
  商户授权。
- **Component Token 能力：NOT TESTED。** 数据库中的缓存信封完整，但缓存凭据在本轮
  核查时已过期；按 P0-R 边界没有触发获取或刷新。该能力应留给后续 P0-C 受控联调。

该结论只阻止真实商户授权上线，不否定 Template `1b01` 已完成的开发工具和手机预览。

## 2. 证据矩阵

| 核查项 | 结果 | 本轮权威证据 | 判定 |
|---|---|---|---|
| 开发 API 容器 | PASS | 容器 `fbaf5af0e30f…`，revision `d6f6756baf55acefd64e796db49bc3c1e106fc20`，run `29998514360`，StartedAt `2026-07-23T10:16:50.83327293Z`，`running/healthy` | 部署身份稳定 |
| GitHub development deployment | PASS | 最新 deployment `5570650610`，SHA 与容器 revision 一致，最终状态 `success` | GitHub 与服务器一致 |
| 开发 workflow | PASS | Auto Deploy Dev、Build Docker Images、Deploy Dev、Release Dev 均为 `active`；活动和排队 run 均为 0 | 无在途部署漂移 |
| 九项 `DOUYIN_*` | PASS | `/opt/gooes-dev/docker/.env.dev.api` 为 `0600 / ubuntu:ubuntu`；九项在磁盘和容器中均存在、长度符合门禁且逐项相等 | 未输出任何原值 |
| Component / Template 身份 | PASS | 运行配置 AppID 尾号分别为 `cd67`、`1b01` | 身份未串用 |
| authorization 回调 | PASS | 当前容器启动后共记录 32 次该路由 `200`；最近三次为 23:10、23:20、23:30 +0800 | 符合约十分钟推送节奏 |
| 回调错误 | PASS | 当前容器日志中 signature、padding、AppID、timestamp、message 五类已知错误码计数均为 0 | 未见历史故障复发 |
| 回调成功响应契约 | PASS | 部署 SHA 与当前源码对应 controller 的 SHA-256 一致；成功分支固定返回 `text/plain`、HTTP `200`、正文 `success` | 与官方响应要求一致 |
| 三个公网回调路由 | PASS（路由） | authorization、固定 message、动态 message 空 JSON 负向探针均返回业务校验 `400` | 路由已加载；不等同于平台已向两个 message 路由推送 |
| Component 数据 | PASS | 开发库中尾号 `cd67` 精确 1 行、`active` | 无重复 Component |
| Ticket | PASS | `component_ticket_received_at=2026-07-23T15:30:00Z`；23:32:38 +0800 查询时年龄 156 秒；ciphertext/iv/tag/key-version/received-at 五项均存在 | Ticket 新鲜且信封完整 |
| 缓存 Component Token | NOT TESTED | 加密信封完整；`expires_at=2026-07-23T11:13:15.776Z`，核查时已过期 | 本轮禁止获取或刷新，不能据此宣称 token 能力 PASS |
| Template 安装 | PASS（开发态） | 精确 1 条 `template_development / active`，Template 尾号 `1b01`，绑定合成租户 `51111111-1111-4111-8111-111111111111`；无 deployment key、提交、审核或发布时间 | 仅用于开发预览，不是装修公司 merchant 授权 |
| migration 对齐 | PASS | Local `351` / Remote `351`，mismatch `0`，双方最新 `20260723110000` | 未执行 migration、push 或 repair |
| 第三方应用全网发布 | **BLOCKED** | 最近一次直接控制台证据为“未发布”；本轮 Chrome 连接在允许的单次重试后仍不可用，无法取得当前页面回读 | 未发布应用只能与测试小程序授权；真实租户上线不得继续 |
| 授权域名 | **BLOCKED** | 最近一次直接基线为“未配置”；后续证据证明回调 URL 和消息凭据已恢复，但没有授权域名当前值的权威回读 | 不能生成带 `redirect_uri` 的正式授权链接 |
| authorization URL 实际生效 | PASS | 平台持续命中 `https://api-dev.goodcms.cn/douyin-thirdparty/events/authorization` 对应路由并推动 Ticket 更新时间 | 实际生效链路已证明 |
| message URL 控制台保存状态 | PARTIAL | 历史记录为已保存；当前公网固定和动态路由均存在，但本轮没有新的平台 message 事件 | 生产前仍需控制台只读回读 |

## 3. 回调与 Ticket 实时证据

当前开发 API 容器从 `2026-07-23T10:16:50Z` 启动至本轮核查时：

```text
authorization_200_count=32
DOUYIN_CALLBACK_SIGNATURE_INVALID_count=0
DOUYIN_CALLBACK_PADDING_INVALID_count=0
DOUYIN_CALLBACK_APPID_MISMATCH_count=0
DOUYIN_CALLBACK_TIMESTAMP_INVALID_count=0
DOUYIN_CALLBACK_MESSAGE_INVALID_count=0
```

最近三次平台 authorization 请求：

```text
2026-07-23 23:10:06 +0800  req-xx   HTTP 200
2026-07-23 23:20:06 +0800  req-yo   HTTP 200
2026-07-23 23:30:06 +0800  req-14h  HTTP 200
```

开发数据库只读结果：

```text
Component suffix             cd67
Component row count          1
Component status             active
Ticket envelope complete     true
Ticket received at           2026-07-23 23:30:00 +0800
Ticket age at query          156 seconds
```

查询只输出状态、时间和信封存在性，没有读取 Ticket、密文、消息 Token、AES Key、
AppSecret、完整 AppID 或 access token。

## 4. 开发部署与配置基线

```text
container_id   fbaf5af0e30f1afcf03e1c78a4c059a4485385d489006434496c2d37717c827c
revision       d6f6756baf55acefd64e796db49bc3c1e106fc20
release_run    29998514360
deployment     5570650610
started_at     2026-07-23T10:16:50.83327293Z
status         running / healthy
```

本地工作树 HEAD 虽在该部署 SHA 之后包含小程序 UI 和文档提交，但
`apps/api` 与 `supabase` 相对部署 SHA 没有差异，因此本轮读取的后端 callback
controller、service 和 schema 与当前运行容器对应。

九项运行配置只记录以下非秘密元数据：

| 配置 | 磁盘/容器 | 长度 | 备注 |
|---|---|---:|---|
| `DOUYIN_COMPONENT_APP_ID` | equal | 18 | 尾号 `cd67` |
| `DOUYIN_COMPONENT_APP_SECRET` | equal | 40 | 不记录值 |
| `DOUYIN_COMPONENT_MESSAGE_TOKEN` | equal | 32 | 不记录值 |
| `DOUYIN_COMPONENT_MESSAGE_AES_KEY` | equal | 43 | 不记录值 |
| `DOUYIN_TEMPLATE_APP_ID` | equal | 20 | 尾号 `1b01` |
| `DOUYIN_TEMPLATE_APP_SECRET` | equal | 40 | 不记录值 |
| `DOUYIN_CREDENTIAL_KEYS_JSON` | equal | 53 | 不记录值 |
| `DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION` | equal | 2 | 不记录值 |
| `DOUYIN_SUBJECT_HASH_KEY` | equal | 64 | 不记录值 |

本机 `/Users/leefo/Public/work/gooes/.env` 仍只作为开发 Supabase 连接来源；
其中没有九项 `DOUYIN_*` 运行凭据。

## 5. migration 对齐

通过当前工作树 migration 文件和开发数据库直连执行只读 `supabase migration list`：

```text
local_count     351
remote_count    351
matched_count   351
mismatch_count  0
local_latest    20260723110000
remote_latest   20260723110000
```

本轮没有执行 `migration up`、`db push`、`repair`、DDL、DML 或 RPC 写入。

## 6. 控制台项为何保持 BLOCKED

本轮 Chrome 连接的只读诊断结果为：

- Google Chrome 正在运行；
- ChatGPT Chrome Extension 已安装且启用；
- Native Messaging Host 配置正确；
- 按授权打开一个空白 Chrome 窗口并只重试一次后，连接仍不可用；
- 未改用 AppleScript、浏览器配置文件、Cookie、Local Storage 或其他方式绕过。

现有 E2E 证据中，最近一次直接进入第三方应用开发配置页面时，应用为“未发布”，
授权域名基线为“未配置”。后续受控动作只覆盖消息 Token/AES 和两个回调 URL，
没有全网发布或授权域名修改的完成证据。因此当前不能把这两项推定为 PASS。

官方要求与本轮判定一致：

- [发布第三方小程序应用](https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/guide/template/publishing)：
  未全网发布的第三方小程序只能与测试小程序建立授权关系。
- [直接获取授权链接](https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/authorization/gen-link)：
  `redirect_uri` 域名必须与应用配置的授权域名一致；未全网发布会返回 `40058`。
- [接收 component_ticket](https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/authorization/component-ticket)：
  平台约每十分钟向授权事件接收 URL 推送 Ticket，Ticket 有效期三小时，成功响应必须为 `success`。

GoodCMS LightRAG 在本轮查询时尚未索引 2026-07-23 的抖音模块资料，返回的最新相关
上下文仍是微信小程序文档。因此本报告以当前工作树、开发运行时、开发数据库、
GitHub deployment 和抖音官方文档为准，没有用旧 RAG 内容覆盖当前事实。

## 7. Go / No-Go 门禁

### 已通过

- Component `cd67` 身份、配置传播和运行容器稳定；
- authorization 回调验签、AES 解密、Ticket 加密落库持续正常；
- Ticket 新鲜；
- migration 完全对齐；
- Template `1b01` 的开发安装身份清晰，未混同 merchant 授权；
- 没有在途开发部署。

### 阻断项

1. 在抖音服务商控制台权威确认第三方应用已经“全网发布”；
2. 权威回读授权域名，并确认它与后续平台管理站点的授权完成回调域名一致；
3. 只读回读两个回调 URL，尤其是 message URL 的当前保存状态；
4. 进入 P0-C 后才允许受控刷新一次 Component Token，并验证授权链接能力。

在 1–3 完成前，禁止面向真实装修公司开放“绑定抖音小程序”入口；在 P0-C
完成前，禁止把当前开发 Ticket 成功等同于完整租户授权链路成功。

## 8. 范围遵守

本轮实际发生的动作：

- 只读查询 Git、GitHub Actions/deployment、开发服务器容器、脱敏运行配置、
  开发数据库和 migration history；
- 对三个公开回调路由发送空 JSON 负向探针，均在 Zod 校验阶段返回 `400`，
  未触发 Ticket、授权或数据库写入；
- 打开一个空白 Chrome 窗口并只重试一次连接；
- 新增本脱敏证据文档。

本轮未发生：

- Token 获取、刷新或轮换；
- 授权链接生成；
- 小程序授权、解绑或租户绑定；
- 抖音控制台保存；
- 数据库写入或 migration；
- 服务器文件写入、部署、重启；
- IDE 上传、提审、发布或生产操作；
- Orange 仓库写入。
