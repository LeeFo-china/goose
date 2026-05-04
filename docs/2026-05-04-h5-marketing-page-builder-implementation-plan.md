# H5 营销页可视化搭建器落地执行方案

日期：2026-05-04

## 当前执行状态

截至 2026-05-04，以下阶段已开始落地：

1. 已新增 H5 营销页数据表 migration
2. 已新增 `@gooes/domain` 营销页状态、版本状态、模块类型、埋点事件值域
3. 已新增营销页、营销线索、营销埋点权限码
4. 已将新增权限默认授权给 `system_admin`
5. 已新增 API 管理端接口：页面列表、详情、创建、更新、删除、草稿保存、发布、下线、复制
6. 已新增公开 API：读取已发布页面、提交线索、记录埋点
7. 已将公开 H5 接口加入 API 鉴权白名单
8. 已新增 `apps/h5` 静态 H5 渲染站点，支持 `/p/:slug` 读取公开 API 并渲染 MVP 模块
9. H5 站点已支持线索表单提交、页面访问埋点、按钮点击埋点、电话点击埋点
10. 已在 admin 营销页加入 H5 活动页列表，支持创建、复制、发布、下线、复制链接和预览
11. 已新增 admin H5 活动页编辑器，支持模块添加、原生拖拽排序、模块复制删除、属性编辑、保存草稿、发布和预览

下一步从 `阶段 7：小程序入口接入` 开始执行。

## 背景

当前已经新增 `https://h5.goodcms.cn` H5 站点，并且已经在微信小程序后台配置了 `web-view` 业务域名。

后续目标是在 admin 后台提供一个可视化搭建能力，让运营或管理员可以通过拖拽模块配置 H5 营销活动页。发布后，小程序端通过 `web-view` 直接加载已发布页面。

核心业务价值：

1. 后台可快速搭建营销活动页
2. 小程序不需要为每个活动重新发版
3. 活动页可以收集预约、报名、咨询线索
4. 页面访问、按钮点击、表单提交可以形成营销效果数据

当前项目架构适合采用：

- admin 后台负责页面管理和可视化编辑
- API 负责页面配置、发布版本、线索、埋点
- Supabase 负责结构化存储
- `h5.goodcms.cn` 负责公开页面渲染
- 小程序只负责通过 `web-view` 打开 H5 地址

---

## 一、核心结论

## 1. MVP 不做自由画布，先做模块化积木搭建器

第一版不建议做类似设计软件的绝对定位自由画布。

推荐做“模块化积木式 H5 搭建器”：

- 左侧选择模块
- 中间手机尺寸预览
- 右侧编辑模块属性
- 模块可拖拽排序
- 发布后 H5 按配置 JSON 渲染

原因：

1. 营销页更需要稳定交付，不需要复杂排版自由度
2. 移动端 H5 以纵向信息流为主，模块排序已经覆盖大部分活动页场景
3. 自由画布会带来响应式、遮挡、适配、编辑器复杂度等问题
4. 模块化更容易做权限、安全、数据采集和后续模板复用

## 2. 线上页面必须读取发布快照，不直接读取草稿

页面需要同时存在：

- 草稿配置：后台编辑中使用
- 发布配置：H5 线上访问使用

发布动作要生成一份不可被编辑过程影响的快照。

这样可以避免运营编辑一半时影响线上活动页。

## 3. H5 页面不依赖 admin 登录态

`h5.goodcms.cn` 是公开页面，不能依赖 admin 的 cookie 或后台登录态。

如果页面需要识别小程序用户，应该由小程序登录后向 API 换取短期 token，再拼接到 H5 URL。

不要在 URL 中直接暴露手机号、客户 ID、openid。

---

## 二、MVP 范围

## 1. 第一版必须支持

页面管理：

- 页面列表
- 新建页面
- 编辑页面
- 复制页面
- 删除草稿 / 下线页面
- 发布页面
- 预览页面

编辑器：

- 模块添加
- 模块拖拽排序
- 模块删除
- 模块复制
- 模块属性编辑
- 手机尺寸实时预览
- 保存草稿
- 发布

H5 渲染：

- 根据 `slug` 加载已发布页面
- 渲染基础模块
- 表单提交
- 按钮点击埋点
- 页面访问埋点
- 404 / 未发布状态处理

小程序：

- 增加统一 web-view 页面
- 支持传入 H5 URL
- 支持从活动入口跳转到指定 H5 页面

## 2. 第一版模块清单

建议 MVP 只做这些模块：

1. `hero`：首屏 Banner
2. `image`：单图
3. `text`：标题 / 正文
4. `button`：按钮
5. `image_text`：图文卡片
6. `case_list`：装修案例 / 项目展示
7. `countdown`：倒计时
8. `lead_form`：预约表单
9. `phone_cta`：拨打电话
10. `footer`：底部信息

## 3. 第一版暂不做

暂不支持：

- 任意绝对定位
- 自定义 JS
- 自定义 CSS
- 多层嵌套容器
- 复杂动画时间轴
- 多人协同编辑
- A/B 测试
- 支付
- 复杂会员权益
- 页面级权限访问控制

这些能力可以后续按业务效果逐步加入。

---

## 三、数据模型设计

## 1. 页面主表 `marketing_pages`

建议新增：

```sql
CREATE TABLE IF NOT EXISTS public.marketing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  description text,
  cover_image text,
  published_version_id uuid,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  published_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

状态建议：

```text
draft
published
offline
archived
```

说明：

- `slug` 用于公开访问路径，例如 `/p/spring-sale`
- `published_version_id` 指向当前线上版本
- `status = published` 时才允许公开访问

## 2. 页面版本表 `marketing_page_versions`

建议新增：

```sql
CREATE TABLE IF NOT EXISTS public.marketing_page_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.marketing_pages(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  schema_version integer NOT NULL DEFAULT 1,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE(page_id, version_no)
);
```

版本状态建议：

```text
draft
published
archived
```

说明：

- 后台保存草稿时更新当前草稿版本
- 点击发布时生成新的 `published` 版本
- H5 只读取 `marketing_pages.published_version_id` 对应配置

## 3. 素材表 `marketing_assets`

建议新增：

```sql
CREATE TABLE IF NOT EXISTS public.marketing_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url text NOT NULL,
  file_name text,
  mime_type text,
  file_size integer,
  width integer,
  height integer,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

说明：

- 第一版可以先复用现有上传能力
- 素材表用于后续复用、压缩、清理和审计

## 4. 线索表 `marketing_leads`

建议新增：

```sql
CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid REFERENCES public.marketing_pages(id) ON DELETE SET NULL,
  page_version_id uuid REFERENCES public.marketing_page_versions(id) ON DELETE SET NULL,
  name text,
  phone text,
  community text,
  city text,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'h5',
  wx_openid text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  request_ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

说明：

- `form_data` 存动态表单字段
- 常用字段 `name / phone / community` 单独落列，方便列表和查询
- 如果 H5 token 能识别客户，再写入 `customer_id`

## 5. 埋点表 `marketing_events`

建议新增：

```sql
CREATE TABLE IF NOT EXISTS public.marketing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid REFERENCES public.marketing_pages(id) ON DELETE SET NULL,
  page_version_id uuid REFERENCES public.marketing_page_versions(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  block_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  wx_openid text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  request_ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

事件建议：

```text
page_view
button_click
phone_click
form_submit
```

---

## 四、页面配置 JSON 规范

页面配置建议使用白名单结构：

```json
{
  "schemaVersion": 1,
  "title": "春季装修活动",
  "theme": {
    "primaryColor": "#1677ff",
    "backgroundColor": "#ffffff",
    "textColor": "#111827"
  },
  "blocks": [
    {
      "id": "hero_001",
      "type": "hero",
      "props": {
        "title": "春季装修活动",
        "subtitle": "预约量房享专属优惠",
        "imageUrl": "https://h5.goodcms.cn/assets/banner.jpg",
        "buttonText": "立即预约",
        "buttonAction": {
          "type": "scroll_to_form"
        }
      }
    },
    {
      "id": "form_001",
      "type": "lead_form",
      "props": {
        "title": "预约免费量房",
        "fields": ["name", "phone", "community"],
        "submitText": "提交预约"
      }
    }
  ]
}
```

约束：

1. `blocks[].type` 必须来自固定白名单
2. `props` 必须按模块类型做 Zod 校验
3. 不允许保存任意 HTML、JS、内联事件
4. 图片 URL 只允许来自可信域名
5. 发布前必须校验完整配置

---

## 五、API 设计

建议新增 API 资源路径：

```text
GET    /marketing-pages
POST   /marketing-pages
GET    /marketing-pages/:id
PATCH  /marketing-pages/:id
DELETE /marketing-pages/:id

GET    /marketing-pages/:id/draft
PUT    /marketing-pages/:id/draft
POST   /marketing-pages/:id/publish
POST   /marketing-pages/:id/offline
POST   /marketing-pages/:id/duplicate

GET    /public/marketing-pages
GET    /public/marketing-pages/:slug
POST   /public/marketing-pages/:slug/leads
POST   /public/marketing-pages/:slug/events
```

分层建议：

- controller：只处理 HTTP、参数校验、调用 service、包装返回
- service：处理草稿保存、发布快照、下线、复制、公开读取、线索提交
- repository：访问 Supabase 表

注意：

- 管理接口需要员工登录和权限
- 公开接口不依赖 admin 登录
- 公开接口要限制只返回 `published` 页面
- 公开表单提交要做频率限制和字段校验
- 错误必须经过 `error-factory.ts` 包装

---

## 六、admin 后台设计

## 1. 菜单

建议新增一级或二级入口：

```text
营销中心 / H5 活动页
```

页面列表字段：

- 页面标题
- slug
- 状态
- 访问地址
- 发布时间
- 创建人
- 更新时间
- 操作

操作：

- 编辑
- 预览
- 发布
- 下线
- 复制
- 删除

## 2. 编辑器布局

建议采用三栏布局：

```text
左侧：模块库
中间：手机预览
右侧：属性面板
```

模块库：

- Banner
- 图片
- 文本
- 按钮
- 图文卡片
- 案例列表
- 倒计时
- 预约表单
- 电话按钮
- 底部信息

顶部工具栏：

- 返回
- 保存草稿
- 预览
- 发布

## 3. 拖拽实现

建议使用 `dnd-kit`：

- MVP 只需要纵向排序
- 不做自由拖放坐标
- 添加模块时追加到当前选中模块后方
- 拖拽结束后更新 `blocks` 顺序

## 4. 属性面板

不同模块使用不同配置表单。

建议：

- `hero`：标题、副标题、图片、按钮文案、按钮行为
- `image`：图片、跳转行为
- `text`：标题、正文、对齐
- `button`：文案、按钮行为、样式
- `lead_form`：表单标题、字段选择、提交按钮文案
- `phone_cta`：电话、按钮文案

所有配置表单使用 Zod schema 校验。

---

## 七、H5 渲染站点设计

## 1. 路由

建议 H5 支持：

```text
/p/:slug
```

示例：

```text
https://h5.goodcms.cn/p/spring-sale
```

## 2. 渲染流程

1. 根据 `slug` 调用公开 API
2. API 返回已发布页面配置
3. H5 按 `blocks` 顺序渲染模块
4. 页面加载后上报 `page_view`
5. 用户点击按钮时上报点击事件
6. 用户提交表单时写入 `marketing_leads`

## 3. 部署方式

MVP 推荐：

- 使用独立 Vite React H5 应用
- 构建产物部署到 `/var/www/h5.goodcms.cn`
- nginx 使用 `try_files $uri $uri/ /index.html`

如果后续需要服务端渲染或动态 SEO，再考虑 Next.js。

## 4. 性能要求

第一版需要做到：

- 首屏图片压缩
- 图片使用 `loading="lazy"`
- 页面配置接口可缓存短时间
- JS 包体保持轻量
- H5 不引入后台编辑器依赖

---

## 八、小程序接入设计

## 1. 通用 web-view 页面

小程序新增通用页面：

```text
/pages/webview/index
```

传参示例：

```text
/pages/webview/index?url=https%3A%2F%2Fh5.goodcms.cn%2Fp%2Fspring-sale
```

页面内：

```xml
<web-view src="{{url}}" />
```

## 2. 用户身份传递

如果活动页需要识别客户身份：

1. 小程序先完成登录
2. 小程序调用 API 申请短期 H5 token
3. 跳转 URL 携带 token

示例：

```text
https://h5.goodcms.cn/p/spring-sale?t=short_lived_token
```

要求：

- token 短期有效
- token 不直接暴露手机号、openid、customer_id
- H5 提交线索时由后端解析 token 并绑定客户

## 3. web-view 约束

注意事项：

- H5 域名必须是已配置的业务域名
- 域名必须 HTTPS
- 域名校验文件必须保留在站点根目录
- web-view 会自动铺满小程序页面
- H5 到小程序的复杂通信需要单独设计，不作为 MVP 核心

---

## 九、安全与风控

必须限制：

1. 不允许后台输入任意 JS
2. 不允许后台输入任意 HTML
3. 不允许图片使用不可信域名
4. 表单提交必须校验手机号
5. 表单提交需要防重复提交
6. 公开 API 需要基础频率限制
7. 发布配置必须通过 schema 校验
8. 下线页面必须立即不再公开访问

建议：

- 管理接口接入权限码：`marketing_page.read/create/update/publish/delete`
- 线索列表接入权限码：`marketing_lead.read`
- 埋点写入接口只接受白名单事件名

---

## 十、执行步骤

## 阶段 1：数据结构与 domain 值域

目标：先把稳定数据结构落下来。

执行：

1. 新增 Supabase migration
2. 创建 `marketing_pages`
3. 创建 `marketing_page_versions`
4. 创建 `marketing_assets`
5. 创建 `marketing_leads`
6. 创建 `marketing_events`
7. 在 `@gooes/domain` 中增加页面状态、版本状态、模块类型、事件名常量

验收：

- migration 可执行
- domain 包可被 API 和 admin 引用
- 页面状态和值域不散落在业务代码里

## 阶段 2：API 管理端接口

目标：完成后台页面管理闭环。

执行：

1. 新增 marketing page schema
2. 新增 repository
3. 新增 service
4. 新增 controller
5. 注册 routes
6. 实现页面列表、详情、创建、更新、删除
7. 实现保存草稿
8. 实现发布
9. 实现下线
10. 实现复制页面

验收：

- admin 可以通过 API 完成页面 CRUD
- 发布后会生成独立版本快照
- 下线后公开接口不可访问

## 阶段 3：公开 API

目标：让 H5 可以读取发布页并提交业务数据。

执行：

1. 实现 `GET /public/marketing-pages/:slug`
2. 实现 `POST /public/marketing-pages/:slug/leads`
3. 实现 `POST /public/marketing-pages/:slug/events`
4. 加入公开接口字段校验
5. 加入基础防刷策略

验收：

- 未发布页面返回不可访问
- 已发布页面返回发布版本配置
- 表单提交能写入 `marketing_leads`
- 访问和点击能写入 `marketing_events`

## 阶段 4：H5 渲染站点

目标：`h5.goodcms.cn` 可以真实渲染已发布页面。

执行：

1. 新增 H5 React 应用
2. 实现 `/p/:slug` 路由
3. 实现页面配置加载
4. 实现模块渲染器
5. 实现 MVP 模块组件
6. 实现线索表单提交
7. 实现埋点上报
8. 构建并部署到 `/var/www/h5.goodcms.cn`

验收：

- `https://h5.goodcms.cn/p/:slug` 可访问
- 微信 web-view 可加载
- H5 页面在手机宽度下无明显错位
- 表单提交成功
- 页面访问和按钮点击有埋点

## 阶段 5：admin 页面列表

目标：后台能管理活动页。

执行：

1. 新增营销页列表页面
2. 新增新建页面入口
3. 新增状态展示
4. 新增访问地址复制
5. 新增预览、编辑、发布、下线、复制操作

验收：

- 管理员能看到所有页面
- 页面状态清晰
- 可复制 H5 访问地址
- 可进入编辑器

## 阶段 6：admin 可视化编辑器

目标：后台能拖拽配置活动页。

执行：

1. 搭建三栏编辑器布局
2. 实现模块库
3. 实现手机预览
4. 实现属性面板
5. 接入 `dnd-kit` 排序
6. 实现模块添加、删除、复制
7. 实现保存草稿
8. 实现发布前校验
9. 实现发布

验收：

- 能新建一个活动页
- 能添加多个模块
- 能拖拽排序
- 能编辑模块内容
- 能保存草稿
- 能发布
- 发布后 H5 端展示一致

## 阶段 7：小程序入口接入

目标：小程序可以打开配置好的 H5 页面。

执行：

1. 新增通用 web-view 页面
2. 支持 URL 参数解析
3. 活动入口跳转 web-view
4. 验证体验版二维码链路
5. 验证真机调试链路

验收：

- 体验版扫码进入正确页面
- 真机调试进入正确页面
- web-view 能正常加载 H5
- H5 表单提交正常

## 阶段 8：数据查看与运营闭环

目标：后台可以看到营销效果。

执行：

1. 新增线索列表
2. 新增页面访问统计
3. 新增按钮点击统计
4. 新增表单转化率
5. 支持按页面筛选线索

验收：

- 能看到每个活动页的线索
- 能看到访问、点击、提交
- 能判断活动页效果

---

## 十一、推荐实施顺序

建议按下面顺序实际编码：

1. `阶段 1`：数据表和 domain
2. `阶段 2`：API 管理端接口
3. `阶段 3`：公开 API
4. `阶段 4`：H5 渲染站点
5. `阶段 5`：admin 页面列表
6. `阶段 6`：admin 编辑器
7. `阶段 7`：小程序 web-view 接入
8. `阶段 8`：数据看板

不要先做复杂编辑器。

原因：

- 先完成 API 和 H5 渲染，可以尽快跑通发布链路
- 编辑器即使第一版简陋，也能通过 JSON 配置验证业务闭环
- 数据和发布模型稳定后，拖拽编辑器可以逐步增强

---

## 十二、MVP 验收标准

MVP 完成时必须满足：

1. admin 后台可以创建 H5 营销页
2. admin 后台可以添加模块并拖拽排序
3. admin 后台可以保存草稿
4. admin 后台可以发布页面
5. H5 站点可以通过 `slug` 打开已发布页面
6. 小程序 web-view 可以加载该 H5 页面
7. 用户可以在 H5 页面提交预约线索
8. 后台可以看到线索
9. 页面访问和按钮点击有基础埋点
10. 下线后 H5 页面不可继续访问

---

## 十三、后续增强方向

MVP 稳定后再考虑：

1. 页面模板库
2. 一键复制历史活动
3. 素材库分类
4. 表单字段自定义
5. 活动二维码生成
6. 客户身份识别和自动归属
7. 页面分享配置
8. 优惠券 / 权益组件
9. A/B 测试
10. 访问来源分析

---

## 十四、参考约束

微信小程序 `web-view` 会承载网页，且普通网页需要在小程序后台配置业务域名后才能打开。业务域名通常需要在站点根目录放置校验文件完成验证。

参考：

- Taro WebView 组件说明：https://nervjs.github.io/taro/docs/components/open/web-view/
- 腾讯云关于微信小程序 web-view 业务域名配置说明：https://cloud.tencent.cn/developer/article/1456357
