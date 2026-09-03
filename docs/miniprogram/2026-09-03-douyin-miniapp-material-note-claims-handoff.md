# 抖音小程序资料笔记展示与领取交接

## 1. 文件命名与适用范围

本文档专用于装企自建抖音小程序资料笔记能力，对应 gooes 仓库内
`apps/douyin-mini` 和后端 `/douyin-mini/*` 接口。

为避免和微信小程序 Orange 对接文档混淆，后续抖音小程序交接文档统一使用：

```text
YYYY-MM-DD-douyin-miniapp-<business-topic>-handoff.md
```

微信小程序交接文档继续使用：

```text
YYYY-MM-DD-wechat-miniprogram-<business-topic>-handoff.md
```

如果历史文档仍使用 `miniprogram` 泛称，正文必须在开头明确写清楚适用端。本次能力
不适用于微信小程序 Orange，Orange 仓库无需修改。

## 2. 当前结论

抖音小程序已经实现“装修资料 / 资料笔记”的展示、免手机号领取和“我的资料”读取
链路。

该能力不是装修笔记社区内容流，而是装企在租户后台自建资料，访客在抖音小程序中查看
摘要、领取全文，并在“我的资料”中反复查看。

## 3. 产品边界

- 资料由装修公司在租户后台自建、创建版本并发布。
- 小程序访客未领取前只能看到标题、摘要、分类和适用说明。
- 点击“免费领取”后立即解锁正文，不要求手机号、短信验证码或额外个人资料。
- 领取记录绑定当前抖音小程序匿名会话主体。
- 领取资料不会自动创建营销线索、量房预约或手机号记录。
- “预算初算”和“免费量房”只是领取后的可选转化入口。
- 已领取资料进入“我的资料”，支持重复查看、复制全文、移出单篇和清空全部。

## 4. 小程序页面与入口

| 场景 | 文件 | 说明 |
| --- | --- | --- |
| 页面注册 | `apps/douyin-mini/src/app.json` | 已注册资料列表、详情和我的资料页面 |
| 首页模块 | `apps/douyin-mini/src/pages/home/index.ttml` | “装修资料”模块，含“查看全部 / 我的资料”入口 |
| 资料列表 | `apps/douyin-mini/src/pages/materials/index.ttml` | 搜索、分页、空态、失败重试 |
| 资料详情 | `apps/douyin-mini/src/pages/material-detail/index.ttml` | 未领取预览、免费领取、领取后正文展示 |
| 我的资料 | `apps/douyin-mini/src/pages/my-materials/index.ttml` | 已领取列表、移出、清空全部 |

当前底部 Tab 不增加“资料”入口，仍通过首页模块和资料中心入口进入。

## 5. 抖音小程序 API 契约

### 5.1 通用规则

- Base URL 使用当前抖音小程序运行环境配置。
- 认证使用现有抖音小程序会话 token。
- 客户端不得提交 `tenant_id`、安装实例 ID、`subject_hash`、手机号或 OpenID。
- 列表接口必须分页，默认 `page=1&pageSize=20`，`pageSize` 最大 `100`。
- 关键词 `keyword` 仅用于公开资料列表，长度 1～120 字符。
- 服务端返回图片块时只返回可公开访问的 HTTPS URL，不返回私有对象路径。

### 5.2 公开资料列表

```http
GET /douyin-mini/material-notes?page=1&pageSize=20&keyword=
```

用于资料中心和首页资料模块。

响应主体：

```ts
{
  list: Array<{
    id: string;
    title: string;
    summary: string;
    category: string;
    category_id?: string | null;
    applicable_to: string | null;
    published_at: string;
    claimed: boolean;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

注意：列表不返回正文 `content_blocks`。

### 5.3 资料预览详情

```http
GET /douyin-mini/material-notes/:id
```

用于进入资料详情页的未领取预览。

响应字段与列表项一致，不返回正文。客户端不能通过隐藏节点或缓存保存未解锁正文。

### 5.4 免费领取全文

```http
POST /douyin-mini/material-notes/:id/claim
```

请求无业务 body。重复领取同一资料幂等返回既有领取结果。

响应主体：

```ts
{
  claim_id: string;
  already_claimed: boolean;
  claimed_at: string;
  material: {
    id: string;
    version: number;
    title: string;
    summary: string;
    category: string;
    category_id?: string | null;
    applicable_to: string | null;
    content_blocks: DouyinMaterialNotePublicBlock[];
  };
}
```

领取成功后，客户端应：

1. 将页面状态切到已领取；
2. 渲染 `material.content_blocks`；
3. 展示“已加入我的资料”；
4. 禁止重复点击造成并发提交。

如果领取请求超时或结果不确定，客户端应重新拉取当前资料或进入“我的资料”恢复状态，
不要自动重复 POST。

### 5.5 我的资料列表

```http
GET /douyin-mini/my-material-notes?page=1&pageSize=20
```

只返回当前匿名主体尚未移出的领取记录。

响应列表项：

```ts
{
  claim_id: string;
  id: string;
  version: number;
  title: string;
  summary: string;
  category: string;
  category_id?: string | null;
  applicable_to: string | null;
  claimed_at: string;
}
```

### 5.6 我的资料详情

```http
GET /douyin-mini/my-material-notes/:claimId
```

用于读取已领取资料的锁定版本正文。

- 资料为 `published`：返回领取时锁定的版本正文。
- 资料为 `archived`：仍返回领取时锁定的版本正文。
- 资料为 `withdrawn`：返回业务错误，不返回正文。

### 5.7 移出和清空

```http
POST /douyin-mini/my-material-notes/:claimId/remove
POST /douyin-mini/my-material-notes/clear
```

请求无业务 body。

移出单篇响应：

```ts
{ removed: true }
```

清空全部响应：

```ts
{ removed_count: number }
```

两个接口都应按幂等操作处理。客户端不要循环调用单篇移出来模拟清空。

## 6. 正文内容块渲染

小程序端当前支持以下正文块：

```ts
type DouyinMaterialNotePublicBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; style: 'ordered' | 'unordered'; items: string[] }
  | { type: 'quote'; text: string; attribution?: string }
  | { type: 'callout'; tone: 'info' | 'warning'; title: string; text: string }
  | {
      type: 'image';
      asset: {
        fileId: string;
        src: string;
        alt: string;
        width: number;
        height: number;
      };
      caption?: string;
    };
```

图片块渲染规则：

- 使用 `asset.src` 作为 `<image>` 的 `src`。
- `src` 必须是服务端下发的 HTTPS URL。
- 不支持外链图片、base64 图片或客户端自造 URL。
- `alt` 用于可访问性和复制文本兜底。
- `caption` 有值时展示图片说明。

## 7. 错误处理

客户端应识别以下稳定业务错误：

| code | HTTP | 建议展示 |
| --- | --- | --- |
| `MATERIAL_NOTE_NOT_FOUND` | 404 | 资料不存在，返回资料中心 |
| `MATERIAL_NOTE_NOT_AVAILABLE` | 409 | 资料暂不可领取 |
| `MATERIAL_NOTE_WITHDRAWN` | 410 | 资料已停止提供 |
| `MATERIAL_NOTE_CLAIM_NOT_FOUND` | 404 | 已领取记录不存在或已移出 |
| `MATERIAL_NOTE_VERSION_CONFLICT` | 409 | 资料版本变化，重新加载 |
| `MATERIAL_NOTE_STATE_CONFLICT` | 409 | 状态变化，重新加载 |

网络错误、超时和 5xx 不应影响首页其他模块。首页资料模块失败时只展示局部失败和重试。

## 8. 后端与租户后台接口边界

抖音小程序只对接 `/douyin-mini/*` 路由。租户后台资料创建、分类、版本、发布、归档和撤回
使用 `/tenant/douyin-material-notes*` 路由，不由小程序端调用。

小程序端不需要理解后台版本发布细节，只需要遵守：

- 公开列表只展示 `published` 资料。
- 领取后读取的是领取时锁定版本。
- 归档资料不再开放新领取，但已领取用户仍可读锁定版本。
- 永久撤回资料不再对任何访客返回正文。

## 9. 与微信小程序的区分

| 项目 | 抖音小程序 | 微信小程序 |
| --- | --- | --- |
| 仓库/模块 | `gooes/apps/douyin-mini` | `orange` |
| 接口前缀 | `/douyin-mini/*` | 微信员工/客户端既有业务接口 |
| 登录主体 | 抖音小程序匿名会话 | 微信小程序登录态 |
| 本能力是否适用 | 是 | 否 |
| 是否要求手机号 | 领取资料不要求 | 不涉及 |
| 文档命名 | `douyin-miniapp-...-handoff.md` | `wechat-miniprogram-...-handoff.md` |

如果后续微信小程序也要做资料领取，应单独设计接口、权限、页面和交接文档，不复用本文作为
微信端验收依据。

## 10. 小程序验收清单

- 首页能看到“装修资料”模块，并能进入资料中心和我的资料。
- 资料中心能分页加载、关键词搜索、空态和失败重试。
- 未领取详情不包含正文，只显示标题、摘要、分类和适用说明。
- 点击“免费领取”不弹手机号授权，成功后立即显示正文。
- 正文能渲染标题、段落、列表、引用、提示块和图片。
- 图片使用服务端下发 URL，真机能正常展示。
- “复制全文”只能在领取后使用，复制内容包含图片文字兜底，不复制外链脚本。
- “预算初算 / 免费量房”只作为主动点击转化入口，不因领取自动提交线索。
- 我的资料能读取已领取资料详情、移出单篇和清空全部。
- 归档资料对已领取用户仍可读；撤回资料不可读正文。
- 首页资料模块失败不影响项目、预算、问答和量房入口。

## 11. 相关实现与文档

- 抖音小程序页面注册：`apps/douyin-mini/src/app.json`
- 首页资料模块：`apps/douyin-mini/src/pages/home/index.ttml`
- 资料中心：`apps/douyin-mini/src/pages/materials/index.ttml`
- 资料详情：`apps/douyin-mini/src/pages/material-detail/index.ttml`
- 我的资料：`apps/douyin-mini/src/pages/my-materials/index.ttml`
- 小程序 API wrapper：`apps/douyin-mini/src/api/materials.ts`
- 后端抖音小程序控制器：`apps/api/src/controllers/douyin-miniapp/index.ts`
- 后端资料服务：`apps/api/src/services/douyin-miniapp/material-notes.ts`
- 领域类型：`packages/domain/src/douyin-material-note.ts`
- 设计文档：`docs/superpowers/specs/2026-09-01-douyin-material-note-claim-design.md`
- 实施计划：`docs/superpowers/plans/2026-09-01-douyin-material-note-claims.md`
- 查询性能门禁说明：`docs/runbooks/douyin-material-note-explain.md`
