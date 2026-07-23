# 抖音装修小程序四页 UI 审计

日期：2026-07-23

审计范围：

- 首页 `pages/home/index`
- 案例 `pages/cases/index`
- 工地 `pages/sites/index`
- 免费咨询 `pages/lead/index`
- 四页直接依赖的原生 TTML、TTSS、TypeScript 组件

## Design Read

Reading this as：面向有装修需求业主的多租户抖音原生小程序，核心任务是建立装修公司信任、帮助用户浏览真实内容并完成咨询留资；视觉语言应克制、清晰、以内容和施工透明度为主，保留租户品牌色，但避免暖米色加陶土色的通用装修模板感。

设计参数：

- `DESIGN_VARIANCE: 5`：保持原生产品熟悉度，用局部非对称和图文比例建立识别度。
- `MOTION_INTENSITY: 2`：只保留加载、按压和状态变化反馈，不加入装饰性入场动画。
- `VISUAL_DENSITY: 5`：移动端需要快速浏览案例、工地和表单，不能用过度留白隐藏信息。

模式判断：`Redesign - Preserve`，采用 targeted evolution。

必须保留：

- 四个 Tab 的路由和文案。
- API 数据结构、分页、租户隔离和埋点事件。
- 咨询字段名、提交契约、短信验证、隐私同意和幂等提交。
- 现有加载、空、错误、禁用状态。
- 租户可配置的主色、Logo、Banner 和公开内容。

本次不把桌面落地页规则直接套到原生小程序。`$design-taste-frontend` 用于反模板审查、层级、色彩、形状和内容密度控制，具体实现以抖音原生组件和官方设计规范为准。

## 审计健康分

| # | 维度 | 分数 | 核心发现 |
|---|---|---:|---|
| 1 | Accessibility | 2/4 | 同意控件触达区约 21px，输入控件缺少独立可访问名称，低优先级说明文字存在 AA 对比度缺口 |
| 2 | Performance | 3/4 | 结构轻量且骨架屏完整，但列表图片未启用官方 `lazy-load` |
| 3 | Responsive Design | 3/4 | 主布局在 393px 模拟器可用，咨询双列字段和极小同意控件在窄屏仍有风险 |
| 4 | Theming | 1/4 | 租户主色只覆盖少数按钮，目标范围存在 30 余个直接色值，四页无法形成稳定的多租户主题系统 |
| 5 | Anti-Patterns | 1/4 | 过量 kicker、暖米色加陶土色、侧边色条提示、重复 CTA 和不一致卡片语言形成明显模板感 |
| **总分** |  | **10/20** | **Acceptable，需要完成一轮系统优化后再进入发布验收** |

严重度统计：

- P0：0
- P1：5
- P2：7
- P3：2

## Anti-Patterns Verdict

结论：未通过。

当前页面能完成业务任务，但容易被识别为通用装修模板，主要证据如下：

1. 首页五个栏目全部使用小号、加字距的 kicker；案例、工地、咨询页首屏再次重复同一语法。
2. 页面底色、主色和卡片阴影组成常见的暖米色加陶土色组合，租户品牌色没有真正控制整体视觉。
3. 工地隐私提示和表单错误使用 6rpx 左侧色条，属于无必要的装饰性强调。
4. 首页 Hero 与底部咨询卡重复表达同一个咨询意图，Tab 栏还提供第三个同意图入口。
5. 案例使用大图纵向阴影卡，工地使用横向描边卡，首页同屏时像来自两套组件库。

## 详细问题

### [P1] 隐私同意控件触达区域过小

- 位置：`components/privacy-consent/index.ttss:2`
- 分类：Accessibility / Responsive
- 证据：按钮固定为 `40rpx × 40rpx`。在 393px 设备上约为 `21px × 21px`，且点击事件只绑定在按钮本身。
- 影响：用户容易误触或无法准确点击，尤其影响咨询提交这一核心转化流程。
- 标准：WCAG 2.2 Target Size，移动产品通用 44px 触达建议。
- 建议：保留视觉勾选框尺寸，但把完整同意行变成至少 88rpx 高的可点击区域，同时保证政策链接拥有独立点击行为。
- 建议命令：`$impeccable adapt`

### [P1] 输入控件缺少独立可访问名称和字段级错误

- 位置：`components/lead-form/index.ttml:2-35`、`pages/lead/index.ttml:11`
- 分类：Accessibility
- 证据：可见标签使用普通 `view`，七个 `input/textarea` 没有 `aria-label`；提交错误统一显示在表单之后。
- 影响：读屏用户难以确认当前字段；普通用户提交失败后也需要自己寻找出错字段。
- 官方边界：抖音 `label` 文档说明当前可直接绑定的控件主要是 button、checkbox、radio、switch，输入框需要通过可访问属性补足名称。
- 建议：为每个输入控件添加明确 `aria-label`，建立字段错误映射，在字段下方显示错误并保留页面级错误摘要。
- 建议命令：`$impeccable harden`

### [P1] 次要说明文字对比度不足

- 位置：`pages/lead/index.ttss:7`、`components/site-card/index.ttss:9`
- 分类：Accessibility / Theming
- 证据：`#7a726c` 位于 `#f7f6f4` 上的计算对比度为 `4.37:1`，低于普通文字 AA 的 `4.5:1`。
- 影响：安全说明和更新时间在低亮度、户外或视力受限场景下难以阅读。
- 建议：统一使用通过 AA 的 muted token，不再在页面内单独派生灰色。
- 建议命令：`$impeccable colorize`

### [P1] 多租户主题只作用于少数按钮

- 位置：`components/theme.ts`、目标范围全部 TTSS
- 分类：Theming / Anti-Pattern
- 证据：审计范围内出现 30 余个不同直接色值；动态 `primary_color` 主要传入 Hero、咨询 CTA 和提交按钮，标题、筛选选中态、链接、状态提示、Tab 色仍固定为陶土色。
- 影响：不同装修公司使用同一模板时只能更换少数按钮颜色，品牌辨识度弱，部分主色还可能与固定陶土色冲突。
- 建议：建立原生 TTSS 语义 token 映射，区分 ink、surface、muted、border、accent、accent-soft、success、danger；运行时主题只控制 accent 及其可读前景色。
- 建议命令：`$impeccable colorize`

### [P1] 咨询页首屏认知负担过高

- 位置：`pages/lead/index.ttml:5-13`、`components/lead-form/index.ttml`
- 分类：Responsive / Product UX
- 证据：首屏连续展示页面说明、七组字段、隐私同意、安全说明和电话入口，主提交按钮位于两屏之后。
- 影响：用户在完成必要的姓名、手机号、验证码之前，就要理解大量可选信息；核心动作显得遥远。
- 建议：保留字段名和提交契约，将三项必填信息置于第一组，将房屋信息和需求归为明确的“补充装修信息”区域。设计确认前不改变字段顺序或默认展开策略。
- 建议命令：`$impeccable distill`

### [P2] 列表与首页内容图片未启用懒加载

- 位置：`components/case-card/index.ttml:6`、`components/site-card/index.ttml:6`
- 分类：Performance
- 证据：动态列表图片配置了 `aspectFill`，但没有 `lazy-load`。
- 影响：首页下半部分和分页列表可能提前请求屏外图片，增加启动流量和主线程图片解码压力。
- 官方依据：抖音开放平台图片组件和启动耗时优化文档均建议屏外图片开启 `lazy-load`。
- 建议：案例与工地列表图片开启 `lazy-load`；首屏 Hero 和租户 Logo 保持立即加载。
- 建议命令：`$impeccable optimize`

### [P2] 首页栏目标题节奏重复

- 位置：`pages/home/index.ttml:11-43`
- 分类：Anti-Pattern / Information Architecture
- 证据：精选案例、在建工地、服务流程、服务区域、关于我们连续使用相同 kicker 加标题组合。
- 影响：所有栏目视觉权重相同，用户难以识别浏览内容、信任信息和公司介绍之间的优先级。
- 建议：首页最多保留一个 kicker；案例和工地使用直接标题，流程改为简洁步骤轨道，服务区域和公司信息合并为信任信息区。
- 建议命令：`$impeccable layout`

### [P2] 提示与错误使用侧边色条

- 位置：`pages/sites/index.ttss:4`、`pages/lead/index.ttss:6`
- 分类：Anti-Pattern / Accessibility
- 证据：两处均使用 `border-left: 6rpx solid`。
- 影响：强调方式与其他状态组件不一致，也让提示看起来像后台告警而不是面向业主的说明。
- 建议：改为完整浅色背景、语义图标或简洁分隔线；错误仍需保留 `role="alert"`。
- 建议命令：`$impeccable quieter`

### [P2] 案例与工地卡片属于两套视觉语言

- 位置：`components/case-card/index.ttss`、`components/site-card/index.ttss`
- 分类：Theming / Anti-Pattern
- 证据：案例卡采用 24rpx 圆角、大图、无边框加阴影；工地卡采用 24rpx 圆角、横图、描边、无阴影。
- 影响：首页同屏时缺少统一的品牌组件语言，用户无法快速形成“可点击内容卡”的稳定认知。
- 建议：统一 16rpx 圆角、边框和按压反馈规则；案例保留纵向图片比例，工地保留横向信息密度，但共享同一标题、元数据和状态样式。
- 建议命令：`$impeccable polish`

### [P2] 案例空结果没有直接清除筛选操作

- 位置：`pages/cases/index.ttml:5-11`
- 分类：Product UX
- 证据：空状态文案要求用户“取消筛选”，但页面没有统一清除入口，只能逐个再次点击当前筛选 chip。
- 影响：多个筛选同时生效时恢复成本高，用户可能误以为没有案例。
- 建议：有筛选且结果为空时显示“清除筛选”动作，并保留未筛选空状态的原有业务说明。
- 建议命令：`$impeccable clarify`

### [P2] 首页存在重复咨询 CTA

- 位置：`components/hero-banner/index.ttml:12`、`pages/home/index.ttml:46`、原生 Tab 栏
- 分类：Information Architecture / Anti-Pattern
- 证据：Hero、页面底部 CTA 和“免费咨询”Tab 指向同一动作。
- 影响：重复按钮没有提供新的决策信息，底部深色卡片增加一整块视觉重量。
- 建议：保留 Hero 主 CTA 和固定 Tab；底部改为联系方式、服务承诺或直接移除，不再重复同一按钮意图。
- 建议命令：`$impeccable distill`

### [P2] 列表页头部占用与数据量不匹配

- 位置：`pages/cases/index.ttss:2-3`、`pages/sites/index.ttss:2-4`
- 分类：Responsive / Information Architecture
- 证据：列表页使用营销式 kicker 加大标题，工地页再增加一整块隐私提示，真实列表首项被推至首屏下半部。
- 影响：用户切换 Tab 后不能立即浏览内容，尤其在案例和工地是高频主任务时。
- 建议：改为紧凑标题、结果或隐私摘要同行呈现，把列表首项上移。
- 建议命令：`$impeccable layout`

### [P2] 卡片和表单缺少统一按压反馈

- 位置：`components/case-card/index.ttss`、`components/site-card/index.ttss`、`components/lead-form/index.ttss`
- 分类：Interaction
- 证据：可点击卡片和按钮主要依赖系统默认反馈，TTSS 没有统一 active 形变或背景变化。
- 影响：在图片缺失、卡片与页面底色接近时，可点击性较弱。
- 建议：为可点击卡片和主按钮建立 150ms 左右的按压反馈，只动画 transform 和 opacity，并尊重 reduced motion。
- 建议命令：`$impeccable polish`

### [P3] 小字号层级过多

- 位置：目标范围多处 `21rpx`、`22rpx`、`23rpx`、`24rpx`、`25rpx`
- 分类：Typography
- 影响：五档近似字号难以形成稳定层级，维护时容易继续分叉。
- 建议：收敛为 22rpx 辅助、24rpx 次要、28rpx 正文三档，并根据对比度决定是否提高辅助字号。
- 建议命令：`$impeccable typeset`

### [P3] 状态与标签圆角规则没有文档化

- 位置：目标范围全部 TTSS
- 分类：Theming / Consistency
- 证据：8rpx、10rpx、12rpx、14rpx、16rpx、18rpx、24rpx、44rpx 同时存在。
- 影响：单个组件看似合理，但组合后缺少统一物理语言。
- 建议：定义输入 12rpx、内容卡 16rpx、按钮 12rpx、筛选 chip 全圆角四条规则。
- 建议命令：`$impeccable polish`

## 系统性问题

1. 颜色不是语义 token，导致多租户主题、状态色和对比度无法统一验证。
2. 页面级 TTSS 重复定义同一标题和 kicker，缺少共享页面头部语言。
3. 组件状态完整，但成功态视觉经过了逐页实现，卡片、提示、链接和动作没有统一规则。
4. 首页承担过多介绍内容，浏览、信任、流程、区域、公司和咨询没有形成清晰优先级。
5. 咨询页业务安全性较好，但字段级可用性和转化节奏仍停留在“完整表单一次铺开”。

## 正向发现

- 四页均为抖音原生 TTML/TTSS，不是 H5 套壳。
- API、分页、租户隔离和表单幂等逻辑与视觉层分离良好。
- 卡片使用原生 button 并提供业务 `aria-label`。
- 加载、空、错误、禁用、分页错误状态均已实现。
- 骨架动画提供 `prefers-reduced-motion` 降级。
- 主要按钮高度普遍为 88rpx 或 96rpx，除隐私同意控件外，移动触达面积较稳定。
- 动态主色会计算黑白前景色，默认主色搭配黑字的对比度为 `4.86:1`。
- 工地公开信息边界清晰，没有展示业主姓名、电话或门牌号。

## 官方依据

- [抖音小程序设计原则：场景明确、流程闭环](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/design/design-specification/Design-Principles/Design-Principles)
- [抖音 image 组件：`lazy-load` 与 `aspectFill`](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/component/media-component/image)
- [抖音启动耗时优化：屏外图片建议开启懒加载](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/experience-optimization/launch/optimize/launch-time)
- [抖音 label 组件能力边界](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/component/list/label)
- [抖音开发者工具体验评分](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/dev-tools/developer-instrument/quality/experience-rate)

## 推荐执行顺序

1. **[P1] `$impeccable colorize`**：建立多租户语义主题，统一对比度与状态色。
2. **[P1] `$impeccable harden`**：修复表单可访问名称、字段错误和同意触达区。
3. **[P1] `$impeccable distill`**：重排首页信息优先级和咨询表单节奏。
4. **[P2] `$impeccable layout`**：统一列表页头、案例卡和工地卡的产品语言。
5. **[P2] `$impeccable optimize`**：增加列表图片懒加载并复核首屏请求。
6. **[P2] `$impeccable polish`**：统一圆角、按压、空状态和最终视觉细节。

完成修复后必须重新运行 `$impeccable audit`，并在抖音 IDE 模拟器和手机预览中复核四页。
