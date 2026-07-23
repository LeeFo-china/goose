# 抖音装修小程序四页 UI 复审

日期：2026-07-23

复审范围：

- 首页 `pages/home/index`
- 案例 `pages/cases/index`
- 工地 `pages/sites/index`
- 免费咨询 `pages/lead/index`
- 四页直接依赖的原生组件、共享状态与 Tab 资源

本次复审沿用原审计的五维模型，并逐条回查原 5 个 P1、7 个 P2、2 个
P3。实现仍为抖音原生 TTML、TTSS 与 TypeScript，没有改动 API、数据库、
分页、租户隔离、埋点、短信、隐私或幂等请求契约。

## 复审健康分

| # | 维度 | 原分数 | 复审分数 | 复审结论 |
|---|---|---:|---:|---|
| 1 | Accessibility | 2/4 | 4/4 | 输入名称、字段错误、首错聚焦和 88rpx 隐私同意触达区已落地 |
| 2 | Performance | 3/4 | 4/4 | 案例与工地列表图片已启用原生 `lazy-load`，骨架降级保留 |
| 3 | Responsive Design | 3/4 | 4/4 | 393px 模拟器及手机预览均通过，滚动、图片、键盘与折叠交互正常 |
| 4 | Theming | 1/4 | 4/4 | 租户主色经统一解析后覆盖主动作、链接、筛选、卡片状态和品牌占位 |
| 5 | Anti-Patterns | 1/4 | 4/4 | kicker、侧色条、重复 CTA、双卡片语言和固定陶土品牌色已移除 |
| **总分** |  | **10/20** | **20/20** | **P1 清零，模拟器与手机预览验收完成** |

严重度复审：

- P0：0
- P1：0
- P2：0
- P3：1 项保留并说明原因

## 原问题逐条映射

| 原严重度 | 原问题 | 状态 | 当前证据与说明 |
|---|---|---|---|
| P1 | 隐私同意控件触达区域过小 | 已解决 | `privacy-consent` 行高保持 `min-height: 88rpx`，独立勾选按钮为 64rpx 触达区，视觉勾选框保持 40rpx。运行时复验发现政策链接嵌在父 `button` 时仍会激活父按钮，现已拆成互不嵌套的勾选按钮与政策链接，并用 `catchtap="onOpenPolicy"` 隔离导航。 |
| P1 | 输入控件缺少独立可访问名称和字段级错误 | 已解决 | 三项必填和五项选填均有中文 `aria-label`；错误显示在对应字段下，并保留页面级摘要；空表提交时 IDE 可访问树显示称呼、手机号、验证码、同意四类错误，焦点位于称呼输入框。 |
| P1 | 次要说明文字对比度不足 | 已解决 | 目标范围次要文字统一到 `#625f5b` 或 `#706c67`，不再使用原 `#7a726c`；错误使用独立 danger 语义面。 |
| P1 | 多租户主题只作用于少数按钮 | 已解决 | `resolveThemeColor` 统一解析主色及黑白前景；Hero、品牌占位、链接、流程编号、筛选、案例预算、工地阶段、短信动作和提交动作均接收安全主题属性。 |
| P1 | 咨询页首屏认知负担过高 | 已解决 | 默认只展示称呼、手机号、验证码、选填入口、隐私同意和提交；小区、面积、预算、开工时间、需求五项默认折叠，值保存在页面 `form` 状态中。 |
| P2 | 列表与首页内容图片未启用懒加载 | 已解决 | 案例卡与工地卡图片均配置 `lazy-load="true"`；Hero 与 Logo 保持首屏立即加载。 |
| P2 | 首页栏目标题节奏重复 | 已解决 | 四页营销式 kicker 已移除；首页直接使用中文栏目标题，流程、本地服务与公司介绍形成不同信息层级。 |
| P2 | 提示与错误使用侧边色条 | 已解决 | 工地公开范围使用中性 `ui-hint-surface`，咨询摘要使用 `ui-error-surface`；目标四页无 `border-left: 6rpx`。 |
| P2 | 案例与工地卡片属于两套视觉语言 | 已解决 | 两类卡片共享 16rpx 圆角、1rpx 边界、无重阴影、原生按压反馈与租户主色状态标签；保留纵向案例和横向工地的信息密度差异。 |
| P2 | 案例空结果没有直接清除筛选操作 | 已解决 | 筛选区和有筛选空状态均提供 `onClearFilters`；IDE 已验证选中后出现“清除筛选”，点击后恢复未选中态。 |
| P2 | 首页存在重复咨询 CTA | 已解决 | 首页底部 `lead-cta` 及组件注册已移除；保留 Hero 唯一主 CTA 和固定“免费咨询”Tab。 |
| P2 | 列表页头部占用与数据量不匹配 | 已解决 | 案例与工地改为紧凑页头；393px 模拟器首屏可看到筛选或首张内容卡。 |
| P2 | 卡片和表单缺少统一按压反馈 | 已解决 | 可点击卡片、筛选、主按钮、隐私勾选按钮和状态动作统一使用 `ui-pressable` 与原生 `hover-class`；reduced motion 时停用形变。 |
| P3 | 小字号层级过多 | 保留并说明原因 | 已把共享辅助信息集中到 22–24rpx、正文/动作集中到 24–29rpx，但原生移动端仍保留 22/23/24 三档以区分元信息、隐私说明和正文；未继续机械合并，以免降低 393px 页面密度与可读性。 |
| P3 | 状态与标签圆角规则没有文档化 | 已解决 | 语义样式固定为输入/按钮 12rpx、内容卡 16rpx、筛选与状态标签全圆角；共享状态和四页直接依赖组件已按该规则收敛。 |

## 自动化证据

在 `apps/douyin-mini` 执行：

```text
bun run check
86 pass
0 fail
274 expect() calls
tsc -p tsconfig.json --noEmit
```

相比原基线 66 项测试，新增 20 项主题、四页源码契约、案例筛选和咨询表单模型测试。

源码门禁结果：

- 四页无 `section-kicker`、`page-kicker`、`lead-kicker`。
- 四页无原固定陶土品牌色清单。
- 案例与工地卡均存在图片懒加载和原生按压反馈。
- 咨询组件存在 8 个输入名称，选填区恰好包含 5 个既有字段。
- API 严格字段、分页、工地公开边界与幂等测试继续通过。
- `git diff --check` 通过。

## 抖音 IDE 证据

IDE 项目路径：

```text
/Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp/apps/douyin-mini
```

模拟器：iPhone 15 Pro，逻辑宽度 393px。

截图：

- [首页首屏](../../operations/evidence/2026-07-23-douyin-four-page-home-top.jpg)
- [首页底部](../../operations/evidence/2026-07-23-douyin-four-page-home-bottom.jpg)
- [案例筛选选中](../../operations/evidence/2026-07-23-douyin-four-page-cases-filtered.jpg)
- [案例清除筛选](../../operations/evidence/2026-07-23-douyin-four-page-cases-cleared.jpg)
- [工地公开进度](../../operations/evidence/2026-07-23-douyin-four-page-sites.jpg)
- [咨询默认折叠](../../operations/evidence/2026-07-23-douyin-four-page-lead-default.jpg)
- [咨询选填展开](../../operations/evidence/2026-07-23-douyin-four-page-lead-expanded-top.jpg)
- [咨询字段错误](../../operations/evidence/2026-07-23-douyin-four-page-lead-validation.jpg)
- [咨询隐私政策页](../../operations/evidence/2026-07-23-douyin-four-page-lead-policy.jpg)

IDE 观察：

- 首页只有 Hero 主咨询 CTA，案例和工地各展示一条，底部为流程及本地服务/公司介绍。
- 当前开发租户主色一致作用于主按钮、链接、筛选和卡片重点状态。
- 案例筛选可选中并一次清除，列表恢复未筛选态。
- 工地提示没有左侧警示色条，卡片只展示社区级区域、阶段、面积和最近更新时间。
- 咨询默认折叠选填区，展开后显示且只显示五个既有选填字段。
- 空表提交显示字段级错误和摘要，IDE 可访问树确认焦点位于称呼输入框。
- IDE 已验证政策文字可独立打开隐私政策页；导航前后可访问树均显示“同意隐私政策”而非“取消同意隐私政策”，证明政策导航没有改变未选中状态。
- 抖音开发者工具 4.5.4 已成功生成“扫码预览”二维码；二维码和复制链接均为短时效凭证，没有写入仓库或证据目录。
- 用户已在手机端完成扫码预览，确认四个 Tab、滚动、图片、键盘、选填折叠及政策链接手势均通过。
- 证据截图经 OCR 扫描，未检出完整 AppID、11 位手机号或 JWT。

## 官方依据

- [TTSS：支持通过 `@import` 复用样式](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/miniapp-framework/view/ttss)
- [自定义组件样式隔离](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/custom-component/component-model-and-style)
- [button 组件与 `hover-class`](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/component/list/button)
- [最佳实践：使用 `hover-class` 提供点击态](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/experience-optimization/tools/debug/audits/rules/best-practice)
- [image 组件与 `lazy-load`](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/component/media-component/image)

## 边界与验收结论

- 未点击上传、提审或发布。
- 未操作生产环境、数据库、抖音开放平台配置或服务端租户主题。
- 未修改 `orange` 仓库。
- 手机扫码预览已由用户确认通过。

复审结论：原 5 个 P1 已全部解决，四页达到 20/20，自动化、IDE 模拟器与手机预览验收全部完成。
