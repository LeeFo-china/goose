# 独立官网应用与城市合伙人内容平台架构设计

日期：2026-07-11
状态：已确认
目标仓库：`gooes`

## 1. 背景

当前城市合伙人公开招募页位于 `apps/admin`：

```text
apps/admin/app/(site)/partners/page.tsx
apps/admin/components/official-site/partner-application-form.tsx
apps/admin/app/api/public/partner-applications/route.ts
```

该实现完成了“官网申请线索 -> 超管审核 -> 转正式合伙人”的 MVP，但公开官网与
Admin 后台共用同一 Next.js 应用。生产环境需要依赖 Nginx 白名单阻止官网域名访问
`/login`、`/platform/*` 等后台路径，公开站点与管理后台的发布周期、缓存策略和安全
边界也被绑定在一起。

下一阶段官网不再只是城市合伙人单页，而是承载首页、产品、解决方案、案例、文章、
城市 SEO 落地页和关于我们等完整公开内容。运营人员需要通过现有 Admin 维护动态
内容；未来第二阶段还可能增加城市合伙人 Web 工作台。

## 2. 已确认决策

- 新建独立应用 `apps/web`。
- 使用 Next.js App Router、React、TypeScript。
- 一期建设完整公开官网，不上线合伙人 Web 工作台。
- 为第二阶段 `/portal/*` 和 `platform_partner` 登录态保留架构边界。
- 内容采用混合模式：核心营销页由代码维护，文章、案例和城市页由 CMS 维护。
- CMS 编辑端复用现有 `apps/admin`，不引入 Strapi、Directus 等新系统。
- 生产继续使用腾讯云 Docker、Nginx 和 GitHub Actions 自托管。
- `apps/web` 不直接访问 Supabase，只调用 `apps/api`。
- 一期不创建通用 `packages/ui`，只通过 `@gooes/domain` 共享稳定契约。
- 应用拆分与 Next.js 大版本升级不放在同一批变更中。

## 3. 技术选型

### 3.1 推荐栈

```text
Framework        Next.js App Router
UI Runtime       React 19
Language         TypeScript
Styling          Tailwind CSS + 精简的 shadcn/Radix 组件
Validation       Zod
Forms            React Hook Form
Shared Contract  @gooes/domain
E2E              Playwright
Deployment       Next.js standalone + Docker + Nginx
```

实现阶段应与 `apps/admin` 当前验证过的 Next.js 和 React 主版本保持一致。框架升级应
单独评估和验证，避免将迁移故障与升级故障混在一起。

### 3.2 备选方案评估

#### Astro + React Islands

Astro 适合静态内容网站，也支持 Node Adapter、按路由 SSR 和内容集合。但本项目已经
使用 Next.js/React，后续还需要 `/portal` 动态工作台。引入 Astro 会增加框架、路由、
测试和组件复用成本，因此只作为“永远保持纯内容官网”时的备选。

#### Vite + React SPA

Vite SPA 构建简单，但 SEO 所需的 SSR、SSG、动态 Metadata、Sitemap、缓存失效和
自托管服务端需要自行组装。Vite 官方 SSR API 也偏底层，不适合本次完整官网目标。

### 3.3 官网设计基线

#### Design Read

将本项目理解为：面向装修企业负责人和城市渠道伙伴的完整 B2B 品牌官网，视觉语言
务实、在地、可靠，以鹅班长现有黄黑识别和真实装修业务场景为基础，使用定制化
Tailwind 构图与 shadcn/Radix 交互组件，不采用通用 SaaS 营销模板。

设计参数固定为：

```text
DESIGN_VARIANCE   7
MOTION_INTENSITY  4
VISUAL_DENSITY    4
```

- `DESIGN_VARIANCE 7`：桌面端允许不对称构图、不同图片比例和有节奏的留白，但不能
  牺牲可信度、阅读顺序和转化路径。
- `MOTION_INTENSITY 4`：只使用有目的的加载、层级揭示、表单反馈和状态过渡，不使用
  滚动劫持、磁吸按钮和持续装饰动画。
- `VISUAL_DENSITY 4`：官网保持清晰浏览节奏，申请表、政策边界和案例数据仍需足够
  紧凑，不能用过度留白隐藏关键信息。

#### 品牌与主题

物理使用场景是：装修公司负责人或城市渠道伙伴在白天办公室、门店或工地间隙，
常用手机快速判断平台是否可信、合作边界是否清楚，再决定咨询或申请。因此默认界面
采用高对比浅色主题，同时通过语义 Token 完整支持系统深色主题。单次浏览只激活一个
页面级主题，不允许某个内容 Section 自行切换成另一套主题。

- 保留鹅班长黄色、近黑色和现有 Logo，黄色用于品牌识别、主要动作、焦点和关键状态，
  不能铺满所有表面。
- 官网不直接复制 Admin 的暖色工作台。基础表面使用中性浅色或近黑色，黄色作为唯一
  品牌强调色；成功、警告和错误仅使用语义状态色。
- 第一阶段迁移前应盘点 Logo、图片、字体授权、现有投放链接和分析事件。未经确认不
  修改 Logo、主要导航名称、申请字段顺序、公开 URL 和埋点标识。
- 字体方向为清晰、有工程感但不僵硬的中文无衬线。实施前必须核对可商用字体与实际
  字重资源，不默认使用 Inter、编辑杂志式衬线或装饰性等宽字体。
- 色彩统一使用 CSS 语义 Token；新 Token 使用 OKLCH 表达，并验证浅色、深色两套
  对比度。正文和占位文本至少达到 WCAG AA。

#### 页面构图与素材

- 核心页面使用自定义营销构图。首屏优先采用左侧价值主张、右侧真实业务视觉或其他
  有明确阅读方向的不对称布局，标题桌面端最多两行，主要 CTA 在首屏可见。
- Hero、案例和城市页必须使用真实项目照片、经过确认的品牌素材或按页面生成的位图
  素材。禁止用 CSS 色块、拼装 `div` 或伪后台界面冒充产品截图。
- 现有 `partner-hero-renovation.png` 和 `logo.png` 作为迁移输入，不自动视为最终素材；
  实施时需要按清晰度、版权、构图、移动端裁切和暗色主题适配重新验收。
- 同一页面不得重复三等分功能卡、连续三段左右交替图文、每节小号大写眉题或编号章节。
  卡片只在表达真实层级、选择或交互边界时使用。
- 每个多列 Section 必须定义 `< 768px` 的单列顺序。Hero 使用 `min-h-[100dvh]` 或
  内容驱动的最小高度，不使用 `h-screen`；桌面导航保持单行且高度不超过 80px。
- 页面文案使用装修业务中的具体名词和动作，不使用空泛营销词。CTA 使用统一的动词加
  对象表达，同一意图不能在一个页面中出现多个近义标签。

#### shadcn 使用边界

shadcn/ui 是交互与可访问性的组件基础，不是官网的视觉模板。营销 Section、图片构图、
版式节奏和品牌背景应由页面组件实现；Button、Field、Select、Dialog、Accordion、
Alert、Skeleton 等交互元素优先复用 shadcn/Radix。

- `apps/web` 初始化时先运行 `pnpm dlx shadcn@latest info`，再通过 `search`、`docs`、
  `view` 和 `add --dry-run` 核对真实组件 API。不得猜测组件、属性、图标库或 primitive。
- 初始化后锁定一种 shadcn preset、primitive base、圆角规则和图标族，不与另一套设计
  系统混用。官网可以定制 Token、字体、半径和组件 Variant，但不能在页面内用原始颜色
  覆盖组件语义样式。
- 表单使用 `FieldGroup`、`Field`、`FieldLabel` 和对应控件；错误状态同时设置
  `data-invalid` 与 `aria-invalid`，标签不能由 placeholder 代替。
- Dialog、Sheet 和 Drawer 必须包含可访问标题；加载使用结构匹配的 Skeleton 或
  Button 内 Spinner；提示、空状态和状态标签分别使用 Alert、Empty 和 Badge。
- 组件内间距使用 `gap-*`，等宽高使用 `size-*`，条件类使用 `cn()`；浮层使用组件自身
  层级，不添加任意 z-index。
- 默认使用 React Server Components。只有表单、菜单、主题切换和动画等交互叶子组件
  使用 `"use client"`，不得把整页转成客户端组件。

#### 动效、可访问性与质量门槛

- 动画必须说明它传达的层级、反馈或状态。优先只动画 `transform` 和 `opacity`，不监听
  `window.scroll` 驱动 React state。
- 所有自动动画提供 `prefers-reduced-motion` 静态或即时替代。默认内容在动画未执行时
  仍必须可见，避免隐藏标签页、爬虫或无脚本场景出现空白。
- 所有交互具备 hover、focus、active、disabled、loading 和 error 状态。键盘焦点清晰，
  触控目标可用，表单错误就近展示，不能只靠颜色传递状态。
- 每个公开页面至少在手机、平板和桌面三档做截图验收，并分别检查浅色、深色主题。
- 发布前运行设计预检，机械检查 Hero 高度、CTA 换行、眉题数量、重复布局、真实图片、
  文案、对比度、键盘访问、减少动态效果和所有加载、空、错状态。
- 性能目标为 LCP `< 2.5s`、INP `< 200ms`、CLS `< 0.1`。Hero 图片必须预留尺寸并
  预加载，非首屏动效与图片延迟加载；最终以 Lighthouse 和真实移动端 smoke 验证。

## 4. 应用边界

### 4.1 `apps/web`

负责：

- 首页、产品、解决方案、城市合伙人、关于我们等核心官网页面。
- 文章、案例、城市 SEO 页的公开渲染。
- 城市合伙人公开申请的同源代理。
- Metadata、Sitemap、Robots、Canonical、Open Graph、JSON-LD。
- Preview 和内容发布后的缓存失效入口。
- 第二阶段 `/portal/*` 的路由和认证扩展点。

不负责：

- 直接访问 Supabase 或执行 SQL。
- CMS 内容编辑、审核、发布管理。
- 城市合伙人申请审核、分佣和结算管理。
- 复制 Admin 的平台权限系统。
- 承担可以放在 API service/repository 的业务逻辑。

### 4.2 `apps/admin`

负责：

- 官网内容草稿、预览、发布、归档和历史版本回滚。
- 城市合伙人申请审核和平台运营。
- 发布权限和审计记录的管理界面。

### 4.3 `apps/api`

负责：

- CMS 管理接口和公开内容读取接口。
- 内容状态、版本、权限和发布事务。
- 城市合伙人申请、认证和看板现有业务。
- 对数据库记录进行领域转换，返回稳定 DTO。

API 必须继续遵守 controller/service/repository 分层，错误响应经
`error-factory.ts` 包装。

### 4.4 `apps/h5`

保持现有营销 H5 职责，不承担完整官网或城市合伙人门户。

### 4.5 `@gooes/domain`

只共享跨应用稳定契约：

- 内容类型与状态枚举。
- 公开内容摘要、详情和分页 DTO。
- CMS 内容块联合类型。
- CMS 权限常量。

不把 Next.js 组件、服务端实现或 Admin 内部表单类型放入 domain 包。

## 5. 运行架构

```text
公开用户
  -> www.goodcms.cn
  -> Nginx
  -> apps/web (Next.js standalone)
  -> apps/api 公开接口
  -> Supabase / COS

运营人员
  -> admin.goodcms.cn
  -> apps/admin
  -> apps/api CMS 管理接口
  -> Supabase / COS
```

新增服务：

```text
dev   gooes-web-dev
prod  gooes-web
```

建议域名：

```text
dev   https://www-dev.goodcms.cn
prod  https://www.goodcms.cn
```

生产切换后，`admin.goodcms.cn/partners` 通过 301 跳转到
`www.goodcms.cn/partners`。官网域名不再代理 Admin 登录和后台路由。

## 6. CMS 内容模型

现有 `posts` 是组织岗位表，不能作为官网文章表。现有 `marketing_pages` 是租户营销
H5 页面，也不适合作为平台级官网 CMS。官网可复用现有 COS 和文件对象能力，但需要
独立内容模型。

### 6.1 内容条目

```text
site_content_entries
  id uuid primary key
  content_type article | case | city
  slug text
  status draft | published | archived
  published_version_id uuid null
  created_at timestamptz
  updated_at timestamptz
```

约束：

- `(content_type, slug)` 唯一。
- slug 只允许稳定、可读的 URL 安全字符。
- `published_version_id` 必须属于当前 entry。
- 公开查询只读取 `status=published` 且存在 published version 的条目。

### 6.2 内容版本

```text
site_content_versions
  id uuid primary key
  entry_id uuid
  version_no integer
  title text
  summary text null
  cover_file_id uuid null
  content_blocks jsonb
  seo_title text null
  seo_description text null
  canonical_url text null
  metadata jsonb
  created_by uuid
  created_at timestamptz
```

版本模型保证运营编辑新草稿时不改变线上内容。发布时通过数据库 RPC 原子切换
`published_version_id`；历史版本保留用于审计和回滚。

### 6.3 内容块

正文使用受控 JSON 内容块，不保存任意 HTML。第一期只支持必要块类型：

- paragraph
- heading
- image
- quote
- list
- callout
- metrics
- gallery

API 使用 Zod 判别联合校验每种块。Web 通过白名单组件渲染，禁止直接输出未清洗
HTML。需要新增块类型时必须同时增加 domain 类型、API 校验、Admin 编辑器和 Web
渲染器。

### 6.4 类型元数据

`metadata` 按 `content_type` 使用不同 Schema：

- `article`：分类、作者、展示发布时间。
- `case`：城市、面积、装修类型、案例指标。
- `city`：行政区编码、城市名称、本地服务介绍。

不得把核心查询和排序字段长期隐藏在 JSONB 中。新增高频过滤字段时应通过 migration
提升为显式字段并建立索引。

## 7. 权限和审计

新增平台权限：

```text
platform.site_content.read
platform.site_content.manage
platform.site_content.publish
```

- `read`：查看草稿和历史版本。
- `manage`：创建条目、编辑草稿、上传内容素材。
- `publish`：发布、回滚和归档。

发布、回滚和归档必须写平台审计日志，记录操作人、entry、前后版本和结果。

## 8. API 设计

### 8.1 公开接口

```http
GET /public/site/articles?page=1&pageSize=20
GET /public/site/articles/:slug
GET /public/site/cases?page=1&pageSize=20
GET /public/site/cases/:slug
GET /public/site/cities/:slug
```

所有列表必须分页，默认 `page=1&pageSize=20`，`pageSize` 最大 `100`。查询只选择
公开渲染所需字段，不返回内部版本、操作人或草稿信息。

### 8.2 Admin 管理接口

```http
GET  /platform/site-content?page=1&pageSize=20
POST /platform/site-content
GET  /platform/site-content/:id
PATCH /platform/site-content/:id
POST /platform/site-content/:id/versions
POST /platform/site-content/:id/publish
POST /platform/site-content/:id/rollback
POST /platform/site-content/:id/archive
```

发布和回滚必须通过 service 编排和 repository/RPC 落库，不能由 controller 组合多次
写入模拟事务。

### 8.3 城市合伙人申请

继续复用：

```http
POST /public/partner-applications/send-code
POST /public/partner-applications
```

`apps/web` 通过同源 Route Handler 代理，限制请求体大小，保留 UTM 和 source URL，
并透传稳定业务错误码。

## 9. 路由设计

```text
apps/web/app/
├── (marketing)/
│   ├── page.tsx
│   ├── products/
│   ├── solutions/
│   ├── partners/
│   └── about/
├── (content)/
│   ├── articles/
│   │   ├── page.tsx
│   │   └── [slug]/page.tsx
│   ├── cases/
│   │   ├── page.tsx
│   │   └── [slug]/page.tsx
│   └── cities/
│       └── [slug]/page.tsx
├── api/
│   ├── public/partner-applications/route.ts
│   ├── preview/route.ts
│   └── revalidate/route.ts
├── sitemap.ts
├── robots.ts
└── opengraph-image.tsx
```

一期不创建空的 `/portal` 页面。第二阶段再增加 `(portal)/portal/*`，并复用现有
`platform_partner` token 与看板接口。

## 10. 渲染与缓存

| 页面 | 策略 |
| --- | --- |
| 首页、产品、解决方案、关于我们 | 构建时静态生成 |
| 城市合伙人招募页 | 静态主体 + 客户端申请表单 |
| 文章、案例、城市列表 | ISR，5 分钟兜底更新 |
| 文章、案例、城市详情 | ISR + 内容标签按需失效 |
| Preview | 动态渲染、禁止缓存 |
| 申请代理 | 动态 Route Handler、禁止缓存 |
| 第二阶段 `/portal` | 动态渲染、私有或不缓存 |

发布缓存流程：

```text
Admin 发布
  -> API 发布事务成功
  -> API 调用 apps/web /api/revalidate
  -> apps/web 校验服务间签名
  -> revalidateTag(content:id)
  -> revalidatePath(公开路径)
```

Revalidate 使用独立服务间密钥。Preview 使用 API 签发的短期一次性令牌，不共享
Admin 跨域 Cookie。Preview 页面设置 `noindex, nofollow`。

初期部署单实例，可使用 Next.js 本地缓存。扩容到多个 Web 实例前，必须先设计共享
缓存和标签失效协调，不能直接复制容器后继续依赖实例本地缓存。

## 11. SEO 基线

- 每页生成唯一 title、description 和 canonical。
- 文章输出 `Article` JSON-LD。
- 案例输出合适的 `CreativeWork` 类结构化数据。
- 城市页输出 Breadcrumb 和本地服务信息。
- Sitemap 只包含已发布内容。
- Preview、搜索参数页和 `/portal` 禁止索引。
- 城市页必须有真实本地内容，禁止只替换城市名称批量生成低质量页面。
- 图片包含尺寸、响应式资源和可访问替代文本。
- 原 `/partners` 保持 canonical，Admin 旧地址做 301。

## 12. 错误处理和降级

- 公开详情不存在、未发布或已归档时返回标准 404。
- CMS/API 短暂异常时优先继续提供最近已发布缓存，不得回退到草稿。
- Preview 令牌无效或过期时返回 401/403，不返回公开版本冒充预览成功。
- 申请错误保持后端稳定错误码，不在 Web 端硬编码特殊成功结果。
- Web Route Handler 记录 requestId，但不记录验证码、令牌和完整手机号。
- API controller 的异常继续通过 `error-factory.ts` 包装。

## 13. 部署

- `apps/web` 使用 `output: "standalone"`。
- 新增独立 Dockerfile/镜像、Compose 服务和 GitHub Actions 构建目标。
- Nginx 处理 TLS、限流、请求体限制和静态资源长缓存。
- Nginx 不强行缓存动态 HTML；Next.js 决定页面缓存头。
- 使用带内容 hash 的静态资源并设置 immutable 缓存。
- dev 先部署 `www-dev.goodcms.cn`，通过验收后再切 `www.goodcms.cn`。

## 14. 分阶段迁移

### 阶段一：独立 App 与城市合伙人页面

- 创建 `apps/web`、构建脚本和独立镜像。
- 迁移 `/partners`、申请表单和素材。
- 增加基础 Layout、Metadata、Sitemap 和 Robots。
- 部署 dev 域名。
- 不改 CMS 数据库。

### 阶段二：CMS 后端与 Admin

- 通过 migration 新增内容表、索引、约束和发布 RPC。
- 实现公开读取与平台管理接口。
- Admin 实现草稿、版本、预览、发布、归档和回滚。
- 接入权限、审计、Preview 和缓存失效。

### 阶段三：完整官网与正式切流

- 上线产品、解决方案、案例、文章、城市页和关于我们。
- 配置生产域名和证书。
- Admin 旧 `/partners` 做 301。
- 验证搜索引擎、Canonical、Sitemap 和历史投放链接。

每个阶段独立验收和上线。第二阶段的合伙人 Web Portal 不属于本次三个阶段，应单独
编写设计和实施计划。

## 15. 测试与验收

### 15.1 静态检查

- `apps/web` typecheck、build、文件大小检查。
- `apps/api` typecheck、build 和相关单测。
- `apps/admin` typecheck、build 和组件测试。

### 15.2 API

- 公开列表分页和最大 pageSize。
- 草稿、已发布和归档可见性。
- 发布、回滚和幂等行为。
- 权限拒绝和平台审计。
- 内容块与 metadata 的类型校验。

### 15.3 Web E2E

- 核心导航和 404。
- 城市合伙人短信和申请闭环。
- Preview 鉴权与 noindex。
- 发布后页面和 Sitemap 更新。
- 旧 `/partners` 301。

### 15.4 SEO 和性能 smoke

- 首屏 HTML 包含标题、描述和主要正文。
- canonical、Open Graph、JSON-LD 可解析。
- Sitemap 不包含草稿、归档、Preview 和 Portal。
- 移动端首屏不依赖大体积客户端 JavaScript。
- 图片尺寸和响应式资源正确。

## 16. 回滚

- 域名切换前保留 Admin 旧 `/partners` 页面。
- Nginx 可将官网域名快速切回旧服务。
- CMS migration 第一阶段只新增结构，不删除现有数据。
- 新官网生产验证完成后才删除 Admin 公开页面实现。
- 任一阶段失败只回滚该阶段的服务或路由，不回滚已验证的 API 和数据结构。

## 17. 非目标

- 一期不实现城市合伙人 Web Portal。
- 不引入第三方 Headless CMS。
- 不构建自由拖拽页面编辑器。
- 不创建通用 `packages/ui`。
- 不重写 `apps/h5`。
- 不修改 orange 仓库。
- 不在本次迁移中升级 Next.js 主版本。

## 18. 参考

仓库文档：

- `docs/2026-07-05-partner-applications-mvp-handoff.md`
- `docs/2026-07-05-city-partner-mvp-acceptance-handoff.md`
- `docs/2026-07-05-miniprogram-partner-portal-handoff.md`

官方资料：

- [Next.js Self-Hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js Incremental Static Regeneration](https://nextjs.org/docs/app/guides/incremental-static-regeneration)
- [Next.js Sitemap](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
- [Next.js generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [Astro On-demand Rendering](https://docs.astro.build/en/guides/on-demand-rendering/)
- [Vite SSR](https://vite.dev/guide/ssr)
