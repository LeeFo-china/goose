# 抖音装修行业营销获客小程序模板设计

**日期：** 2026-07-19

**状态：** 已完成分段评审，待书面复核

**范围：** gooes 原生抖音小程序、Gooes API、Supabase migration 与抖音第三方小程序模板发布链路

## 1. 背景

河南好店大数据科技有限公司已经取得抖音开放平台“小程序代开发”服务能力。首个交付物
是面向装修公司的营销获客小程序模板：每家装修公司以自己的主体和 AppID 持有授权小程序，
服务商使用同一套模板代码代其构建、提审、发布和后续升级。

小程序直接承接装修公司在抖音短视频、直播、搜索、扫码等场景获得的访问流量，向有装修
需求的业主展示案例、在建工地和公司能力，并把有效留资直接写入该装修公司租户的营销线索。
它不是平台统一运营的装修公司聚合小程序，也不承担客户施工交付功能。

## 2. 已确认的产品与技术决策

- 首版是“营销获客版”，目标用户是进入某家装修公司授权小程序的装修业主。
- 每家装修公司拥有独立授权小程序 AppID，所有装修公司运行同一代码模板。
- 使用抖音原生 TypeScript、TTML、TTSS，不使用 Taro、React 或其他跨端运行时。
- 小程序代码位于 gooes monorepo 的 `apps/douyin-mini`。
- 首版手机号方案为手动输入手机号加短信验证码；取得抖音手机号能力后切换为“一键手机号
  优先、短信验证兜底”的混合模式。
- 装修公司专属小程序的线索直接进入当前租户的 `marketing_leads`，不进入平台公海
  `platform_leads`。
- 小程序前端不得提交或决定 `tenant_id`。授权小程序实例与租户关系由后端维护。
- orange 仓库仅用于只读参考业务流程、展示字段和交互经验，不修改、不复制其 Taro/React
  运行时代码。

## 3. 目标与非目标

### 3.1 首版目标

1. 支持同一模板规模化部署到多家装修公司的授权小程序。
2. 展示装修公司的品牌、公开案例、公开在建工地、服务范围和联系方式。
3. 支持从短视频、直播、搜索、扫码和自然访问进入指定页面并记录归因。
4. 通过短信验证收集装修需求，保证租户归属、幂等和 24 小时防重复提交。
5. 与 Gooes 现有营销线索跟进、转客户和客户来源时间线衔接。
6. 建立模板开发、真机验证、授权小程序灰度、提审和发布的可重复流程。

### 3.2 首版不包含

- 客户施工项目、日志、验收、付款、摄像头和“我的项目”。
- 装修公司员工工作台或营销投放后台。
- 平台公海装修公司选择与平台统一分配线索。
- 在线支付、装修合同、AI 报价和 AI 设计。
- 在小程序内发起或管理直播。
- 直播间、短视频、广告投放和评论私信的运营管理界面。
- 为每家装修公司维护独立代码分支。

上述能力分别属于后续“客户交付版”“装企运营版”或平台运营后台，不进入首个模板。

## 4. 方案比较

### 4.1 采用方案：gooes monorepo 内的原生项目

将小程序放在 `apps/douyin-mini`，使用抖音 IDE 直接导入该子目录。优点是 API、migration、
管理后台和小程序契约可以在一次变更中评审与验证，同时小程序仍保持独立的原生工程边界。

### 4.2 未采用：独立仓库

独立仓库具有更强的发布隔离，但会增加接口、类型、文档和版本的同步成本。首个模板需要
频繁调整 Gooes 后端契约，因此不采用。

### 4.3 暂不采用：模板内核加多行业包

把公共模板内核与装修、家政、门店等行业包拆开有利于未来扩展，但首版只有装修行业，提前
抽象会增加构建和审核复杂度。待第二个行业模板出现明确复用需求后再评估。

## 5. 总体架构

```text
装修公司授权小程序
        │
        │ authorizer_appid + deployment_key + tt.login code
        ▼
Gooes API
        │
        ├── 查询抖音授权小程序安装记录
        ├── 交叉校验 authorizer_appid 与 deployment_key
        ├── 获取/刷新 authorizer_access_token
        ├── 调用抖音 code2sessionV2
        ├── 解析内部 tenant_id
        └── 签发 Gooes 抖音小程序会话
        │
        ├── Bootstrap / 公司资料
        ├── 公开案例 / 公开工地
        ├── 短信验证码
        ├── 装企直属营销线索
        └── 营销归因事件
```

### 5.1 安装实例识别

小程序通过 `tt.getEnvInfoSync().microapp.appId` 获取当前运行小程序 AppID，通过
`tt.getExtConfigSync().ext.deployment_key` 获取服务商在商户构建时写入的部署标识。

生产环境必须同时满足：

1. `authorizer_appid` 对应一条有效授权记录。
2. `deployment_key` 与该授权记录一致。
3. 授权记录绑定一个有效 Gooes 装修公司租户。
4. 装修公司状态和小程序安装状态均为可用。

`deployment_key` 是可公开的实例标识，不是鉴权凭证。后端不能仅凭它签发会话，必须使用
当前 AppID、`tt.login` code 和授权小程序调用凭证完成 code2session。

模板小程序在 IDE 中预览时没有商户生产 `ext_json`。只有明确登记为模板开发小程序的
AppID 可以在缺少 `deployment_key` 时使用专用测试安装记录；该 AppID 不发布为商户线上
小程序。客户端上报的 `envType` 只用于诊断，不能作为鉴权依据。生产授权小程序缺少
`deployment_key` 时必须拒绝，不允许回退到模板测试租户，也不允许从启动 query 接受租户
或部署标识。

### 5.2 多租户边界

- 小程序请求体、query 和 header 均不接受 `tenant_id`。
- Gooes 会话内部携带后端解析出的 `tenant_id`、安装实例 ID、授权小程序 AppID 和不可逆的
  抖音访客标识；原始 OpenID 保留在服务端身份边界，不下发给小程序。
- 公开内容、短信、线索和事件服务都从会话恢复租户上下文。
- 启动归因参数只用于统计，绝不用于选择租户。
- 不同装修公司小程序之间不能读取案例、工地、线索、事件或品牌配置。

## 6. 小程序本地目录

```text
gooes/
├── apps/
│   ├── api/
│   ├── admin/
│   └── douyin-mini/
│       ├── project.config.json
│       ├── package.json
│       ├── tsconfig.json
│       ├── typings/
│       └── src/
│           ├── app.ts
│           ├── app.json
│           ├── app.ttss
│           ├── pages/
│           │   ├── home/
│           │   ├── cases/
│           │   ├── case-detail/
│           │   ├── sites/
│           │   ├── site-detail/
│           │   ├── lead/
│           │   ├── lead-success/
│           │   ├── company/
│           │   ├── privacy/
│           │   └── service-unavailable/
│           ├── components/
│           │   ├── tenant-brand/
│           │   ├── hero-banner/
│           │   ├── trust-metrics/
│           │   ├── case-card/
│           │   ├── site-card/
│           │   ├── image-gallery/
│           │   ├── lead-cta/
│           │   ├── lead-form/
│           │   ├── sms-code-input/
│           │   ├── privacy-consent/
│           │   ├── pagination-loader/
│           │   ├── empty-state/
│           │   ├── error-state/
│           │   └── page-skeleton/
│           ├── api/
│           │   ├── request.ts
│           │   ├── auth.ts
│           │   ├── bootstrap.ts
│           │   ├── cases.ts
│           │   ├── sites.ts
│           │   └── leads.ts
│           ├── platform/
│           │   ├── env-info.ts
│           │   ├── ext-config.ts
│           │   ├── login.ts
│           │   ├── storage.ts
│           │   ├── navigation.ts
│           │   └── analytics.ts
│           ├── state/
│           │   ├── session.ts
│           │   └── bootstrap.ts
│           ├── models/
│           ├── config/
│           ├── utils/
│           └── assets/
└── packages/
    └── domain/
```

`project.config.json` 使用 `src/` 作为 `miniprogramRoot`，并启用抖音 IDE TypeScript
编译插件。`package.json`、`project.config.json` 和 `tsconfig.json` 保持同级。

目录职责：

- `pages` 只处理页面生命周期、页面状态和组件组合。
- `components` 保存 TTML/TTSS 原生展示与表单组件。
- `api` 只封装 Gooes HTTP 契约，不直接调用 `tt.*`。
- `platform` 只封装抖音运行时、扩展配置、登录、缓存、导航和事件采集。
- `state` 保存会话和 Bootstrap，禁止形成无边界全局业务仓库。
- `models` 保存小程序所需的精简 DTO 和视图模型。
- `config` 保存非敏感的环境与功能常量，不保存 AppSecret、Token 或生产部署凭证。

首版不让抖音 IDE 直接解析 monorepo 运行时包，也不直接运行时依赖 `@gooes/domain`。
实施时可以使用小程序本地 DTO；需要自动同步时，采用显式生成步骤并把生成结果纳入类型检查，
不得在两端复制不可追踪的业务枚举。

## 7. 页面与导航

### 7.1 底部导航

```text
首页 | 案例 | 工地 | 免费咨询
```

核心转化路径：

```text
短视频 / 直播 / 搜索 / 扫码 / 自然访问
                  │
                  ▼
        首页 / 案例详情 / 工地详情
                  │
                  ▼
     免费设计 / 预约量房 / 获取报价
                  │
                  ▼
              留资表单
                  │
                  ▼
              提交成功
```

### 7.2 页面职责

| 页面 | 职责 |
| --- | --- |
| 首页 | 公司品牌、主视觉、核心优势、精选案例、在建工地、服务流程、服务区域和转化入口 |
| 案例列表 | 按装修风格、户型等轻量筛选，分页加载公开案例 |
| 案例详情 | 效果图、户型、面积、预算区间、设计说明和咨询入口 |
| 工地列表 | 分页展示允许公开的在建项目 |
| 工地详情 | 小区简称、面积、施工阶段、公开进度和现场图片 |
| 免费咨询 | 手机号、验证码、需求字段和隐私授权 |
| 提交成功 | 展示成功、重复提交成功态和后续联系预期 |
| 公司介绍 | 公司简介、资质荣誉、服务范围、门店地址和客服电话 |
| 隐私页面 | 隐私政策、用户协议和当前版本 |
| 停用页面 | 安装异常、授权失效、装修公司停用等阻断状态 |

工地公开接口不得返回客户姓名、完整门牌号、业主电话、合同和财务信息。

### 7.3 首页顺序

1. 公司 Logo、名称和服务城市。
2. 主视觉与“免费获取装修方案”。
3. 服务承诺或优势数据。
4. 精选装修案例。
5. 在建工地。
6. 装修服务流程。
7. 服务区域。
8. 公司介绍摘要。
9. 底部咨询入口。

公司名称、Logo、主题色、联系电话、服务区域和模块开关统一由 Bootstrap 返回，模板代码
不写死商户资料。

## 8. 启动与登录流程

```text
App.onLaunch
  ├── tt.getEnvInfoSync：取得 appId、envType、版本
  ├── tt.getExtConfigSync：取得 deployment_key
  ├── 读取启动路径、scene 和允许的归因字段
  └── 冷启动调用一次 tt.login
          │
          ▼
POST /douyin-mini/auth/session
{
  app_id,
  deployment_key,
  code,
  launch_context
}
          │
          ├── 校验安装实例与租户
          ├── 获取/刷新 authorizer_access_token
          ├── 调用 code2sessionV2
          └── 签发 Gooes 小程序会话
          │
          ▼
GET /douyin-mini/bootstrap
```

会话失效时，客户端最多自动重新执行一次 `tt.login`，防止登录循环。OpenID 不作为客户端
Bearer Token，客户端只保存 Gooes 签发的短期会话。

### 8.1 Bootstrap 契约

```json
{
  "installation": {
    "status": "active",
    "template_version": "1.0.0"
  },
  "company": {
    "name": "示例装饰",
    "logo_url": "https://example.invalid/logo.png",
    "summary": "公司公开简介",
    "service_phone": "4000000000",
    "service_regions": []
  },
  "theme": {
    "primary_color": "#C45A32",
    "navigation_text_color": "black"
  },
  "features": {
    "cases": true,
    "sites": true,
    "sms_lead": true,
    "douyin_phone": false,
    "phone_capture_mode": "sms"
  },
  "content": {
    "home_banners": [],
    "trust_metrics": []
  }
}
```

首页需要的品牌、主题、功能开关和精选内容批量返回，避免 N+1 请求和多次内容闪烁。

## 9. API 设计

```text
POST /douyin-mini/auth/session
GET  /douyin-mini/bootstrap

GET  /douyin-mini/cases?page=1&pageSize=20
GET  /douyin-mini/cases/:id

GET  /douyin-mini/sites?page=1&pageSize=20
GET  /douyin-mini/sites/:id

GET  /douyin-mini/company

POST /douyin-mini/sms/send
POST /douyin-mini/leads
POST /douyin-mini/events
```

所有列表默认 `page=1&pageSize=20`，`pageSize` 最大为 100。列表 repository 必须限定必要
字段并使用 `.range()`、`.limit()` 或等价游标边界。首页精选内容使用受限条数，不调用列表
接口后再逐条查询详情。

API 后端遵循现有分层：

```text
controller：读取 HTTP、Zod 校验、调用 service、ResponseHandler.success
service：业务编排、租户上下文、去重、领域转换
repository：Supabase/SQL/RPC
gateway：抖音 OpenAPI 与授权凭证调用
```

建议目录：

```text
apps/api/src/
├── controllers/douyin-miniapp/
├── schema/douyin-miniapp.ts
├── services/douyin-miniapp/
├── repositories/douyin-miniapp-installations.ts
└── gateways/douyin-open-platform/
```

所有错误使用 `error-factory.ts`，禁止直接抛出裸 `Error`。

## 10. 短信留资与去重

### 10.1 留资字段

```json
{
  "name": "业主称呼",
  "phone": "13800000000",
  "sms_code": "123456",
  "community": "小区名称",
  "area": 120,
  "budget": "20-30万",
  "start_time": "三个月内",
  "demand": "装修需求说明",
  "privacy_policy_version": "2026-07-19",
  "consented_at": "2026-07-19T08:00:00.000Z",
  "idempotency_key": "客户端单次提交标识",
  "attribution": {
    "source_type": "short_video",
    "campaign_code": "允许的活动编号",
    "content_id": "允许的内容编号",
    "entry_path": "pages/case-detail/index",
    "scene": "抖音启动场景值"
  }
}
```

后端处理顺序：

1. 校验 Gooes 小程序会话、安装实例与租户状态。
2. 校验短信验证码与提交手机号一致。
3. 校验隐私政策版本、授权状态与授权时间。
4. 从会话恢复 `tenant_id` 和安装实例，忽略任何额外租户字段。
5. 在数据库事务内校验提交幂等键、消费短信验证码并执行 24 小时线索去重。
6. 在同一事务内创建或更新 `marketing_leads`，并保存幂等结果。
7. 写入 `lead_submit` 与 `lead_submit_success` 事件。
8. 返回统一成功态。

### 10.2 去重规则

同一 `tenant_id + source=douyin_miniapp + phone` 在 24 小时内只保留一条有效营销线索。
重复提交不报业务失败，而是更新原线索的最新表单和归因信息：

```json
{
  "lead_id": "已有线索 ID",
  "already_submitted": true,
  "updated_existing": true,
  "message": "你已提交预约，我们将尽快联系你"
}
```

不同装修公司租户中的同一手机号可以分别提交。`idempotency_key` 防止一次操作的并发重复，
24 小时规则处理跨页面、重新进入和更换客户端幂等键后的业务重复。

短信消费、幂等判定和线索创建/更新必须由一个 migration 管理的事务 RPC 完成，不能在
TypeScript service 中先查再写。RPC 先按“安装实例 + 幂等键”查询既有结果；新请求锁定
对应短信验证码，并以“租户 + 抖音来源 + 标准化手机号”为锁粒度串行执行 24 小时查重。
同一幂等键复用不同请求内容时返回业务冲突，不能静默复用旧结果。

### 10.3 线索后续

- `source = douyin_miniapp`。
- 线索直接归属当前装修公司租户。
- 提交时不自动创建客户。
- 装修公司员工在现有营销线索后台跟进并转换为客户。
- 转换后沿用现有客户来源和来源时间线规则。

## 11. 数据模型与 migration

所有表、字段、索引、约束、RLS、函数、触发器和字典值变更必须进入
`supabase/migrations/`。

### 11.1 `douyin_miniapp_installations`

该表是授权小程序与 Gooes 租户关系的唯一事实来源，至少保存：

- `id`、`tenant_id`。
- `component_appid`、`authorizer_appid`。
- 唯一且可轮换的 `deployment_key`。
- AES-256-GCM 加密后的 authorizer access/refresh token、有效期与凭证元数据。
- 授权权限集快照和授权状态。
- 模板 ID、模板版本、最后提交/审核/发布时间。
- access token 有效期和刷新状态；不得存储在前端或普通日志。
- 创建、更新时间和取消授权时间。

至少建立：

- `authorizer_appid` 唯一索引。
- `deployment_key` 唯一索引。
- `tenant_id + authorization_status` 查询索引。
- 授权状态与更新时间索引。

敏感授权凭证使用 Node/Bun 内置加密能力做 AES-256-GCM 信封加密，分别保存密文、IV、
认证标签和密钥版本。密钥来自部署环境 secret，不进入数据库 migration、源码或日志；
解密只发生在抖音 gateway 的凭证调用边界。密钥轮换采用“新版本写入、旧版本限时可读、
后台重加密”的双读策略，不为此引入 Redis 或新的凭证服务依赖。

### 11.2 营销线索扩展

复用 `marketing_leads`，通过 migration：

- 增加可空 `douyin_miniapp_installation_id` 外键。
- 允许并规范 `source = douyin_miniapp`。
- 增加 `(tenant_id, source, phone, created_at DESC)` 部分索引。
- 保持 H5 的 `tenant_id + page_id + phone` 去重路径不变。

当前 `marketing_leads.page_id` 已允许为空，因此无需为抖音线索伪造 H5 页面。

### 11.3 `douyin_miniapp_lead_submissions`

该表保存留资幂等事实，至少包含安装实例、幂等键、请求摘要、营销线索 ID、是否命中 24 小时
去重和创建时间。建立 `(douyin_miniapp_installation_id, idempotency_key)` 唯一约束。同一幂等
键再次提交时，只有请求摘要一致才返回既有结果；摘要不一致时返回业务冲突。

通过 `submit_douyin_miniapp_lead` 事务 RPC 原子完成：

1. 幂等键检查。
2. 短信验证码行锁定、有效性校验和消费。
3. 按租户、来源和标准化手机号串行执行 24 小时查重。
4. 创建新线索或更新已有线索。
5. 写入幂等结果并返回统一响应。

RPC 仅授权 `service_role` 调用，并固定安全的 `search_path`。应用层 service 负责业务编排和
领域转换，repository 只负责调用该 RPC。

### 11.4 身份与短信扩展

- `sms_verification_codes.scene` 和 `@gooes/domain` 增加 `douyin_lead`。
- 短信保留现有 60 秒冷却、5 分钟有效期、手机号/IP/设备限流机制。
- OpenID 不直接写入营销线索普通字段；归因事件使用安装实例和不可逆访客哈希。
- 首版不创建抖音用户账号，也不修改 `user_oauth_identities`；正式用户绑定属于客户交付版，
  需要单独设计 AppID 作用域下的 OAuth 唯一性。

### 11.5 营销事件扩展

首版复用营销事件领域，通过 migration 增加安装实例外键、来源字段，并扩展允许的事件名
约束以覆盖第 12 节事件。必须建立按
`tenant_id + source + event_name + created_at` 查询的索引，避免后续漏斗统计扫描全表。

新增或调整索引后使用代表性数据执行 `EXPLAIN ANALYZE`，确认公开列表、24 小时线索去重
和事件统计查询命中预期索引。

## 12. 营销归因

首版记录：

- `app_launch`
- `page_view`
- `case_view`
- `site_view`
- `lead_cta_click`
- `sms_send`
- `lead_submit`
- `lead_submit_success`
- `phone_call_click`

允许的归因字段只有来源类型、页面路径、抖音 scene、活动编号和内容编号。字段需要白名单、
格式和长度校验；原始启动 query 不整体落库。归因字段不参与租户解析，也不能覆盖安装记录。

## 13. 错误处理

| 错误码 | 客户端行为 |
| --- | --- |
| `DOUYIN_INSTALLATION_MISSING` | 进入“服务配置异常”页面 |
| `DOUYIN_INSTALLATION_DISABLED` | 进入“服务已暂停”页面 |
| `DOUYIN_AUTHORIZATION_EXPIRED` | 提示暂不可用并触发平台告警 |
| `DOUYIN_SESSION_EXCHANGE_FAILED` | 自动重新 `tt.login` 一次 |
| `TENANT_NOT_AVAILABLE` | 进入装修公司停用页 |
| `SMS_CODE_RATE_LIMITED` | 展示剩余冷却时间 |
| `SMS_CODE_INVALID` | 提示验证码错误并保留表单 |
| `SMS_CODE_EXPIRED` | 提示重新获取验证码并保留表单 |
| `NETWORK_ERROR` | 保留页面数据并允许重试 |

重复线索属于成功幂等响应，不使用错误码。列表首屏失败展示整页重试；后续分页失败只展示
当前页重试，不清空已加载内容。

## 14. 安全与隐私

- `component_appsecret`、authorizer token、refresh token 仅存在于后端。
- Token、手机号、验证码、OpenID 和 session key 禁止写入普通日志。
- 审计日志只记录安装实例 ID、租户 ID、操作、请求 ID、错误码和凭证刷新结果。
- 小程序仅连接已配置的 HTTPS 合法域名。
- 公开项目必须同时通过租户、公开状态和字段白名单校验。
- 短信按手机号、IP 和设备限流。
- 隐私授权版本、授权时间和提交时的政策版本必须可追溯。
- `ext_json` 只包含授权小程序 AppID和非敏感部署标识，不包含 Token、手机号或密钥。
- 服务商授权事件、取消授权事件和权限变化必须更新安装状态，不能继续使用失效凭证。

## 15. 验证与验收

### 15.1 静态验证

- 抖音小程序 TypeScript 类型检查。
- Gooes API TypeScript 类型检查和相关 Bun 测试。
- migration SQL 契约测试和数据库类型更新检查。
- 抖音 IDE 编译与代码包检查。

### 15.2 后端验收

1. 有效安装实例可以登录并获取正确租户的 Bootstrap。
2. `authorizer_appid` 与 `deployment_key` 不匹配时拒绝签发会话。
3. 客户端伪造 `tenant_id`、安装实例 ID 或启动归因不能改变租户。
4. 模板预览只使用登记的测试实例，生产环境没有测试租户回退。
5. 停用租户或取消授权的小程序不能继续读取内容或提交线索。
6. 授权凭证刷新不会误用其他装修公司的凭证。
7. 案例和工地列表默认分页、最大页大小和字段选择正确。
8. 短信验证码与手机号必须一致，冷却和限流有效。
9. 同租户同手机号 24 小时内不产生重复线索。
10. 不同租户中的同手机号可分别提交。
11. 并发重复点击只产生一次有效提交结果。
12. 日志和错误响应不包含敏感数据。

### 15.3 小程序验收

- 抖音 IDE 模拟器、模板小程序真机预览和授权测试小程序二维码。
- Android 与 iOS 真机。
- 首页、案例、工地、公司介绍、咨询和成功页。
- 短视频、直播、搜索、扫码和自然访问入口。
- 弱网、断网、接口超时、分页失败和返回页面恢复。
- 用户拒绝隐私授权、验证码失败和重复提交。
- 表单失败后内容保留，成功后阻止重复点击。

## 16. 模板发布、灰度与回退

```text
原生代码开发
  -> 抖音 IDE 上传模板小程序
  -> 第三方小程序草稿箱
  -> 添加到模板库并取得 template_id
  -> 使用授权小程序凭证提交模板代码和 ext_json
  -> 获取授权小程序测试二维码
  -> 真机验收
  -> 提交审核
  -> 审核通过后发布
```

`ext_json` 至少包含 `extEnable`、授权小程序 `extAppid` 和
`ext.deployment_key`。小程序使用 `tt.getExtConfigSync()` 读取 `ext` 自定义字段。

发布分批进行：

1. 模板小程序和授权测试小程序验证。
2. 首家合作装修公司灰度上线。
3. 观察登录、Bootstrap、页面访问、短信、留资和错误指标。
4. 扩展到 3 至 5 家装修公司。
5. 稳定后再启用批量构建、提审和发布。

每次发布保存模板 ID、代码版本、商户构建记录、审核记录和发布时间。上一稳定模板不得在
新版本观察期内删除。发生严重问题时停止后续发布，并通过正常构建、提审和发布流程，把
上一稳定模板重新提交给受影响商户。

## 17. Orange 与现有 Gooes 能力边界

可复用的 Gooes 后端领域包括多租户、公开项目、装修公司公开资料、营销线索跟进、线索转
客户、客户来源时间线、短信发送和验证码存储。具体实现前仍需逐个核对当前 repository、
service 和 migration，不按旧文档猜测当前 API。

orange 可只读参考：

- visitor 首页、公开项目详情、公司介绍和本地服务商的信息组织。
- 登录状态、定位上下文、图片库和线索提交的既有交互经验。
- 小程序对接文档中的租户安全规则。

必须重写：

- Taro/React 页面和组件。
- `wx.*` 登录、网络、位置、分享和授权调用。
- 微信登录、微信 H5 session 和微信手机号相关契约。
- 依赖微信条件编译或微信 SDK 的实现。

本设计不授权修改 `/Users/leefo/Public/work/orange` 中任何文件。

## 18. 实施顺序

设计获批后的实施计划按以下依赖顺序拆分：

1. 抖音第三方授权安装记录、凭证 gateway 和事件回调基础。
2. 抖音小程序 session 与 Bootstrap。
3. 原生小程序工程骨架、登录和停用态。
4. 公开案例、工地和公司资料接口及页面。
5. 短信场景、抖音营销线索、去重和咨询页面。
6. 归因事件、日志脱敏和可观测性。
7. 模板小程序上传、授权测试小程序构建和灰度验收。

每一阶段只解决一个明确目标，数据库变更使用独立 migration，并在应用后用
`supabase migration list` 验证 Local/Remote 对齐。

## 19. 参考资料

### 19.1 Gooes 与 Orange 资料

- `docs/2026-05-09-multi-tenant-phase-4-marketing-h5-platform-leads-todolist.md`
- `docs/2026-06-05-visitor-location-context-backend-integration.md`
- `docs/2026-07-05-miniprogram-partner-portal-handoff.md`
- `docs/application_integration_documentation/2026-05-09-phase-4a-wechat-miniprogram-integration.md`
- `docs/application_integration_documentation/2026-05-09-phase-4b-wechat-miniprogram-integration.md`
- `docs/application_integration_documentation/2026-05-09-phase-4e-wechat-miniprogram-integration.md`
- `/Users/leefo/Public/work/orange/docs/2026-06-05-visitor-location-context-miniprogram.md`
- `/Users/leefo/Public/work/orange/docs/2026-06-09-visitor-public-theme-backend-integration.md`

### 19.2 抖音官方资料

- [小程序代开发通用解决方案](https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/overview/current)
- [代开发小程序](https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/overview/businessintroduction/smallprogram)
- [代开发环节说明](https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/overview-guide/smallprogram/DevelopingCode)
- [授权权限集说明](https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/overview-guide/smallprogram/permissions)
- [提交代码 V2](https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/auth-app-manage/develop/upload-code-v2)
- [code2sessionV2](https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/auth-app-manage/login/code2session-v2)
- [TypeScript 支持](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/dev-tools/developer-instrument/development-assistance/typescript)
- [tt.getExtConfigSync](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/third-party-platform/tt-get-ext-config-sync)
- [tt.getEnvInfoSync](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/foundation/env/get-env-info-sync)
