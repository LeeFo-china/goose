# 抖音小程序文本资料领取设计

## 1. 背景与目标

Gooes 当前抖音装修小程序已经具备安装实例识别、租户隔离、匿名小程序会话、公开项目内容、预算初算、装修问答、短信量房预约和营销事件能力，但尚无面向访客的资料库、领取记录或“我的资料”页面。

本功能允许装修公司自行创建文本资料笔记。访客可以先查看摘要，再免手机号领取全文；领取后资料进入“我的资料”，可跨会话反复查看和复制。资料领取不自动创建营销线索或量房预约，预算初算和免费量房仅作为领取后的可选转化入口。

## 2. 已确认的产品决策

- 资料由装修公司完全自建，平台不统一发布，也不提供平台模板复制流程。
- 领取不要求手机号、短信验证码或额外个人资料。
- 领取记录绑定现有抖音小程序会话中的匿名主体标识。
- 未领取用户只能查看标题、摘要、分类和适用说明；领取后才能获取正文。
- 领取后资料进入“我的资料”，支持反复查看和复制全文。
- 首版只提供站内结构化文本，不生成 PDF，不提供外部文件下载。
- 不增加新的底部导航项，资料入口放在首页和资料中心内。

## 3. 方案比较与结论

### 3.1 将资料写入安装实例 `runtime_config`

该方案改动较少，但 `runtime_config` 当前用于品牌、主题和功能开关，不适合承载大量正文、分页列表、发布版本和领取记录。资料增长后会放大启动响应，并使内容管理与安装配置生命周期耦合。

### 3.2 复用平台官网 `site_content_*`

现有官网 CMS 已有不可变版本和内容块模式，可以复用其 schema、编辑器和发布流程思想，但现有表是平台级官网内容，没有租户隔离、抖音安装上下文或领取语义。直接复用会混合平台和租户权限边界。

### 3.3 独立租户资料域

采用独立的抖音资料表、版本表和领取表。复用现有内容块约束、版本发布模式、文件边界和后台组件，不复用平台官网的全局数据表。该方案与当前抖音多租户会话模型一致，也能把资料领取与量房线索分开。

## 4. 用户流程

```text
首页装修资料模块 / 资料中心
  -> 查看标题、摘要、分类和适用场景
  -> 进入资料预览
  -> 点击“免费领取”
  -> 服务端根据当前抖音会话原子领取
  -> 解锁领取时的发布版本
  -> 加入“我的资料”
  -> 反复查看或复制全文
  -> 可选进入预算初算或免费量房
```

领取过程不弹出手机号授权，不调用短信接口，不写入 `marketing_leads`，也不创建 `douyin_measurement_appointments`。

## 5. 数据模型

所有数据库结构、约束、索引、权限点、函数和初始化数据必须通过 `supabase/migrations/` 中的 forward migration 交付。

### 5.1 `douyin_material_notes`

资料主记录保存租户归属和发布指针：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID 主键 |
| `tenant_id` | 装修公司租户，不可由小程序客户端提交 |
| `status` | `draft`、`published`、`archived`、`withdrawn` |
| `published_version_id` | 当前或最后一次正式发布版本 |
| `published_at` | 首次或最近发布时间 |
| `created_by` / `updated_by` | 租户员工 ID |
| `created_at` / `updated_at` | 审计时间 |

状态规则：

- `draft`：不能被访客发现或领取。
- `published`：可以被发现、预览和领取。
- `archived`：不再出现在公开列表，也不允许新领取；既有领取仍可读取其锁定版本。
- `withdrawn`：合规撤回；公开访问和既有领取都不能读取正文。

资料不允许物理删除。误创建草稿可归档；已发布资料必须通过归档或撤回改变可见性。

允许的状态迁移为：

```text
draft -> published
draft -> archived
published -> published（发布新版本）
published -> archived
published -> withdrawn
archived -> published（重新发布明确选择的版本）
archived -> withdrawn
withdrawn -> 终态
```

重新发布归档资料不会改变已有领取锁定的历史版本，只影响后续新领取。

### 5.2 `douyin_material_note_versions`

版本记录不可变：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID 主键 |
| `tenant_id` / `note_id` | 复合租户归属 |
| `version_no` | 资料内单调递增版本号 |
| `title` | 1～300 字符 |
| `summary` | 1～1000 字符 |
| `category` | 1～100 字符，由装企自由填写 |
| `applicable_to` | 适用场景说明，可空，最大 300 字符 |
| `content_blocks` | 结构化文本块 JSON 数组 |
| `created_by` / `created_at` | 创建员工和时间 |

首版内容块只允许：

- `heading`：二级或三级标题；
- `paragraph`：普通段落；
- `list`：有序或无序列表；
- `quote`：引用；
- `callout`：普通提示或风险提示。

禁止 HTML、脚本、iframe、任意样式、外部 URL 和客户端直接提交的可执行内容。沿用 `SiteContentDraftBlocksSchema` 的数量、单块长度和序列化体积边界，并为资料域定义只包含上述文本块的窄 schema。

### 5.3 `douyin_material_note_claims`

领取记录保存领取时的正式版本：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID 主键 |
| `tenant_id` | 会话解析出的租户 |
| `douyin_miniapp_installation_id` | 当前安装实例 |
| `subject_hash` | 服务端生成的匿名主体散列，不向客户端或后台返回 |
| `note_id` | 被领取资料 |
| `claimed_version_id` | 领取时的发布版本 |
| `claimed_at` | 领取时间 |
| `removed_at` | 用户从“我的资料”移除的时间，可空 |

唯一约束为 `(douyin_miniapp_installation_id, subject_hash, note_id)`。同一用户重复或并发领取同一资料只产生一条记录，并返回原领取结果。

用户移除资料时保留领取记录但设置 `removed_at`，不再出现在“我的资料”。再次领取同一资料时，原子清空 `removed_at`、将 `claimed_version_id` 更新为当前发布版本并更新领取时间；不创建第二条记录。后台历史领取次数使用首次领取口径，当前收藏量使用 `removed_at IS NULL` 口径。

领取表通过包含 `tenant_id` 的复合外键约束资料、版本和安装实例属于同一租户，禁止仅依赖应用层判空或过滤实现隔离。

### 5.4 索引

- 公开列表：`(tenant_id, status, published_at DESC, id DESC)`。
- 后台列表：`(tenant_id, updated_at DESC, id DESC)`。
- 我的资料：`(douyin_miniapp_installation_id, subject_hash, claimed_at DESC, id DESC) WHERE removed_at IS NULL`。
- 资料标题、摘要和分类使用仓库已经安装的 `extensions.pg_trgm` GIN 索引支持租户内关键词搜索。

涉及列表、领取和搜索查询时只选择必要字段。列表不读取 `content_blocks`；正文只在详情且满足领取权限时查询。

## 6. 权限与安全边界

新增租户权限：

- `douyin_material_note.read`：查看资料和版本历史；
- `douyin_material_note.manage`：创建资料和新版本；
- `douyin_material_note.publish`：发布、归档和撤回。

权限点及默认角色映射通过 migration 初始化。租户后台接口从登录上下文恢复 `tenant_id` 和员工身份；小程序接口从 `douyin_miniapp` JWT 恢复 `tenant_id`、安装 ID、AppID 和 `subject_hash`。客户端请求体、query 和 header 均不接受租户 ID、安装 ID 或匿名主体标识。

跨租户资源访问统一返回 404，避免泄露资源是否存在。后台不提供领取用户列表，也不显示或导出 `subject_hash`，只展示聚合领取次数和转化数据。

## 7. API 契约

### 7.1 抖音小程序接口

```http
GET /douyin-mini/material-notes?page=1&pageSize=20&keyword=
GET /douyin-mini/material-notes/:id
POST /douyin-mini/material-notes/:id/claim
GET /douyin-mini/my-material-notes?page=1&pageSize=20
GET /douyin-mini/my-material-notes/:claimId
POST /douyin-mini/my-material-notes/:claimId/remove
POST /douyin-mini/my-material-notes/clear
```

列表默认 `page=1&pageSize=20`，`pageSize` 最大 100，按时间和 ID 稳定排序。

公开列表只返回当前已发布版本的标题、摘要、分类、适用场景、发布时间和 `claimed`。未领取详情返回相同预览信息，正文使用 `null` 或不返回，客户端不得通过隐藏组件持有未解锁正文。

领取接口没有业务 body。服务端在一个数据库命令中锁定当前发布状态、校验租户和安装、插入或读取领取记录，并返回：

```json
{
  "claim_id": "uuid",
  "already_claimed": false,
  "claimed_at": "2026-09-01T00:00:00.000Z",
  "material": {
    "id": "uuid",
    "version": 1,
    "title": "装修开工前检查清单",
    "summary": "开工交底前需要确认的事项",
    "category": "施工避坑",
    "applicable_to": "准备开工的业主",
    "content_blocks": []
  }
}
```

`GET /douyin-mini/my-material-notes/:claimId` 只能读取当前匿名主体自己的、尚未移除的领取记录。资料为 `archived` 时仍返回锁定版本；为 `withdrawn` 时返回业务错误且不返回正文。单篇移除和清空接口均不接受业务 body，重复执行幂等返回成功。清空由一个租户内原子命令设置当前匿名主体全部有效领取的 `removed_at`，返回 `removed_count`，不允许客户端循环模拟批量操作。

### 7.2 租户后台接口

```http
GET  /tenant/douyin-material-notes?page=1&pageSize=20&status=&keyword=
POST /tenant/douyin-material-notes
GET  /tenant/douyin-material-notes/:id
GET  /tenant/douyin-material-notes/:id/versions?page=1&pageSize=20
GET  /tenant/douyin-material-notes/:id/versions/:versionId
POST /tenant/douyin-material-notes/:id/versions
POST /tenant/douyin-material-notes/:id/publish
POST /tenant/douyin-material-notes/:id/archive
POST /tenant/douyin-material-notes/:id/withdraw
```

版本历史列表只返回版本号、标题、摘要、分类、适用场景、创建人和创建时间，
不返回 `content_blocks`。查看某个不可变版本正文时，后台单独调用版本详情接口；
该接口要求 `douyin_material_note.read` 权限，并同时按租户、资料 ID 和版本 ID
过滤。资料或版本跨租户、版本不存在、版本不属于指定资料时统一返回 404
`MATERIAL_NOTE_NOT_FOUND`，避免泄露资源存在性。

创建资料时同时创建第一个不可变版本。后续编辑创建新版本，不直接更新历史版本。发布请求明确提交 `version_id` 和期望状态或版本，避免并发覆盖。归档和撤回要求显式原因；撤回后不能恢复，只能复制内容创建新资料。

发布、归档和撤回命令要求 `Idempotency-Key`，服务端必须校验同一 key 的请求摘要，禁止同一 key 被不同命令或参数复用。

所有 controller 只处理 HTTP、参数校验和响应包装；service 负责编排和领域转换；repository 或 RPC gateway 负责 Supabase、SQL 与 RPC。错误必须通过 `error-factory.ts` 包装。

## 8. 页面与交互

### 8.1 装企后台

在“抖音小程序”菜单下增加“资料笔记”，与小程序工作台和线索管理并列。

列表展示标题、分类、状态、当前版本、领取次数、发布时间和更新时间。支持状态、关键词和分页筛选。无管理权限时只读；无发布权限时隐藏或禁用发布、归档和撤回操作，并说明所需权限。

编辑使用独立页面而非弹窗，分为基本信息、正文内容块和小程序预览。保存只创建新版本。发布前必须确认目标版本。归档二次确认；撤回需要填写原因并进行高风险确认。

后台只展示聚合领取次数、资料详情访问量、复制量以及进入预算和量房入口的次数，不展示匿名主体明细。

### 8.2 抖音小程序

保持当前四个底部导航不变，新增：

```text
pages/materials/index
pages/material-detail/index
pages/my-materials/index
```

首页增加“装修资料”模块，最多展示最近发布的 4 篇资料，并提供“查看全部”和“我的资料”入口。资料中心支持关键词搜索和分页加载。“我的资料”入口位于资料中心顶部，因为当前小程序没有个人中心。

未领取详情展示标题、摘要、分类、适用场景和领取提示。点击“免费领取”后立即调用领取接口，按钮在请求期间锁定。成功后在当前页面解锁全文并显示“已加入我的资料”。重复进入已领取资料时直接加载领取版本。

正文底部提供“复制全文”“预算初算”“免费量房”。复制使用 `tt.setClipboardData`；预算和量房仅在用户主动点击时导航，领取成功本身不触发留资或弹窗。

“我的资料”支持移除单篇资料和清空全部资料。清空操作调用服务端租户内原子命令并必须二次确认；移除后不再返回正文，重新领取按当前发布版本恢复。

服务端是领取状态的唯一可信来源。本地只缓存领取状态用于减少闪烁，不把正文长期缓存作为权限依据。领取响应丢失时重新获取详情即可恢复，客户端不得循环创建领取请求。

## 9. 埋点与统计

新增事件：

- `material_preview`；
- `material_claim`；
- `material_copy`；
- `material_budget_click`；
- `material_lead_click`。

领取数量以 `douyin_material_note_claims` 为准。`material_claim` 由服务端在领取命令成功后记录，不能由客户端伪造。其他事件沿用当前抖音营销事件的会话、归因、时间窗口和批量写入边界。

统计第一期只提供资料维度聚合，不提供用户画像、跨租户分析或匿名主体导出。

## 10. 隐私与数据保留

本功能不新增手机号、姓名、地址等直接身份信息，但会新增与匿名 `subject_hash` 关联的资料领取历史，属于需要向用户说明用途的使用记录。上线前必须更新各安装实例的隐私政策内容和版本，明确：

- 处理资料领取记录的目的仅为提供“我的资料”和领取恢复；
- 不将领取动作自动转为销售线索；
- 不向装修公司后台展示匿名主体明细；
- 用户可以在“我的资料”中移除单篇或清空全部领取记录；
- 合规、安全或法定义务要求保留的最小审计数据按隐私政策说明处理。

`subject_hash`、请求 IP 和 User-Agent 不进入资料正文、领取 API 响应或后台导出。营销事件继续沿用现有保留和清理规则，不因资料领取建立新的跨租户用户画像。

“移出我的资料”只改变收藏可见状态，不宣称等同于个人信息删除。隐私政策必须同时提供数据删除申请渠道；收到并核验当前抖音主体的数据删除请求后，服务端应删除该主体的资料领取记录，并按既定营销事件保留规则删除或匿名化可关联事件，不能只设置 `removed_at`。

## 11. 错误语义

| 场景 | HTTP | 业务码 | 客户端处理 |
| --- | --- | --- | --- |
| 资料不存在或跨租户 | 404 | `MATERIAL_NOTE_NOT_FOUND` | 返回列表并提示资料不存在 |
| 版本详情不存在、跨租户或不属于资料 | 404 | `MATERIAL_NOTE_NOT_FOUND` | 刷新资料和版本列表 |
| 草稿、归档资料的新领取 | 409 | `MATERIAL_NOTE_NOT_AVAILABLE` | 刷新详情，不重试领取 |
| 资料已撤回 | 410 | `MATERIAL_NOTE_WITHDRAWN` | 清空正文并展示停止提供 |
| 领取记录已移除 | 404 | `MATERIAL_NOTE_CLAIM_NOT_FOUND` | 返回“我的资料”列表 |
| 小程序会话无效 | 401 | 现有会话错误码 | 走现有 session 恢复流程 |
| 发布版本不属于资料 | 409 | `MATERIAL_NOTE_VERSION_CONFLICT` | 后台刷新版本列表 |
| 发布并发冲突 | 409 | `MATERIAL_NOTE_STATE_CONFLICT` | 后台刷新详情后重新确认 |
| 内容块非法 | 400 | 统一参数校验错误 | 定位到对应编辑字段 |

重复领取不是错误，返回 HTTP 200 和 `already_claimed=true`。

## 12. 验收与验证

### 12.1 后端

- A 租户创建的资料不能被 B 租户读取、修改、发布或领取。
- 草稿和未发布新版本不会出现在小程序响应中。
- 未领取详情响应不包含任何正文块。
- 相同用户串行或并发领取只生成一条记录。
- 移除后不再出现在“我的资料”，再次领取复用原记录并锁定当前发布版本。
- 不同匿名主体可以分别领取同一资料。
- 归档后不能新领取，既有领取仍可读取。
- 撤回后新旧领取均不能读取正文。
- 所有列表分页且 `pageSize` 最大 100。
- 版本历史列表不返回正文；只有通过租户、资料和版本三重校验的版本详情返回 `content_blocks`。
- 搜索、公开列表和我的资料查询命中预期索引；必要时使用 `EXPLAIN ANALYZE` 验证。
- 无 `manage` 或 `publish` 权限的员工写操作返回 403。
- 领取不创建 `marketing_leads`、短信验证码或量房预约。

### 12.2 后台

- 草稿、新版本、发布、归档和撤回状态与可用操作一致。
- 发布前可以预览选定版本，未发布版本不会替换线上内容。
- 高风险撤回必须填写原因并二次确认。
- 后台不展示匿名主体标识或领取用户明细。

### 12.3 抖音小程序

- 首页、资料中心、预览详情、领取全文和我的资料链路完整。
- 领取请求期间不能重复点击；网络结果不确定时可通过刷新恢复。
- 复制全文成功和失败反馈明确。
- 单篇移除和清空全部均需确认，完成后服务端不再返回已移除正文。
- 归档和撤回状态符合服务端契约。
- 预算和量房入口只在主动点击时跳转。
- Android、iOS 真机验证文本布局、长内容滚动、返回恢复、分页和剪贴板能力。

## 13. 发布与回滚

建议按以下顺序交付：

1. 数据库 migration、领域 schema、repository/service/controller 和权限测试；
2. 装企后台资料管理；
3. 抖音小程序资料中心、领取和我的资料；
4. 更新隐私政策内容和版本，并完成隐私弹窗回归；
5. dev migration 对齐、API 发布、后台发布和抖音体验版真机验收；
6. 创建新抖音模板版本，再按现有租户发布流程生成体验版、提审和发布。

数据库 migration 必须提供 forward-only 回滚说明。未产生生产领取数据时，可以先部署关闭资料路由的 API，再撤销函数和删除新表；已有领取数据后不得删除历史表，应通过后续 migration 禁用新领取并保留审计数据。

小程序回滚到不展示资料入口的旧模板不会删除后台资料和领取记录。服务端在旧客户端期间保留原接口，不改变现有 bootstrap、预算、问答和量房契约。

## 14. 官方能力与合规依据

- 抖音小程序提供 `tt.setClipboardData`，可用于用户主动复制已领取全文：<https://partner.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/device/pasting-board/tt-set-clipboard-data>
- 抖音小程序隐私协议开发指南要求在处理个人信息前完成告知和授权：<https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/security-requirements/privacy-authorize>
- 本方案不新增手机号、姓名等直接身份信息采集，资料领取继续使用现有服务端匿名主体散列；隐私政策需新增领取历史用途说明，后续量房预约仍沿用现有隐私同意和短信验证流程。
