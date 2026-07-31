# H5 开发环境独立路由设计

## 背景

Admin 开发环境会生成 `https://h5-dev.goodcms.cn/p/:slug`，但开发服务器
当前把 `h5-dev.goodcms.cn` 的页面请求转发到官网 Web 容器。公开活动接口
虽然由 Nginx 单独转发给 API，但页面入口和 `config.js` 会落到 Next.js
官网并返回 404。

微信小程序开发构建还会从 H5 域名请求活动列表。微信运行时未将该域名
识别为合法 request 域名时，请求失败；Orange 当前把失败降级为空数组，
因此 visitor 首页直接隐藏活动区。

## 环境边界

| 环境 | API | H5 |
| --- | --- | --- |
| development | `https://api-dev.goodcms.cn` | `https://h5-dev.goodcms.cn` |
| production | `https://api.goodcms.cn` | `https://h5.goodcms.cn` |

API 请求和 H5 页面地址不得跨环境回退。Admin 按构建环境生成对应 H5
地址。H5 页面内部可继续通过本域名的受控 Nginx 代理访问公开 API，
避免浏览器 CORS 依赖。

## 方案选择

采用独立 H5 开发容器：

1. 新增只包含 `apps/h5` 构建产物和 Bun 静态服务器的 H5 镜像。
2. 开发 compose 将 H5 暴露到 `127.0.0.1:13030`，不再占用官网 Web
   的 `13020`。
3. `h5-dev.goodcms.cn` 的页面和静态资源转发到 `13030`；活动公开接口
   和兼容用 `/wechat/h5-session` 继续转发到 API 的 `13000`。
4. H5 纳入开发环境构建计划、不可变镜像清单、自动部署和健康检查。
5. H5 部署在切换 Nginx 前先等待新容器健康；Nginx 配置先备份、
   `nginx -t`，再 reload，并在外部 smoke 失败时恢复备份。

不采用直接同步静态目录，因为它绕开当前不可变镜像证据链；不继续复用
Web 容器，因为两个站点的路由、构建和发布周期不同，这正是本次故障来源。

生产环境继续使用现有 H5 静态发布目录和 `h5.goodcms.cn`，本次不改变
生产部署拓扑。

## 服务契约

H5 服务必须：

- 对 `/p/:slug`、`/t/:tenant/p/:slug` 等前端路由返回 SPA
  `index.html`。
- 对真实静态文件返回对应文件。
- 所有响应包含 `X-Gooes-Service: h5`。
- 构建镜像响应包含当前 commit 对应的 `X-Gooes-Revision`。
- `/config.js` 可作为容器和外部部署健康检查。

开发 Nginx 必须：

- `h5-dev.goodcms.cn/public/marketing-pages` 和子路径转发到 API。
- `h5-dev.goodcms.cn/public/tenants/` 转发到 API。
- `h5-dev.goodcms.cn/wechat/h5-session` 转发到 API，兼容既有小程序构建。
- 其余路径转发到独立 H5 容器。

## 小程序边界

Orange 仓库保持只读。小程序团队后续应把活动列表和 session 请求统一改为
对应环境的 API 域名，只把活动页面 URL 保留在对应 H5 域名：

- dev 请求 `api-dev.goodcms.cn`，页面 `h5-dev.goodcms.cn`；
- prod 请求 `api.goodcms.cn`，页面 `h5.goodcms.cn`。

微信公众平台还需将 API 域名配置为 request 合法域名，将 H5 域名配置为
业务域名。仓库内修复不替代微信公众平台的外部配置。

## 验收

1. H5 服务深链接 smoke 返回 200、SPA HTML 和正确服务/版本响应头。
2. 开发构建计划识别 `apps/h5/**` 与开发 H5 Nginx 配置变更。
3. H5 镜像生成独立不可变 manifest，开发部署按 digest 拉取。
4. `https://h5-dev.goodcms.cn/config.js` 返回 200 且服务头为 `h5`。
5. `https://h5-dev.goodcms.cn/p/h5-20260730-2awdt0` 返回 H5 SPA，
   不再返回 Web 404。
6. `https://h5-dev.goodcms.cn/public/marketing-pages?scene=home`
   继续返回活动列表。

