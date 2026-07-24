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

## 9. 2026-07-24 A08/A09 与测试 Authorizer 前置更新

### 9.1 模板代码状态

- A08：PASS。用户确认已在抖音开发者工具向 Template AppID 尾号 `1b01`
  上传版本 `0.1.0`。
- A09：PASS。用户随后从 Component 尾号 `cd67` 的模板库权威回读版本
  `0.1.0`、说明“首个装修行业模板：租户品牌、案例、工地与免费咨询联调版本”
  和数字 `template_id=77538`；版本与 A08 精确输入一致。
- 上传前门禁：`douyin-mini:check` 为 87/87、277 expect，TypeScript 通过；
  `api:check` 的 typecheck、build、file-size 通过；上传源码树为
  `6fa6d6eaf96cf9821d197d5a3cba440dfb4d6cf8`。

### 9.2 开发库只读状态

2026-07-24 00:09 +0800 使用项目已确认指向开发环境的 Supabase 配置，仅通过
分页只读查询取得安全投影：

| 对象 | 只读结果 | 判定 |
| --- | --- | --- |
| Component | 共 1 条，尾号 `cd67`，`active` | PASS |
| Ticket | 最近 20 分钟内更新 | PASS |
| Component Token 缓存 | 已过期 | 留待 P0-C 受控刷新，不影响当前测试对象识别 |
| 安装 | 共 1 条 | 未出现普通 Authorizer |
| 模板开发安装 | UUID `69191217-c65d-4014-ab51-c4f9856a590d`，尾号 `1b01`，`template_development / active`，已绑定租户 | PASS |
| 商户安装 | 0 条 | 等待授权普通测试小程序 |

查询没有选择或输出完整 AppID、Ticket、access/refresh token、凭证密文、
deployment key、用户身份或手机号，也没有数据库写入。

### 9.3 当前唯一前置缺口

在 Component `cd67` 的：

```text
代开发流程指引 → 授权测试小程序 → 开发配置
```

必须识别或添加一枚不同于 Template `1b01` 的普通小程序 AppID，并记录应用名称和
AppID 尾号。若当前列表为空，须由主体账号确认已有普通小程序；不能把模板小程序
或 IDE 测试号直接假定为测试 Authorizer，也不能由 Codex 擅自创建新小程序。

普通测试小程序确定后，下一步顺序固定为：

1. 加入授权测试小程序列表；
2. 完成一次官方测试授权；
3. 由可信 `AUTHORIZED` 回调建立唯一
   `merchant / authorized_unbound` 安装；
4. 绑定 `5H 验收租户 A`；
5. 使用 `template_id=77538` 通过现有 release API 提交测试代码并生成 test-qr。

### 9.4 `redirect_uri` 官方约束澄清

官方“直接获取授权链接”将 `redirect_uri` 定义为可选参数：传入时，授权成功后
跳转并给出授权码，且域名必须匹配授权域名；不传则不跳转。官方授权环节说明还
明确服务商控制台可以直接获取授权链接，授权相关通知独立推送到授权事件接收 URL。

因此本轮全网发布前测试授权采用控制台授权入口且不传 `redirect_uri`：

- 不需要先实现 Gooes 授权完成页；
- 不修改当前授权域名；
- `AUTHORIZED` 仍由已验证的 authorization 回调接收；
- 授权完成页和带 `redirect_uri` 的授权链接留到租户侧“小程序中心”阶段。

官方流程截图进一步确认，控制台入口不在“代开发流程指引 → 授权测试小程序”
卡片内部，而是：

```text
开发 → 开发配置 → 页面顶部“授权链接”
→ “小程序代开发”行 → 获取
```

“授权测试小程序”卡片只提供“去填写”“去添加”和“查看接入文档”。此前将获取
链接描述为该卡片内操作属于导航位置错误，现已纠正。当前测试小程序已经创建，
不得误选同一区域的“小程序代创建+代开发”。

这项澄清只解除测试授权的页面前置，不解除真实装修公司上线前的授权域名和固定
回调页门禁。

### 9.5 普通测试小程序对象要求与空列表恢复

官方“基本概念”将三类对象明确分开：

- 普通小程序：未绑定任何第三方小程序，也未授权给任何第三方小程序；
- 开发/模板小程序：普通小程序绑定第三方小程序后形成，只用于模板开发；
- 授权小程序：普通小程序授权给第三方小程序后形成。

因此 Template `1b01` 已是开发/模板小程序，不能再作为普通测试 Authorizer。
本地只读扫描也只发现 `1b01` 的项目配置，开发库只存在该模板开发安装，没有可
复用的普通 Authorizer。

若 Component `cd67` 的“授权测试小程序列表”为空，恢复路径固定为：

1. 登录抖音开放平台开发者平台；
2. 进入“控制台 → 小程序 → 创建小程序”；
3. 由主体负责人确定全局唯一的小程序名称；
4. 由主体负责人本人阅读并同意《小程序开发者平台服务协议》后提交；
5. 等待平台审核通过并取得普通小程序 AppID；
6. 将该普通小程序加入 `cd67` 的授权测试小程序列表。

新建小程序涉及新的平台对象、名称占用、协议确认和审核，不能由既有“继续执行”
授权自动推导具体名称，也不能由 Codex代替主体负责人接受协议。企业等非个体工商户
同一主体最多可创建 10 个小程序；创建前应先核对主体当前额度。

2026-07-24 10:01 +0800，用户从 Component `cd67` 控制台确认该列表为空。
该结果与开发库普通 Authorizer 为 0、gooes 工作区只有 Template `1b01` 的
独立只读证据一致。当前状态升级为
`BLOCKED_BY_MISSING_ORDINARY_TEST_MINIAPP`；下一动作是由用户确定新普通小程序
的名称、主体和类目，而不是重复授权、手工补库或复用模板 AppID。

### 9.6 普通测试小程序预填方案

2026-07-24 依据官方基础信息审核标准、企业主体开放服务类目和当前模板功能，
形成以下待主体负责人确认的最小预填方案：

| 字段 | 预填值 | 判定依据 |
| --- | --- | --- |
| 应用类型 | 小程序 | 当前交付物不是小游戏 |
| 主体 | 河南好店大数据科技有限公司 | 与服务商企业主体一致 |
| 建议名称 | 好店装修服务 | 企业/品牌关键词 + 行业服务词，长度符合 4～20 字要求 |
| 服务类目 | 房地产 → 房地产 → 装修/建材 | 覆盖装修资讯、在线预约和人工咨询；官方未列额外行业资质 |
| 主营类目 | 装修/建材 | 当前只有一个主要经营场景 |
| 简介 | 提供装修案例、在建工地、服务区域展示及免费装修咨询预约服务。 | 与模板当前可见功能一致 |
| 平台用途 | `cd67` 预发布普通测试 Authorizer | 不绑定为 Template，不作为真实装修公司生产应用 |

该表只是创建表单的预填建议，不代表平台对象已经创建。小程序名称具有平台唯一性，
主体负责人仍须确认名称、核对主体额度并本人接受服务协议；Codex 不代替作出以上
法律或业务确认。若名称被占用，必须记录平台原始提示并重新确定名称，不能擅自追加
随机后缀或使用“测试/联调”等不适合后续审核的词。

### 9.7 普通测试小程序已建立

2026-07-24 10:11 +0800，用户确认已完成以下控制面操作：

- 普通小程序名称：好店装修服务；
- AppID：仅记录尾号 `d301`；
- 已加入 Component `cd67` 的“授权测试小程序列表”。

因此 `BLOCKED_BY_MISSING_ORDINARY_TEST_MINIAPP` 已解除。该确认只证明普通测试
对象存在并已加入列表，不等同于已经完成授权，也不证明后端已收到可信
`AUTHORIZED` 回调。下一门禁是只读核对 Component 开发配置，然后只对“好店装修
服务”尾号 `d301` 发起一次官方测试授权。

随后使用开发库 Supabase 配置进行分页只读安全投影，结果为：

| 对象 | 结果 | 判定 |
| --- | --- | --- |
| Component | 尾号 `cd67`，`active` | PASS |
| Ticket | 北京时间 2026-07-24 10:10 到达 | authorization 回调、Token 与 AES 链路健康 |
| Component Token 缓存 | 已过期、无刷新错误 | 按计划留待 P0-C，不在本阶段刷新 |
| 安装 | 共 1 条，只有 Template `1b01` | 尚未收到普通小程序授权 |
| merchant 安装 | 0 条 | 等待“好店装修服务”完成官方测试授权 |

查询只返回 AppID 尾号、状态、时间和是否绑定；没有返回完整 AppID、Ticket、
access token、凭证密文或用户身份，也没有数据库写入。

### 9.8 首次授权持久化失败与根因修复

2026-07-24，用户通过“开发 → 开发配置 → 授权链接 → 小程序代开发 → 获取”
对“好店装修服务”尾号 `d301` 完成首次授权确认。开发 API 安全聚合证明：

- authorization 回调请求 2 次，HTTP 200 为 2，4xx/5xx 为 0；
- 签名错误为 0，AES/Component 解密错误为 0；
- 首次完成错误为 `DOUYIN_AUTHORIZATION_EVENT_REPOSITORY_ERROR`；
- 后续同事件处理为 `DOUYIN_AUTHORIZATION_EVENT_BUSY`。

开发库严格只读查询进一步证明：尾号 `d301` 的 `AUTHORIZED` delivery 停留在
`processing`，租约于北京时间 10:38 过期；merchant 安装仍为 0。代码数据流显示
失败位于 `complete_douyin_authorization_event` 原子完成 RPC，而不是验签、解密、
换票或安装查询。

根因是原 migration 的授权安装 UPSERT 引用了 `installation.tenant_id`、
`installation.deployment_key`、`installation.runtime_config` 和
`installation.authorization_event_occurred_at`，但 INSERT 目标没有声明
`installation` 别名。开发库函数源码布尔检查确认四处引用均存在；无写入
`EXPLAIN` 返回：

```text
missing FROM-clause entry for table "installation" (SQLSTATE 42P01)
```

修复通过 migration
`20260724190000_fix_douyin_authorization_event_upsert_alias.sql` 为目标表声明
`AS installation`，没有手工修改函数、事件租约或安装数据。相关结果：

| 验证项 | 结果 |
| --- | --- |
| 修复提交 | `d2496b0342c3c80ccb3888aeaf95166063b4948e`，已普通推送功能分支 |
| 聚焦迁移测试 | 14/14，176 expect |
| API 静态门禁 | typecheck、build、文件大小检查通过 |
| `db push --dry-run` | 只列出 `20260724190000` |
| 开发库应用 | 成功 |
| migration history | `mismatch=0` |
| 函数实现 | 实际函数已声明目标别名 |
| 函数权限 | `service_role=true`，`anon=false`，`authenticated=false` |
| 自动重送等待 | 连续 3 次只读检查 merchant 仍为 0 |

由于首次回调已经向平台返回 HTTP 200，平台未自动重送。下一步必须由用户重新打开
同一“小程序代开发”授权链接，再次确认尾号 `d301`；新的授权生命周期事件应由已
修复 RPC 原子创建 `merchant / authorized_unbound` 安装。禁止手工补库、清理租约、
执行 repair 或复用旧授权码。

### 9.9 d301 重新授权与稳定租户绑定

2026-07-24 11:17 +0800，用户对尾号 `d301` 再次完成官方“小程序代开发”授权。
只读后置验证证明：

| 核查项 | 结果 |
|---|---|
| merchant 安装数 | 精确 1 |
| 安装 UUID | `82061c96-29ac-4426-baff-5efc1061fbc8` |
| Authorizer 尾号 | `d301` |
| 初始授权状态 | `authorized_unbound` |
| access/refresh 凭证信封 | ciphertext、IV、tag、key version 和未来有效期全部通过 |
| 授权权限 | ID `1–8`，包含开发管理 |

绑定前，原计划用展示名称 `5H 验收租户 A` 作为精确门禁。该门禁在写入前安全停止，
随后只读数据库证明安装仍未绑定、deployment key 仍为空。原因不是绑定接口故障，
而是用户已在后台把同一租户名称改为 `5H 验收租户 AAA`。稳定身份保持不变：

```text
tenant_id = 51111111-1111-4111-8111-111111111111
slug      = phase5h_verify_a
```

改用固定 UUID/slug 并通过现有平台 API 回读当前名称后，只调用一次 bind。响应和
单安装 GET 均证明 d301 已为 `merchant / active`，绑定到上述租户；运行配置复用
Template `1b01` 的当前配置。安全 API 响应不含 deployment key，独立只读投影只
确认其存在，不读取原值。没有直接数据库写入、手工补安装、重放授权码、migration
或 repair。

### 9.10 模板提交、失败消歧与 test-qr

模板提交前通过官方只读接口完成四项核对：

1. d301 的官方版本列表可正常读取，证明 Authorizer access token 与应用关系有效；
2. d301 当时的 current、audit、latest、gray 四个版本槽均为空；
3. Component `cd67` 的官方模板列表精确只有一条 `77538 / 0.1.0`；
4. migration history 为 Local `359` / Remote `359`、mismatch `0`，最新均为
   `20260724190000`。

首次使用原计划长版本
`0.1.0-dev.20260724032738` 调用提交代码 V2，开发 API 返回
`502 / DOUYIN_OPEN_PLATFORM_API_ERROR`，安全 log ID 为
`20260724112740E085FFC1F3BA5E1FB118`。本地 release 原子落为 `failed`，无
operation claim、无 test-qr；随后官方版本列表仍为空，排除平台半成功状态。没有
盲目重放同一请求。

在模板 ID、权限、Token、ext config、描述和通道都不变时，只把 `user_version`
改为短三段 `0.1.1`，受控重试一次即成功。该单变量 A/B 证明长预发布版本字符串是
本次平台拒绝的触发输入；后续商户交付统一使用短三段 SemVer。成功 release：

```text
release_id       2329c8c1-6eb2-4f15-9d7f-04dcf66047e7
template_id      77538
template_version 0.1.1
status           testing
authorizer_tail  d301
```

同一 release 的 test-qr 已成功生成。官方版本列表随后显示
`latest.version=0.1.1`，current/audit/gray 仍为空；开发库只读状态为 testing 1、
failed 1、audit submitted 0、audited 0、released 0。当前容器从绑定窗口开始的
安全路由计数为：

```text
bind_200       1
upload_502     1
upload_200     1
test_qr_200    1
submit_audit   0
sync_status    0
publish        0
```

二维码只临时保存在本机 `/tmp` 的 `0600` 文件中并展示给凭据持有人，未提交到 Git，
未记录完整二维码 URL 或 provider 原始响应。最新 Ticket 于北京时间 11:30 到达，
Component 继续为 `active`、缓存 access token 仍在未来有效；开发 API 容器保持
revision `d6f6756baf55acefd64e796db49bc3c1e106fc20`、`running/healthy`。

当前检查点为手机扫码验证 d301 测试版。未取得用户对公司名、案例、工地、域名和
Template/Authorizer 身份五项确认前，不进入第三方应用全网发布，不调用商户
`submit-audit`、`sync-status` 或 `publish`。
