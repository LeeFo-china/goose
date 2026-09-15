# 抖音小程序租户流量来源看板生产发布证据

日期：2026-09-15。范围：租户 Admin 站内入口、浏览、免费量房预约来源看板；异步来源捕获修正；生产 API/Admin。抖音平台曝光、播放与站外点击数据不在本轮范围。

## 固定候选与验证

- main 提交 `2be744ca2fcb5a0be96a3893b57a8ad539ec5c3e`；生产 Tag `v2026.09.15.10`。
- 本地抖音小程序 417 个测试和类型检查通过；API 类型检查、构建、文件大小检查通过；Admin 相关 39 个测试、类型检查、生产构建与文件大小检查通过。Admin 构建产物包含动态路由 `/douyin-miniapp/traffic`。
- 本地 PostgreSQL 事务内的合成事件 smoke：旧入口排除、重复预约去重、不匹配的提交排除；按内容 3 个来源、按账号 1 个来源，整体入口 3、预约 1 保持一致；无真实数据库变更。

## 生产数据库

- [只读 plan](https://github.com/LeeFo-china/goose/actions/runs/34953809312)：候选 629 条、生产 628 条，只待 `20260915092804`，无生产独有版本。
- [apply](https://github.com/LeeFo-china/goose/actions/runs/34954041605)：固定同一提交，只应用 `20260915092804_douyin_source_dashboard_stats.sql`，工作流回执为 628→629；工作流备份和文件守卫成功。备份路径为 `/opt/supabase/docker/backups/prod-migrate-34954041605-20260915174428.sql`，范围仅 `public` 与 `supabase_migrations`。
- 应用后独立运行 Supabase CLI `migration list --db-url`：629 行 Local/Remote 完全对齐、差异 0。只读 RPC smoke：`authenticated` 无 EXECUTE，`service_role` 有 EXECUTE；河南晴天近 7 天新版入口 0、自然日期 7、分页大小 20。小程序新版代码尚未上传，因此 0 是预期观测，不代表真实流量为 0。
- 回滚按前向 migration 撤销 RPC grant 并删除本轮三个函数；本轮不变更既有表数据。

## API/Admin 生产发布

- [候选构建与镜像核验](https://github.com/LeeFo-china/goose/actions/runs/34953974382)：成功；候选服务仅 `api,admin`，Tag 和完整 SHA 与本页一致。
- [部署](https://github.com/LeeFo-china/goose/actions/runs/34954876866)：成功；回执 build run `34953974382`、deploy run `34954876866`、服务 `api,admin`，完成于 `2026-09-15T09:55:16Z`。
- 独立 SSH 检查实际两个容器均 `running/healthy`，revision 均为 `2be744ca2fcb5a0be96a3893b57a8ad539ec5c3e`。公网 API 首页和 Admin 登录页 200；新接口未登录 401/TOKEN_MISSING；Admin 看板未登录 307 至登录页。

## 客户端交付与验收边界

- main 小程序代码已加入 `capture_version=2`。用户此前报告体验版为 `0.1.36`；本轮没有上传新模板或替换体验版。当前看板不应按真实来源统计解读。
- 本机抖音开发者工具无可操作窗口；官方 `tt-ide-cli` 无登录 Cookie，上传需要开发者工具登录态或为模板 AppID 配置 CLI token。不得在聊天传 token。下一版上传、确认最新模板、生成商户体验版及真机来源验收仍待完成。
- 未使用租户员工会话做登录后页面 smoke，也未制造生产测试预约。上线后应从抖音官方视频/账号/直播入口和手工标记入口分别真机进入，核对看板来源依据、事件趋势与预约详情创建时间。

## Admin 图表修正

- 发布后检查发现趋势图直接使用 `var(--primary)` / `var(--success)` 作为 SVG stroke；本项目令牌存的是 HSL 通道值，浏览器可能无法绘制线条。修正为仓库其他图表使用的 `hsl(var(--...))`。相关页面测试、Admin 类型检查与生产构建通过。
- 修正 main 提交 `fd8811c0a48b99656bb8609e283bfb0bd29f1d9e`，Tag `v2026.09.15.11`。[Admin 单服务候选](https://github.com/LeeFo-china/goose/actions/runs/34955691017) 和[部署](https://github.com/LeeFo-china/goose/actions/runs/34957119624)均成功；回执服务只有 `admin`，完成于 `2026-09-15T10:21:12Z`。
- 最终 SSH 实际容器：API `2be744ca2fcb5a0be96a3893b57a8ad539ec5c3e`、Admin `fd8811c0a48b99656bb8609e283bfb0bd29f1d9e`，都为 `running/healthy`。公网 Admin 看板未登录仍 307 至登录页，API 首页及 Admin 登录页 200。
