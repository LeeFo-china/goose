# 客户装修效果素材目录：微信 / 抖音小程序接口交接

日期：2026-09-13。范围：gooes 后端已实现的**已发布素材浏览合同**；开发环境
migration、COS 原站与 API/Admin 已有[发布证据](evidence/2026-09-13-rendering-library-self-publish-dev-release.md)。
同租户微信/抖音已认证会话、最终 CDN 与两端小程序接入仍待验收。`orange` 仓库只读参考，本交接没有修改它。

## 接口与身份

| 渠道 | 列表 | 详情 | 可信身份 |
| --- | --- | --- | --- |
| 微信 visitor | `GET /visitor/renderings/styles` | `GET /visitor/renderings/styles/:id` | 有效微信 `visitor_session`，或绑定租户的微信客户 `auth` 会话 |
| 抖音小程序 | `GET /douyin-mini/renderings/styles` | `GET /douyin-mini/renderings/styles/:id` | 有效 `douyin_miniapp`，或匹配安装实例的抖音客户 `auth` 会话 |

四个路由均标记 `tenantServiceAccess=session`。请求带
`Authorization: Bearer <SESSION_TOKEN>`；不要用管理后台 token、匿名请求、客户端
传入的 `tenant_id` 或旧图库的 `skipAuth` 回退。微信从会话及当前已选装修公司得到
租户；抖音从会话中的租户、应用及安装实例得到租户，并校验安装仍有效。列表与
详情均不接受 request body。详情 `id` 必须是 UUID，不接受额外 query。

列表 query 仅允许 `page`、`pageSize`、`space`、`style`：

| 参数 | 规则 |
| --- | --- |
| `page` | 正整数，默认 `1`，最大 `100000` |
| `pageSize` | 正整数，默认 `20`，最大 `100` |
| `space` | 可选：`living_room` / `bedroom` |
| `style` | 可选：`modern_simple`、`cream`、`new_chinese`、`nordic`、`light_luxury`、`natural_wood`、`american`、`french`、`wabi_sabi` |

多余或非法参数（含 `tenant_id`、`pageSize=101`）返回 400
`VALIDATION_ERROR`。过滤针对**已发布快照**，排序为素材 `sort_order`、`id`
升序；翻页时同一过滤组合不得混用旧页结果。目录只含当前租户、未删除、
`status=published` 且公开快照/图片完整的记录。列表是数据库分页，不是全量数组。

## 响应合同

成功外层为 `{ "data": ..., "message": "success" }`。列表 `data`：

```json
{
  "list": [
    {
      "id": "<STYLE_UUID>",
      "title": "暖色客厅",
      "space": "living_room",
      "style": "modern_simple",
      "color_notes": "暖白墙面与浅木色",
      "material_notes": "木饰面搭配亚麻软装",
      "source_type": "design",
      "image_url": "<SERVER_PUBLIC_HTTPS_URL>",
      "published_at": "2026-09-13T00:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

详情 `data` 是上面单个素材对象，不包 `list`。`source_type` 取值
`real_case`（实景）、`design`（设计图）、`ai_concept`（AI 概念图）；
`ai_concept` 必须在 UI 标示，不得称为已落地实景。`color_notes` 和
`material_notes` 可为空字符串。`image_url` 是服务端产生的 HTTPS 公开展示副本，
不是私有源图的签名地址。公开 DTO **不含**租户 ID、文件 ID、对象路径、员工、
当前草稿、版本、客户上传信息或生成建议。

错误外层为 `{ "success": false, "message": "...", "code": "...",
"requestId": "..." }`，可能带 `details`。客户端按 HTTP 状态和稳定 `code`
分支，不解析中文 message：

| 状态 / code | 页面动作 |
| --- | --- |
| 401（会话缺失、失效或渠道不符） | 走对应渠道的会话恢复；不要退化为匿名目录请求 |
| 409 `RENDERING_TENANT_CONTEXT_REQUIRED`（微信未选择装修公司） | 引导先选公司，再重置列表请求 |
| 403 `TENANT_NOT_AVAILABLE`（装修公司暂停） | 显示服务暂停，停止自动重试；抖音安装停用还可能为 409 `DOUYIN_INSTALLATION_DISABLED` |
| 404 `RENDERING_STYLE_NOT_FOUND` | 详情展示已下架/不存在，返回列表并刷新第一页；跨租户 ID 也按不可见处理 |
| 400 `VALIDATION_ERROR` | 修正本地参数，不对原参数无限重试 |
| 5xx / 网络失败 | 保留当前筛选与已加载数据，给用户手动重试，不推断素材已消失 |

已发布图片允许客户端/CDN 缓存。隐藏或软删除后 API 不再返回素材，但**不能保证**
立即撤回客户端已保存图片或 CDN 缓存 URL。列表重进、下拉刷新以及详情 404 后要
重新请求；不能凭旧图片缓存继续声称素材在线。新发布版本使用新的公开对象，旧
缓存不得当作当前元数据。

## 双端调用与页面状态

1. 渠道登录/恢复会话；微信还需有当前装修公司，抖音需有效安装实例。
2. 打开页面：请求 `page=1&pageSize=20`，可带当前 `space/style`；响应空列表时
   显示“暂无已发布效果图”，不要用旧图库或假数据填充。
3. 列表卡片显示 `image_url/title/space/style/source_type`，点开时以 `id`
   调详情。详情显示 `color_notes/material_notes/published_at`，再决定是否展示
   后续功能入口；**本阶段没有上传/生图按钮的可用后端链路**。
4. 触底仅当 `page < totalPages` 且当前组合无在途请求时请求下一页；同一
   `page+pageSize+space+style+tenant/context` 设单飞锁，双击/双触底不并发追加。
   合并时按 `id` 去重，并用请求序号丢弃切换筛选或公司之前的迟到响应。
5. 筛选、公司或登录上下文变化：清空旧列表、页码与错误，重新请求第一页。
   下一页失败保留已有卡片，仅重试失败页；401/403/409/404 按上表处理。

这些 GET 没有写操作或幂等键；双击防护是避免重复分页、乱序和重复卡片，不是
服务端扣次逻辑。不能把已发布素材 `id` 当成已可创建生成任务的证明。

### 只读检查得到的 orange 接入位置

- 微信公共 API 封装：`src/utils/api.ts`、`src/utils/https.ts`；新增**独立**目录
  service，并由小程序团队决定是否经 `src/services/index.ts` 导出。
- 现有图库 service：`src/services/picture_library.ts`；它请求
  `/visitor/picture-library/*`，`getAllAssetsWithOptionalVisitorAuth` 在 401
  时退为匿名请求。新目录强制会话，**不能复用这一回退**。
- 现有 visitor 图库页：`src/packageVisitor/pages/picture-library/index.tsx`、
  `src/packageVisitor/pages/picture-library-detail/index.tsx`、
  `src/packageVisitor/pages/visitor-home/components/VisitorPictureLibraryPreview.tsx`；
  可参考分页、空态、图片预览和导航，但新目录应有独立状态与类型。
- 新页面/入口需要小程序团队维护 `src/app.config.ts` 的 `packageVisitor` 页面注册
  和相应首页入口。现有目录未发现 `/renderings/styles` 调用或客户效果库页面。
  `orange` 是以微信 Taro 为主的仓库；抖音客户端如不在该仓库，应由其所属团队在
  对应 service、页面和路由配置实现同一合同，不假定 orange 可直接构建抖音包。

旧“装修灵感图库”使用 `/visitor/picture-library/categories` 与
`/visitor/picture-library/assets`，DTO 有 `image/images/categories`、点赞收藏等；
新目录使用 `image_url`、枚举 `space/style` 和发布快照，不提供分类、收藏、点赞、
滑动导航或匿名浏览。不能将两者响应直接互换，也不要将旧图库图片自动视为租户
已发布素材。旧图库的本地缓存键与新目录必须分开。

## 占位 curl smoke（两端团队持有效开发会话执行）

```sh
API_BASE="https://<DEV_API_HOST>"
SESSION_TOKEN="<WECHAT_VISITOR_SESSION>"
STYLE_ID="<PUBLISHED_STYLE_UUID>"
curl -i -H "Authorization: Bearer ${SESSION_TOKEN}" \
  "${API_BASE}/visitor/renderings/styles?page=1&pageSize=20&space=living_room"
curl -i -H "Authorization: Bearer ${SESSION_TOKEN}" \
  "${API_BASE}/visitor/renderings/styles/${STYLE_ID}"
SESSION_TOKEN="<DOUYIN_MINIAPP_SESSION>"
curl -i -H "Authorization: Bearer ${SESSION_TOKEN}" \
  "${API_BASE}/douyin-mini/renderings/styles?page=1&pageSize=20"
curl -i -H "Authorization: Bearer ${SESSION_TOKEN}" \
  "${API_BASE}/douyin-mini/renderings/styles/${STYLE_ID}"
```

占位值不能直接调用真实服务；请用授权的开发账号与非客户测试图替换，**不要**把
token、真实租户 ID、私有路径或真实 COS URL 写回文档/工单。验收前先完成
migration、公开 COS 策略与 API 发布已完成开发验收；仍需测同租户列表/详情、跨租户不可见、隐藏后
404、暂停租户、抖音安装停用、非法分页、无 token、分页乱序和窄屏图片加载。

责任边界：gooes 提供合同、后端/Admin 代码及部署检查；微信/抖音小程序团队
分别实现会话接入、页面/路由、空态/失败态/分页防重和真机验收。`orange` 保持
原状；本阶段不含客户房型/房间照片上传、AI 生图任务、Worker、Ark 调用、生成
装修建议或小程序生成 UI。
