# 抖音装修小程序四页优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将抖音原生小程序的首页、案例、工地和免费咨询四页优化为多租户主色驱动的“施工档案型”体验，并完成自动化、IDE 与手机验收。

**Architecture:** 保留现有页面、接口、分页、埋点、短信、隐私和幂等契约。静态视觉通过 TTSS `@import` 复用语义类，租户主色只通过已校验的运行时内联样式传入；可测试的筛选和表单逻辑提取为同目录纯函数，TTML/TTSS 关键契约由 Bun 源码契约测试覆盖。

**Tech Stack:** 抖音原生 TTML/TTSS、TypeScript 5.7、Bun test、`@douyin-microapp/typings` 1.3.1、抖音开发者工具。

---

## 依据与边界

- 设计规格：`docs/superpowers/specs/2026-07-23-douyin-miniapp-four-page-redesign-design.md`
- 基线审计：`docs/superpowers/specs/2026-07-23-douyin-miniapp-four-page-ui-audit.md`
- 权威工作区：`/Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp`
- 基线验证：2026-07-23 执行 `bun run check`，结果为 66 tests passed、0 failed、TypeScript 通过。
- 用户已有改动必须保留：
  - `apps/douyin-mini/project.config.json`
  - `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`
  - 未跟踪的 `apps/douyin-mini/__MACOSX/`
  - 未跟踪的 `apps/douyin-mini/goose/`
  - 其他既有未跟踪证据和历史计划
- 不修改 `/Users/leefo/Public/work/orange`。
- 不新增依赖、后端接口、数据库字段或 migration。
- 不点击抖音 IDE 的上传、提审或发布。
- 不输出完整 AppID、AppSecret、Token、AES、Ticket 或其他秘密。

官方实现依据：

- [TTSS 支持 `@import`，变量兼容性不可靠](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/miniapp-framework/view/ttss)
- [自定义组件 TTSS 只作用于组件模板](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/custom-component/component-model-and-style)
- [button 支持 `hover-class`](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/component/list/button)
- [最佳实践要求用 `hover-class` 替代 `:active`](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/experience-optimization/tools/debug/audits/rules/best-practice)
- [image 支持 `lazy-load`](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/component/media-component/image)

## 文件结构

### 新建

- `apps/douyin-mini/src/styles/tokens.ttss`
  - 集中定义页面标题、说明、卡片、控件、状态表面和按压反馈语义类。
- `apps/douyin-mini/src/components/theme.test.ts`
  - 验证无效租户主色使用中性回退色，合法颜色始终选择可读前景。
- `apps/douyin-mini/src/ui-contracts.test.ts`
  - 验证无法由 TypeScript 单测覆盖的 TTML/TTSS 属性和视觉契约。
- `apps/douyin-mini/src/pages/cases/filter-state.ts`
  - 负责案例筛选切换、清空和激活状态判断。
- `apps/douyin-mini/src/pages/cases/filter-state.test.ts`
  - 覆盖筛选状态纯函数。
- `apps/douyin-mini/src/pages/lead/form-model.ts`
  - 负责咨询字段类型、字段级校验、错误清理和选填区展开决策。
- `apps/douyin-mini/src/pages/lead/form-model.test.ts`
  - 覆盖必填、面积、隐私同意、字段错误清理和折叠逻辑。
- `docs/superpowers/specs/2026-07-23-douyin-miniapp-four-page-ui-reaudit.md`
  - 记录实施后的五维复审、IDE 截图证据和手机验证结果。

### 修改

- 全局：
  - `apps/douyin-mini/src/app.ttss`
  - `apps/douyin-mini/src/app.json`
  - `apps/douyin-mini/src/components/theme.ts`
  - `apps/douyin-mini/src/assets/tabbar/*.svg`
  - `apps/douyin-mini/src/assets/tabbar/*.png`
- 首页：
  - `apps/douyin-mini/src/pages/home/index.ts`
  - `apps/douyin-mini/src/pages/home/index.ttml`
  - `apps/douyin-mini/src/pages/home/index.ttss`
  - `apps/douyin-mini/src/pages/home/index.json`
  - `apps/douyin-mini/src/components/tenant-brand/index.ts`
  - `apps/douyin-mini/src/components/tenant-brand/index.ttml`
  - `apps/douyin-mini/src/components/tenant-brand/index.ttss`
  - `apps/douyin-mini/src/components/hero-banner/index.ts`
  - `apps/douyin-mini/src/components/hero-banner/index.ttml`
  - `apps/douyin-mini/src/components/hero-banner/index.ttss`
  - `apps/douyin-mini/src/components/trust-metrics/index.ttss`
- 案例与工地：
  - `apps/douyin-mini/src/pages/cases/index.ts`
  - `apps/douyin-mini/src/pages/cases/index.ttml`
  - `apps/douyin-mini/src/pages/cases/index.ttss`
  - `apps/douyin-mini/src/pages/sites/index.ts`
  - `apps/douyin-mini/src/pages/sites/index.ttml`
  - `apps/douyin-mini/src/pages/sites/index.ttss`
  - `apps/douyin-mini/src/components/case-card/index.ts`
  - `apps/douyin-mini/src/components/case-card/index.ttml`
  - `apps/douyin-mini/src/components/case-card/index.ttss`
  - `apps/douyin-mini/src/components/site-card/index.ts`
  - `apps/douyin-mini/src/components/site-card/index.ttml`
  - `apps/douyin-mini/src/components/site-card/index.ttss`
- 免费咨询：
  - `apps/douyin-mini/src/pages/lead/index.ts`
  - `apps/douyin-mini/src/pages/lead/index.ttml`
  - `apps/douyin-mini/src/pages/lead/index.ttss`
  - `apps/douyin-mini/src/components/lead-form/index.ts`
  - `apps/douyin-mini/src/components/lead-form/index.ttml`
  - `apps/douyin-mini/src/components/lead-form/index.ttss`
  - `apps/douyin-mini/src/components/sms-code-input/index.ts`
  - `apps/douyin-mini/src/components/sms-code-input/index.ttml`
  - `apps/douyin-mini/src/components/sms-code-input/index.ttss`
  - `apps/douyin-mini/src/components/privacy-consent/index.ts`
  - `apps/douyin-mini/src/components/privacy-consent/index.ttml`
  - `apps/douyin-mini/src/components/privacy-consent/index.ttss`
- 共享状态：
  - `apps/douyin-mini/src/components/empty-state/index.ttml`
  - `apps/douyin-mini/src/components/empty-state/index.ttss`
  - `apps/douyin-mini/src/components/error-state/index.ttml`
  - `apps/douyin-mini/src/components/error-state/index.ttss`
  - `apps/douyin-mini/src/components/page-skeleton/index.ttss`
  - `apps/douyin-mini/src/components/pagination-loader/index.ttml`
  - `apps/douyin-mini/src/components/pagination-loader/index.ttss`

## Task 0: 固定执行基线并建立当前 worktree 代码索引

**Files:**

- Read only: 当前工作区与 Git 状态
- Ignored local artifact: `.codegraph/`

- [ ] **Step 1: 验证权威 worktree 和文档父提交**

Run:

```bash
git rev-parse --show-toplevel
git log -2 --oneline
git status --short
```

Expected:

- 顶层目录为 `/Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp`。
- 最近两个文档提交包含 `b85a5d23` 和 `0c0e1465`。
- 用户已有修改和未跟踪文件仍存在，没有被暂存。

- [ ] **Step 2: 为当前 worktree 初始化忽略的代码索引**

Run:

```bash
codegraph init -i
codegraph status
```

Expected:

- `.codegraph/` 创建成功且被 `.gitignore` 忽略。
- 索引根目录指向当前 worktree，而不是主工作区。

- [ ] **Step 3: 在首次代码编辑前读取关键调用链**

Use `codegraph_explore` with:

```text
resolveThemeColor home cases sites lead case-card site-card lead-form privacy-consent
```

Expected:

- 返回当前 worktree 的主题加载、页面数据、卡片属性和表单提交路径。
- 如果出现索引滞后提示，只读取提示中的待同步文件，不重复 grep 全仓。

- [ ] **Step 4: 重跑基线**

Run:

```bash
cd apps/douyin-mini
bun run check
```

Expected: 66 tests passed、0 failed、`tsc --noEmit` 成功。

## Task 1: 建立中性全局外壳与共享语义样式

**Files:**

- Create: `apps/douyin-mini/src/styles/tokens.ttss`
- Create: `apps/douyin-mini/src/components/theme.test.ts`
- Create: `apps/douyin-mini/src/ui-contracts.test.ts`
- Modify: `apps/douyin-mini/src/components/theme.ts`
- Modify: `apps/douyin-mini/src/app.ttss`
- Modify: `apps/douyin-mini/src/app.json`
- Modify: `apps/douyin-mini/src/assets/tabbar/*.svg`
- Regenerate: `apps/douyin-mini/src/assets/tabbar/*.png`

- [ ] **Step 1: 写主题回退色失败测试**

Create `apps/douyin-mini/src/components/theme.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { resolveThemeColor } from "./theme";

describe("tenant theme", () => {
  test("invalid tenant colors fall back to neutral ink", () => {
    expect(resolveThemeColor("not-a-color")).toEqual({
      primaryColor: "#191817",
      primaryTextColor: "#FFFFFF",
      contrastRatio: expect.any(Number),
    });
  });

  test("valid tenant colors keep the color and choose the stronger foreground", () => {
    const result = resolveThemeColor("#F1C40F");
    expect(result.primaryColor).toBe("#F1C40F");
    expect(result.primaryTextColor).toBe("#000000");
    expect(result.contrastRatio).toBeGreaterThanOrEqual(4.5);
  });
});
```

Create the initial `apps/douyin-mini/src/ui-contracts.test.ts`:

```ts
import { expect, test } from "bun:test";

const readSource = (relativePath: string) =>
  Bun.file(`${import.meta.dir}/${relativePath}`).text();

test("global shell imports semantic styles and contains no terracotta tab accent", async () => {
  const [appStyle, appConfig, theme, ...icons] = await Promise.all([
    readSource("app.ttss"),
    readSource("app.json"),
    readSource("components/theme.ts"),
    ...["home", "cases", "sites", "lead"].flatMap((name) => [
      readSource(`assets/tabbar/${name}.svg`),
      readSource(`assets/tabbar/${name}-active.svg`),
    ]),
  ]);
  const shellSource = [appStyle, appConfig, theme, ...icons].join("\n").toLowerCase();
  expect(appStyle).toContain('@import "./styles/tokens.ttss";');
  expect(shellSource).not.toContain("#c45a32");
  expect(shellSource).not.toContain("#a84324");
  expect(appConfig).toContain('"selectedColor": "#191817"');
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
cd apps/douyin-mini
bun test src/components/theme.test.ts src/ui-contracts.test.ts
```

Expected:

- 主题测试因当前回退色为 `#C45A32` 失败。
- 外壳契约因尚未导入 token 且仍含陶土色失败。

- [ ] **Step 3: 实现中性主题与语义类**

Change `DEFAULT_PRIMARY_COLOR` in `components/theme.ts` to:

```ts
const DEFAULT_PRIMARY_COLOR = "#191817";
```

Create `styles/tokens.ttss`:

```css
.ui-page-title {
  color: #191817;
  font-size: 42rpx;
  font-weight: 650;
  line-height: 1.3;
}

.ui-page-description {
  margin-top: 12rpx;
  color: #625f5b;
  font-size: 24rpx;
  line-height: 1.65;
}

.ui-section-title {
  color: #191817;
  font-size: 34rpx;
  font-weight: 650;
  line-height: 1.35;
}

.ui-card {
  box-sizing: border-box;
  overflow: hidden;
  border: 1rpx solid #dddad5;
  border-radius: 16rpx;
  background: #fff;
  color: #191817;
}

.ui-pressable {
  transition: opacity 150ms ease, transform 150ms ease;
}

.ui-pressable--pressed {
  opacity: .88;
  transform: scale(.99);
}

.ui-meta {
  color: #706c67;
  font-size: 22rpx;
  line-height: 1.5;
}

.ui-control {
  box-sizing: border-box;
  border: 1rpx solid #dddad5;
  border-radius: 12rpx;
  background: #fff;
  color: #191817;
}

.ui-control--error {
  border-color: #b42318;
}

.ui-field-error {
  margin-top: 10rpx;
  color: #b42318;
  font-size: 22rpx;
  line-height: 1.5;
}

.ui-hint-surface {
  border-radius: 12rpx;
  background: #eceae6;
  color: #625f5b;
}

.ui-error-surface {
  border-radius: 12rpx;
  background: #fdecea;
  color: #8e1b13;
}

@media (prefers-reduced-motion: reduce) {
  .ui-pressable {
    transition: none;
  }

  .ui-pressable--pressed {
    transform: none;
  }
}
```

Replace `app.ttss` with:

```css
@import "./styles/tokens.ttss";

page {
  min-height: 100%;
  background: #f5f5f3;
  color: #191817;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

button {
  font-family: inherit;
}

button::after {
  border: 0;
}

.page-content {
  box-sizing: border-box;
  width: 100%;
  padding: 32rpx;
}
```

Update `app.json`:

```json
"window": {
  "navigationBarTitleText": "装修服务",
  "navigationBarBackgroundColor": "#F5F5F3",
  "navigationBarTextStyle": "black",
  "backgroundColor": "#F5F5F3"
},
"tabBar": {
  "color": "#625F5B",
  "selectedColor": "#191817",
  "backgroundColor": "#FFFFFF",
  "borderStyle": "black"
}
```

Change inactive SVG strokes to `#625F5B` and active SVG strokes to `#191817`, then regenerate every PNG from its SVG:

```bash
for icon in home cases sites lead; do
  rsvg-convert -w 81 -h 81 "src/assets/tabbar/${icon}.svg" \
    -o "src/assets/tabbar/${icon}.png"
  rsvg-convert -w 81 -h 81 "src/assets/tabbar/${icon}-active.svg" \
    -o "src/assets/tabbar/${icon}-active.png"
done
```

- [ ] **Step 4: 验证主题任务转绿**

Run:

```bash
bun test src/components/theme.test.ts src/ui-contracts.test.ts
bun run typecheck
git diff --check
```

Expected: 0 failed、类型检查成功、无空白错误。

- [ ] **Step 5: 提交主题基础**

```bash
git add apps/douyin-mini/src/styles/tokens.ttss \
  apps/douyin-mini/src/components/theme.ts \
  apps/douyin-mini/src/components/theme.test.ts \
  apps/douyin-mini/src/ui-contracts.test.ts \
  apps/douyin-mini/src/app.ttss \
  apps/douyin-mini/src/app.json \
  apps/douyin-mini/src/assets/tabbar
git commit -m "style(douyin-mini): 建立租户主题基础"
```

## Task 2: 统一案例与工地内容卡

**Files:**

- Modify: `apps/douyin-mini/src/ui-contracts.test.ts`
- Modify: `apps/douyin-mini/src/components/case-card/index.ts`
- Modify: `apps/douyin-mini/src/components/case-card/index.ttml`
- Modify: `apps/douyin-mini/src/components/case-card/index.ttss`
- Modify: `apps/douyin-mini/src/components/site-card/index.ts`
- Modify: `apps/douyin-mini/src/components/site-card/index.ttml`
- Modify: `apps/douyin-mini/src/components/site-card/index.ttss`

- [ ] **Step 1: 追加卡片失败契约**

Append to `ui-contracts.test.ts`:

```ts
test("case and site cards lazy load media and expose native press feedback", async () => {
  const [caseTemplate, siteTemplate] = await Promise.all([
    readSource("components/case-card/index.ttml"),
    readSource("components/site-card/index.ttml"),
  ]);
  for (const template of [caseTemplate, siteTemplate]) {
    expect(template).toContain('lazy-load="true"');
    expect(template).toContain('hover-class="ui-pressable--pressed"');
    expect(template).toContain('primaryColor');
  }
});
```

- [ ] **Step 2: 运行并确认缺少懒加载而失败**

Run:

```bash
bun test src/ui-contracts.test.ts
```

Expected: 新测试因缺少 `lazy-load`、按压类和主色属性失败。

- [ ] **Step 3: 增加卡片主题属性和 TTML 契约**

Add to both card component property blocks:

```ts
primaryColor: { type: String, value: "#191817" },
primaryTextColor: { type: String, value: "#FFFFFF" },
```

The case card root and image become:

```xml
<button tt:else class="case ui-card ui-pressable" hover-class="ui-pressable--pressed" hover-start-time="20" bindtap="onSelect" aria-label="查看案例 {{item.title}}">
  <image tt:if="{{(item.cover_image_url || fallbackImageUrl) && !imageFailed}}" class="case-image" src="{{item.cover_image_url || fallbackImageUrl}}" mode="aspectFill" lazy-load="true" binderror="onImageError" />
```

The case budget becomes:

```xml
<view tt:if="{{item.budget_band}}" class="case-budget" style="border-color: {{primaryColor}}; color: {{primaryColor}}">{{item.budget_band}}</view>
```

The site card root, image and stage become:

```xml
<button tt:else class="site ui-card ui-pressable" hover-class="ui-pressable--pressed" hover-start-time="20" bindtap="onSelect" aria-label="查看工地 {{item.community || '公开在建工地'}}">
  <image tt:if="{{(item.cover_image_url || fallbackImageUrl) && !imageFailed}}" class="site-image" src="{{item.cover_image_url || fallbackImageUrl}}" mode="aspectFill" lazy-load="true" binderror="onImageError" />
```

```xml
<view class="site-stage" style="border-color: {{primaryColor}}; color: {{primaryColor}}">{{item.status || '施工中'}}</view>
```

- [ ] **Step 4: 重写卡片局部样式**

Both component TTSS files start with:

```css
@import "../../styles/tokens.ttss";
```

Case-specific rules:

```css
.case { display: block; width: 100%; padding: 0; text-align: left; }
.case-image { display: block; width: 100%; height: 300rpx; background: #eceae6; }
.case-image--empty { display: flex; align-items: center; justify-content: center; color: #706c67; font-size: 24rpx; }
.case-body { padding: 28rpx; }
.case-title { max-height: 84rpx; overflow: hidden; font-size: 30rpx; font-weight: 650; line-height: 1.4; }
.case-meta { margin-top: 10rpx; color: #625f5b; font-size: 24rpx; line-height: 1.5; }
.case-footer { display: flex; min-height: 48rpx; margin-top: 22rpx; align-items: center; justify-content: space-between; gap: 16rpx; }
.case-location { overflow: hidden; color: #625f5b; font-size: 24rpx; text-overflow: ellipsis; white-space: nowrap; }
.case-budget { flex: none; padding: 6rpx 12rpx; border: 1rpx solid; border-radius: 999rpx; background: #f5f5f3; font-size: 22rpx; }
.case--loading, .case--state { display: flex; min-height: 472rpx; align-items: center; justify-content: center; }
.case-skeleton { width: calc(100% - 48rpx); height: 424rpx; border-radius: 16rpx; background: #eceae6; animation: case-pulse 1.4s ease-in-out infinite; }
.case--state { flex-direction: column; color: #625f5b; font-size: 26rpx; }
.state-action { min-width: 144rpx; min-height: 88rpx; margin-top: 20rpx; border-radius: 12rpx; background: #191817; color: #fff; font-size: 26rpx; line-height: 88rpx; }
@keyframes case-pulse { 50% { opacity: .55; } }
@media (prefers-reduced-motion: reduce) { .case-skeleton { animation: none; opacity: .65; } }
```

Site-specific rules:

```css
.site { display: flex; width: 100%; min-height: 220rpx; padding: 0; text-align: left; }
.site-image { width: 240rpx; min-height: 220rpx; flex: none; background: #eceae6; }
.site-image--empty { display: flex; align-items: center; justify-content: center; padding: 20rpx; color: #706c67; font-size: 22rpx; text-align: center; }
.site-body { min-width: 0; flex: 1; padding: 28rpx 26rpx; }
.site-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx; }
.site-title { overflow: hidden; font-size: 30rpx; font-weight: 650; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.site-stage { flex: none; padding: 6rpx 12rpx; border: 1rpx solid; border-radius: 999rpx; background: #f5f5f3; font-size: 22rpx; }
.site-meta { margin-top: 14rpx; color: #625f5b; font-size: 24rpx; line-height: 1.5; }
.site-time { margin-top: 18rpx; color: #706c67; font-size: 22rpx; line-height: 1.5; }
.site--loading, .site--state { align-items: center; justify-content: center; }
.site-skeleton { width: calc(100% - 48rpx); height: 172rpx; border-radius: 16rpx; background: #eceae6; animation: site-pulse 1.4s ease-in-out infinite; }
.site--state { flex-direction: column; color: #625f5b; font-size: 26rpx; }
.state-action { min-width: 144rpx; min-height: 88rpx; margin-top: 18rpx; border-radius: 12rpx; background: #191817; color: #fff; font-size: 26rpx; line-height: 88rpx; }
@keyframes site-pulse { 50% { opacity: .55; } }
@media (prefers-reduced-motion: reduce) { .site-skeleton { animation: none; opacity: .65; } }
```

- [ ] **Step 5: 验证卡片任务**

Run:

```bash
bun test src/ui-contracts.test.ts
bun run typecheck
git diff --check
```

Expected: 0 failed、类型检查成功。

- [ ] **Step 6: 提交统一卡片**

```bash
git add apps/douyin-mini/src/ui-contracts.test.ts \
  apps/douyin-mini/src/components/case-card \
  apps/douyin-mini/src/components/site-card
git commit -m "style(douyin-mini): 统一案例与工地卡片"
```

## Task 3: 重排首页信息层级

**Files:**

- Modify: `apps/douyin-mini/src/ui-contracts.test.ts`
- Modify: `apps/douyin-mini/src/pages/home/index.ts`
- Modify: `apps/douyin-mini/src/pages/home/index.ttml`
- Modify: `apps/douyin-mini/src/pages/home/index.ttss`
- Modify: `apps/douyin-mini/src/pages/home/index.json`
- Modify: `apps/douyin-mini/src/components/tenant-brand/index.ts`
- Modify: `apps/douyin-mini/src/components/tenant-brand/index.ttml`
- Modify: `apps/douyin-mini/src/components/tenant-brand/index.ttss`
- Modify: `apps/douyin-mini/src/components/hero-banner/index.ts`
- Modify: `apps/douyin-mini/src/components/hero-banner/index.ttml`
- Modify: `apps/douyin-mini/src/components/hero-banner/index.ttss`
- Modify: `apps/douyin-mini/src/components/trust-metrics/index.ttss`

- [ ] **Step 1: 追加首页失败契约**

Append:

```ts
test("home keeps one lead intent and uses direct Chinese section headings", async () => {
  const [template, config] = await Promise.all([
    readSource("pages/home/index.ttml"),
    readSource("pages/home/index.json"),
  ]);
  expect(template).not.toContain("section-kicker");
  expect(template).not.toContain("<lead-cta");
  expect(config).not.toContain('"lead-cta"');
  expect(template).toContain("本地服务与公司介绍");
  expect(template).toContain('primary-color="{{primaryColor}}"');
});
```

- [ ] **Step 2: 运行并确认重复 CTA 与 kicker 导致失败**

Run: `bun test src/ui-contracts.test.ts`

Expected: 新首页契约失败。

- [ ] **Step 3: 解析一次租户主题并限制首页主内容数量**

In `pages/home/index.ts`:

```ts
import { resolveThemeColor } from "../../components/theme";
```

Change the initial `primaryColor` to `#191817`, add
`primaryTextColor: "#FFFFFF"` to data, and update `load()`:

```ts
const theme = resolveThemeColor(bootstrap.theme.primary_color);
this.setData({
  loading: false,
  brandName: bootstrap.company.name,
  logoUrl: bootstrap.company.logo_url || "",
  city,
  summary: bootstrap.company.summary || "",
  bannerTitle: banner?.title || "装修先规划，开工更放心",
  bannerSubtitle: banner?.subtitle || "查看真实案例与在建工地，再预约专人沟通",
  bannerImageUrl: banner?.image_url || "",
  primaryColor: theme.primaryColor,
  primaryTextColor: theme.primaryTextColor,
  metrics: buildTrustMetrics(bootstrap.content.trust_metrics),
  featuredCases: bootstrap.content.featured_cases.slice(0, 1),
  activeSites: bootstrap.content.active_sites.map(toPublicSitePresentation).slice(0, 1),
  casesEnabled: bootstrap.features.cases,
  sitesEnabled: bootstrap.features.sites,
  serviceRegions: formatRegions(bootstrap.company.service_regions),
});
```

- [ ] **Step 4: 重排首页 TTML**

Required structure:

```xml
<tenant-brand name="{{brandName}}" city="{{city}}" logo-url="{{logoUrl}}" primary-color="{{primaryColor}}" primary-text-color="{{primaryTextColor}}" />
<view class="home-block home-hero">
  <hero-banner title="{{bannerTitle}}" subtitle="{{bannerSubtitle}}" image-url="{{bannerImageUrl}}" primary-color="{{primaryColor}}" bindaction="onLead" />
</view>
<view class="home-block"><trust-metrics items="{{metrics}}" /></view>

<view tt:if="{{casesEnabled}}" class="home-section">
  <view class="section-heading"><view class="ui-section-title">精选装修案例</view><button class="section-link ui-pressable" hover-class="ui-pressable--pressed" style="color: {{primaryColor}}" bindtap="onViewCases">查看全部</button></view>
  <view tt:if="{{featuredCases.length}}" class="card-list">
    <view tt:for="{{featuredCases}}" tt:key="id"><case-card item="{{item}}" primary-color="{{primaryColor}}" primary-text-color="{{primaryTextColor}}" bindselect="onCaseSelect" /></view>
  </view>
  <empty-state tt:else title="案例正在整理" description="装修公司尚未发布公开案例。" />
</view>

<view tt:if="{{sitesEnabled}}" class="home-section">
  <view class="section-heading"><view class="ui-section-title">在建工地</view><button class="section-link ui-pressable" hover-class="ui-pressable--pressed" style="color: {{primaryColor}}" bindtap="onViewSites">查看全部</button></view>
  <view tt:if="{{activeSites.length}}" class="site-list">
    <view tt:for="{{activeSites}}" tt:key="id"><site-card item="{{item}}" primary-color="{{primaryColor}}" primary-text-color="{{primaryTextColor}}" bindselect="onSiteSelect" /></view>
  </view>
  <empty-state tt:else title="暂无公开工地" description="在建项目将由装修公司确认公开后展示。" />
</view>

<view class="home-section">
  <view class="ui-section-title">装修服务流程</view>
  <view class="process-list">
    <view tt:for="{{serviceProcess}}" tt:key="id" class="process-item">
      <view class="process-index" style="color: {{primaryColor}}">{{item.index}}</view>
      <view><view class="process-title">{{item.title}}</view><view class="process-description">{{item.description}}</view></view>
    </view>
  </view>
  <view class="process-note">具体服务内容、价格与工期以你和装修公司最终确认的信息为准。</view>
</view>

<view class="home-section trust-panel ui-card">
  <view class="ui-section-title">本地服务与公司介绍</view>
  <view tt:if="{{serviceRegions.length}}" class="region-list"><view tt:for="{{serviceRegions}}" tt:key="*this" class="region-tag">{{item}}</view></view>
  <view tt:else class="section-empty">服务区域正在完善，可提交需求后进一步确认。</view>
  <view class="company-name">{{brandName}}</view>
  <view class="company-copy">{{summary || '公司公开介绍正在完善。'}}</view>
  <button class="text-action ui-pressable" hover-class="ui-pressable--pressed" style="color: {{primaryColor}}" bindtap="onViewCompany">查看公司介绍</button>
</view>

<button class="privacy-link ui-pressable" hover-class="ui-pressable--pressed" bindtap="onViewPrivacy">隐私政策与用户协议</button>
```

Remove `lead-cta` from `pages/home/index.json`.

- [ ] **Step 5: 让品牌、Hero 与指标使用同一视觉语言**

Add tenant brand properties:

```ts
primaryColor: { type: String, value: "#191817" },
primaryTextColor: { type: String, value: "#FFFFFF" },
```

Apply them only to the fallback logo:

```xml
<view tt:else class="brand-logo brand-logo--fallback" style="background-color: {{primaryColor}}; color: {{primaryTextColor}}">装</view>
```

Update Hero defaults to `#191817` and `#FFFFFF`, add
`hover-class="ui-pressable--pressed"` to action and retry buttons, and import
`../../styles/tokens.ttss` in Hero, tenant-brand and trust-metrics TTSS.

Use these home spacing rules:

```css
.home-page { padding-bottom: 56rpx; }
.home-block { margin-top: 28rpx; }
.home-hero { margin-top: 24rpx; }
.home-section { margin-top: 56rpx; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 24rpx; margin-bottom: 24rpx; }
.section-link, .text-action, .privacy-link { min-height: 88rpx; margin: 0; padding: 0 8rpx; background: transparent; font-size: 26rpx; line-height: 88rpx; }
.card-list, .site-list { display: flex; flex-direction: column; gap: 24rpx; }
.process-list { margin-top: 22rpx; border-top: 1rpx solid #dddad5; }
.process-item { display: flex; gap: 24rpx; padding: 26rpx 0; border-bottom: 1rpx solid #dddad5; }
.process-index { width: 60rpx; flex: none; font-size: 24rpx; font-weight: 650; }
.process-title { color: #191817; font-size: 28rpx; font-weight: 650; }
.process-description, .process-note, .company-copy, .section-empty { margin-top: 8rpx; color: #625f5b; font-size: 24rpx; line-height: 1.65; }
.process-note { margin-top: 18rpx; font-size: 22rpx; }
.trust-panel { padding: 32rpx; }
.region-list { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 24rpx; }
.region-tag { padding: 12rpx 18rpx; border-radius: 999rpx; background: #eceae6; color: #625f5b; font-size: 24rpx; }
.section-empty { margin-top: 20rpx; }
.company-name { margin-top: 28rpx; color: #191817; font-size: 28rpx; font-weight: 650; }
.company-copy { margin-top: 12rpx; }
.text-action { margin-top: 8rpx; }
.privacy-link { width: 100%; margin-top: 24rpx; color: #706c67; font-size: 23rpx; text-align: center; }
```

- [ ] **Step 6: 验证并提交首页**

Run:

```bash
bun test src/ui-contracts.test.ts
bun run typecheck
git diff --check
```

Expected: 0 failed、类型检查成功。

Commit:

```bash
git add apps/douyin-mini/src/ui-contracts.test.ts \
  apps/douyin-mini/src/pages/home \
  apps/douyin-mini/src/components/tenant-brand \
  apps/douyin-mini/src/components/hero-banner \
  apps/douyin-mini/src/components/trust-metrics
git commit -m "style(douyin-mini): 重排首页信任内容"
```

## Task 4: 优化案例筛选与空结果恢复

**Files:**

- Create: `apps/douyin-mini/src/pages/cases/filter-state.ts`
- Create: `apps/douyin-mini/src/pages/cases/filter-state.test.ts`
- Modify: `apps/douyin-mini/src/ui-contracts.test.ts`
- Modify: `apps/douyin-mini/src/pages/cases/index.ts`
- Modify: `apps/douyin-mini/src/pages/cases/index.ttml`
- Modify: `apps/douyin-mini/src/pages/cases/index.ttss`

- [ ] **Step 1: 写筛选状态失败测试**

Create `filter-state.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  clearCaseFilters,
  hasActiveCaseFilters,
  toggleCaseFilter,
} from "./filter-state";

describe("case filters", () => {
  test("selects and then deselects the same style", () => {
    const selected = toggleCaseFilter({ selectedStyle: "", selectedLayout: "" }, "style", "现代");
    expect(selected).toEqual({ selectedStyle: "现代", selectedLayout: "" });
    expect(toggleCaseFilter(selected, "style", "现代")).toEqual({
      selectedStyle: "",
      selectedLayout: "",
    });
  });

  test("changes one filter without dropping the other", () => {
    expect(toggleCaseFilter(
      { selectedStyle: "现代", selectedLayout: "三室" },
      "layout",
      "两室",
    )).toEqual({ selectedStyle: "现代", selectedLayout: "两室" });
  });

  test("clears both filters and reports no active selection", () => {
    const cleared = clearCaseFilters();
    expect(cleared).toEqual({ selectedStyle: "", selectedLayout: "" });
    expect(hasActiveCaseFilters(cleared)).toBe(false);
  });

  test("reports either filter as active", () => {
    expect(hasActiveCaseFilters({ selectedStyle: "原木", selectedLayout: "" })).toBe(true);
    expect(hasActiveCaseFilters({ selectedStyle: "", selectedLayout: "四室" })).toBe(true);
  });
});
```

Append the cases contract:

```ts
test("cases exposes a compact header and one-step filter reset", async () => {
  const template = await readSource("pages/cases/index.ttml");
  expect(template).not.toContain("page-kicker");
  expect(template).toContain('bindtap="onClearFilters"');
  expect(template).toContain('bindaction="onClearFilters"');
  expect(template).toContain('primary-color="{{primaryColor}}"');
});
```

- [ ] **Step 2: 运行并确认模块和操作尚不存在**

Run:

```bash
bun test src/pages/cases/filter-state.test.ts src/ui-contracts.test.ts
```

Expected: 模块导入失败或新契约失败。创建空模块前先确认失败来自功能缺失。

- [ ] **Step 3: 实现纯筛选状态**

Create `filter-state.ts`:

```ts
export type CaseFilterState = {
  selectedStyle: string;
  selectedLayout: string;
};

export type CaseFilterKind = "style" | "layout";

export function toggleCaseFilter(
  current: CaseFilterState,
  kind: CaseFilterKind,
  value: string,
): CaseFilterState {
  if (kind === "style") {
    return {
      ...current,
      selectedStyle: current.selectedStyle === value ? "" : value,
    };
  }
  return {
    ...current,
    selectedLayout: current.selectedLayout === value ? "" : value,
  };
}

export function clearCaseFilters(): CaseFilterState {
  return { selectedStyle: "", selectedLayout: "" };
}

export function hasActiveCaseFilters(filters: CaseFilterState): boolean {
  return Boolean(filters.selectedStyle || filters.selectedLayout);
}
```

- [ ] **Step 4: 接入页面主题和筛选状态**

Import `resolveThemeColor` and the three filter helpers. Add data:

```ts
primaryColor: "#191817",
primaryTextColor: "#FFFFFF",
activeFilterStyle: "border-color: #191817; background-color: #191817; color: #FFFFFF;",
hasActiveFilters: false,
```

After bootstrap:

```ts
const theme = resolveThemeColor(bootstrap.theme.primary_color);
this.setData({
  featureReady: true,
  primaryColor: theme.primaryColor,
  primaryTextColor: theme.primaryTextColor,
  activeFilterStyle: `border-color: ${theme.primaryColor}; background-color: ${theme.primaryColor}; color: ${theme.primaryTextColor};`,
});
```

Replace both selection handlers with:

```ts
onSelectStyle(event: { currentTarget: { dataset: { value?: string } } }) {
  this.applyFilters(toggleCaseFilter(this.data, "style", event.currentTarget.dataset.value || ""));
},
onSelectLayout(event: { currentTarget: { dataset: { value?: string } } }) {
  this.applyFilters(toggleCaseFilter(this.data, "layout", event.currentTarget.dataset.value || ""));
},
onClearFilters() {
  if (!hasActiveCaseFilters(this.data)) return;
  this.applyFilters(clearCaseFilters());
},
applyFilters(filters: { selectedStyle: string; selectedLayout: string }) {
  this.setData({
    ...filters,
    hasActiveFilters: hasActiveCaseFilters(filters),
  });
  void this.load("refresh");
},
```

- [ ] **Step 5: 重写案例页头、筛选和空状态**

Required TTML:

```xml
<view class="page-header">
  <view class="ui-page-title">装修案例</view>
  <view class="ui-page-description">按风格和户型浏览装修公司已公开的真实案例。</view>
</view>
<view tt:if="{{styleOptions.length || layoutOptions.length}}" class="filters">
  <view class="filter-heading"><view class="filter-heading-title">筛选案例</view><button tt:if="{{hasActiveFilters}}" class="filter-clear ui-pressable" hover-class="ui-pressable--pressed" style="color: {{primaryColor}}" bindtap="onClearFilters">清除筛选</button></view>
  <view tt:if="{{styleOptions.length}}" class="filter-row"><view class="filter-label">风格</view><scroll-view scroll-x class="filter-scroll"><view class="filter-options"><button tt:for="{{styleOptions}}" tt:key="*this" class="filter-chip ui-pressable" hover-class="ui-pressable--pressed" style="{{selectedStyle === item ? activeFilterStyle : ''}}" data-value="{{item}}" bindtap="onSelectStyle">{{item}}</button></view></scroll-view></view>
  <view tt:if="{{layoutOptions.length}}" class="filter-row"><view class="filter-label">户型</view><scroll-view scroll-x class="filter-scroll"><view class="filter-options"><button tt:for="{{layoutOptions}}" tt:key="*this" class="filter-chip ui-pressable" hover-class="ui-pressable--pressed" style="{{selectedLayout === item ? activeFilterStyle : ''}}" data-value="{{item}}" bindtap="onSelectLayout">{{item}}</button></view></scroll-view></view>
</view>
<view tt:if="{{items.length}}" class="case-list"><view tt:for="{{items}}" tt:key="id"><case-card item="{{item}}" primary-color="{{primaryColor}}" primary-text-color="{{primaryTextColor}}" bindselect="onCaseSelect" /></view></view>
<empty-state tt:elif="{{disabled}}" title="案例模块暂未开放" description="装修公司当前未开放公开案例展示。" />
<empty-state tt:else title="暂无匹配案例" description="{{hasActiveFilters ? '当前筛选下暂无案例，可以清除筛选后继续浏览。' : '装修公司尚未发布公开案例，可以稍后再来查看。'}}" action-label="{{hasActiveFilters ? '清除筛选' : ''}}" bindaction="onClearFilters" />
```

Use compact page spacing, 88rpx chips and no fixed active color in TTSS.

- [ ] **Step 6: 验证并提交案例页**

Run:

```bash
bun test src/pages/cases/filter-state.test.ts src/ui-contracts.test.ts
bun run typecheck
git diff --check
```

Expected: 0 failed、类型检查成功。

Commit:

```bash
git add apps/douyin-mini/src/ui-contracts.test.ts apps/douyin-mini/src/pages/cases
git commit -m "feat(douyin-mini): 增加案例筛选恢复"
```

## Task 5: 优化工地信息和公开边界提示

**Files:**

- Modify: `apps/douyin-mini/src/ui-contracts.test.ts`
- Modify: `apps/douyin-mini/src/pages/sites/index.ts`
- Modify: `apps/douyin-mini/src/pages/sites/index.ttml`
- Modify: `apps/douyin-mini/src/pages/sites/index.ttss`

- [ ] **Step 1: 追加工地页失败契约**

```ts
test("sites uses a compact public-boundary notice without an alert stripe", async () => {
  const [template, style] = await Promise.all([
    readSource("pages/sites/index.ttml"),
    readSource("pages/sites/index.ttss"),
  ]);
  expect(template).not.toContain("page-kicker");
  expect(template).toContain("公开范围");
  expect(template).toContain('primary-color="{{primaryColor}}"');
  expect(style).not.toContain("border-left");
});
```

- [ ] **Step 2: 运行并确认旧页头和色条导致失败**

Run: `bun test src/ui-contracts.test.ts`

Expected: 新工地契约失败。

- [ ] **Step 3: 接入租户主题**

Import `resolveThemeColor`, add neutral theme defaults, and set resolved
`primaryColor` plus `primaryTextColor` in `initialize()` before loading the
first page. Do not change pagination or public field mapping.

- [ ] **Step 4: 重写工地页头和提示**

```xml
<view class="page-header">
  <view class="ui-page-title">在建工地</view>
  <view class="ui-page-description">查看装修公司已确认公开的施工阶段和最近进展。</view>
</view>
<view class="privacy-note ui-hint-surface">
  <view class="privacy-label">公开范围</view>
  <view class="privacy-copy">仅展示社区级位置与施工进度，不展示业主姓名、电话或门牌号。</view>
</view>
<view tt:if="{{items.length}}" class="site-list"><view tt:for="{{items}}" tt:key="id"><site-card item="{{item}}" primary-color="{{primaryColor}}" primary-text-color="{{primaryTextColor}}" bindselect="onSiteSelect" /></view></view>
```

TTSS:

```css
.sites-page { padding-bottom: 36rpx; }
.page-header { padding-bottom: 22rpx; }
.privacy-note { display: flex; gap: 18rpx; padding: 20rpx 22rpx; }
.privacy-label { flex: none; color: #191817; font-size: 23rpx; font-weight: 650; line-height: 1.6; }
.privacy-copy { color: #625f5b; font-size: 23rpx; line-height: 1.6; }
.site-list { display: flex; flex-direction: column; gap: 24rpx; margin-top: 24rpx; }
```

- [ ] **Step 5: 验证并提交工地页**

Run:

```bash
bun test src/ui-contracts.test.ts
bun run typecheck
git diff --check
```

Expected: 0 failed、类型检查成功。

Commit:

```bash
git add apps/douyin-mini/src/ui-contracts.test.ts apps/douyin-mini/src/pages/sites
git commit -m "style(douyin-mini): 突出工地公开进度"
```

## Task 6: 重构咨询表单为必填优先和字段级错误

**Files:**

- Create: `apps/douyin-mini/src/pages/lead/form-model.ts`
- Create: `apps/douyin-mini/src/pages/lead/form-model.test.ts`
- Modify: `apps/douyin-mini/src/ui-contracts.test.ts`
- Modify: `apps/douyin-mini/src/pages/lead/index.ts`
- Modify: `apps/douyin-mini/src/pages/lead/index.ttml`
- Modify: `apps/douyin-mini/src/pages/lead/index.ttss`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ts`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ttml`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ttss`
- Modify: `apps/douyin-mini/src/components/sms-code-input/index.ts`
- Modify: `apps/douyin-mini/src/components/sms-code-input/index.ttml`
- Modify: `apps/douyin-mini/src/components/sms-code-input/index.ttss`
- Modify: `apps/douyin-mini/src/components/privacy-consent/index.ts`
- Modify: `apps/douyin-mini/src/components/privacy-consent/index.ttml`
- Modify: `apps/douyin-mini/src/components/privacy-consent/index.ttss`

- [ ] **Step 1: 写表单模型失败测试**

Create `form-model.test.ts` with tests for:

```ts
import { describe, expect, test } from "bun:test";
import {
  clearLeadFieldError,
  resolveOptionalDetailsExpanded,
  toggleOptionalDetails,
  validateLeadForm,
  type LeadFormValue,
} from "./form-model";

const VALID_FORM: LeadFormValue = {
  name: "李先生",
  phone: "13800138000",
  sms_code: "123456",
  community: "",
  area: "",
  budget: "",
  start_time: "",
  demand: "",
  consented_at: "2026-07-23T00:00:00.000Z",
};

describe("lead form model", () => {
  test("returns ordered field errors for empty required values", () => {
    const result = validateLeadForm({
      ...VALID_FORM,
      name: "",
      phone: "",
      sms_code: "",
    }, false);
    expect(result.firstField).toBe("name");
    expect(result.summary).toBe("请填写称呼");
    expect(result.fieldErrors).toEqual({
      name: "请填写称呼",
      phone: "请填写正确的手机号",
      sms_code: "请填写6位短信验证码",
      consent: "请先阅读并同意隐私政策",
    });
  });

  test("reports an invalid optional area and expands optional details", () => {
    const result = validateLeadForm({ ...VALID_FORM, area: "0" }, true);
    expect(result.firstField).toBe("area");
    expect(result.fieldErrors.area).toBe("请填写正确的房屋面积");
    expect(resolveOptionalDetailsExpanded(false, result.firstField)).toBe(true);
  });

  test("reports consent after valid fields", () => {
    const result = validateLeadForm({ ...VALID_FORM, consented_at: "" }, false);
    expect(result.firstField).toBe("consent");
    expect(result.summary).toBe("请先阅读并同意隐私政策");
  });

  test("accepts valid required fields and an optional positive area", () => {
    expect(validateLeadForm({ ...VALID_FORM, area: "98.5" }, true)).toEqual({
      fieldErrors: {},
      firstField: null,
      summary: null,
    });
  });

  test("clears only the changed field error", () => {
    expect(clearLeadFieldError({
      phone: "请填写正确的手机号",
      sms_code: "请填写6位短信验证码",
    }, "phone")).toEqual({ sms_code: "请填写6位短信验证码" });
  });

  test("toggles optional details without touching form values", () => {
    expect(toggleOptionalDetails(false)).toBe(true);
    expect(toggleOptionalDetails(true)).toBe(false);
  });
});
```

Append the lead contract:

```ts
test("lead form labels every input and keeps optional details collapsed", async () => {
  const [formTemplate, smsTemplate, consentTemplate, consentStyle] = await Promise.all([
    readSource("components/lead-form/index.ttml"),
    readSource("components/sms-code-input/index.ttml"),
    readSource("components/privacy-consent/index.ttml"),
    readSource("components/privacy-consent/index.ttss"),
  ]);
  for (const label of [
    "称呼",
    "联系电话",
    "短信验证码",
    "小区名称",
    "房屋面积",
    "预算范围",
    "计划开工时间",
    "装修需求",
  ]) {
    expect(`${formTemplate}\n${smsTemplate}`).toContain(`aria-label="${label}"`);
  }
  expect(formTemplate).toContain("补充装修信息（选填）");
  expect(formTemplate).toContain('tt:if="{{optionalDetailsExpanded}}"');
  expect(consentTemplate).toContain('catchtap="onOpenPolicy"');
  expect(consentStyle).toMatch(/min-height:\\s*88rpx/);
});
```

- [ ] **Step 2: 运行并确认模型与模板契约失败**

Run:

```bash
bun test src/pages/lead/form-model.test.ts src/ui-contracts.test.ts
```

Expected: 模块缺失和新表单契约失败。

- [ ] **Step 3: 实现纯表单模型**

Create `form-model.ts`:

```ts
export type LeadFormValue = {
  name: string;
  phone: string;
  sms_code: string;
  community: string;
  area: string;
  budget: string;
  start_time: string;
  demand: string;
  consented_at: string;
};

export type LeadField = keyof LeadFormValue;
export type LeadValidationField = "name" | "phone" | "sms_code" | "area" | "consent";
export type LeadFieldErrors = Partial<Record<LeadValidationField, string>>;

export type LeadValidationResult = {
  fieldErrors: LeadFieldErrors;
  firstField: LeadValidationField | null;
  summary: string | null;
};

const VALIDATION_ORDER: readonly LeadValidationField[] = [
  "name",
  "phone",
  "sms_code",
  "area",
  "consent",
];

const FIELD_TO_VALIDATION: Partial<Record<LeadField, LeadValidationField>> = {
  name: "name",
  phone: "phone",
  sms_code: "sms_code",
  area: "area",
  consented_at: "consent",
};

export function validateLeadForm(
  form: LeadFormValue,
  consented: boolean,
): LeadValidationResult {
  const fieldErrors: LeadFieldErrors = {};
  if (!form.name.trim()) fieldErrors.name = "请填写称呼";
  if (!/^1[3-9][0-9]{9}$/.test(form.phone.trim())) {
    fieldErrors.phone = "请填写正确的手机号";
  }
  if (!/^[0-9]{6}$/.test(form.sms_code.trim())) {
    fieldErrors.sms_code = "请填写6位短信验证码";
  }
  if (form.area.trim()) {
    const area = Number(form.area);
    if (!Number.isFinite(area) || area <= 0 || area > 100_000) {
      fieldErrors.area = "请填写正确的房屋面积";
    }
  }
  if (!consented || !form.consented_at) {
    fieldErrors.consent = "请先阅读并同意隐私政策";
  }
  const firstField = VALIDATION_ORDER.find((field) => fieldErrors[field]) ?? null;
  return {
    fieldErrors,
    firstField,
    summary: firstField ? fieldErrors[firstField] ?? null : null,
  };
}

export function clearLeadFieldError(
  errors: LeadFieldErrors,
  field: LeadField | "consent",
): LeadFieldErrors {
  const validationField = field === "consent" ? "consent" : FIELD_TO_VALIDATION[field];
  if (!validationField || !errors[validationField]) return errors;
  const next = { ...errors };
  delete next[validationField];
  return next;
}

export function toggleOptionalDetails(current: boolean): boolean {
  return !current;
}

export function resolveOptionalDetailsExpanded(
  current: boolean,
  firstField: LeadValidationField | null,
): boolean {
  return current || firstField === "area";
}
```

- [ ] **Step 4: 接入页面校验状态，不改变请求契约**

Move the local `LeadFormValue` and `LeadField` imports to `form-model.ts`.
Add page data:

```ts
fieldErrors: {} as LeadFieldErrors,
focusedField: "",
optionalDetailsExpanded: false,
```

On field change, clear only the corresponding error:

```ts
const fieldErrors = clearLeadFieldError(this.data.fieldErrors, field);
this.setData({
  form,
  fieldErrors,
  focusedField: "",
  phoneReady: /^1[3-9][0-9]{9}$/.test(form.phone),
  formError: "",
});
```

On consent change:

```ts
this.setData({
  consented,
  form,
  fieldErrors: clearLeadFieldError(this.data.fieldErrors, "consent"),
  focusedField: "",
  formError: "",
});
```

When SMS sending is attempted with an invalid phone, set the same field-level
state used by submit validation:

```ts
const phoneError = "请先填写正确的手机号";
this.setData({
  fieldErrors: { ...this.data.fieldErrors, phone: phoneError },
  focusedField: "phone",
  formError: phoneError,
});
```

Add:

```ts
onToggleOptionalDetails() {
  if (this.data.submitting) return;
  this.setData({
    optionalDetailsExpanded: toggleOptionalDetails(this.data.optionalDetailsExpanded),
  });
},
```

Replace the first lines of `onSubmit()`:

```ts
const validation = validateLeadForm(this.data.form, this.data.consented);
if (validation.summary) {
  this.setData({
    fieldErrors: validation.fieldErrors,
    focusedField: validation.firstField === "consent" ? "" : validation.firstField || "",
    optionalDetailsExpanded: resolveOptionalDetailsExpanded(
      this.data.optionalDetailsExpanded,
      validation.firstField,
    ),
    formError: validation.summary,
  });
  return;
}
```

Before the request, clear `fieldErrors` and `focusedField`. Preserve the current
`submitLead` payload, idempotency state and success navigation without any field
rename or new API field. When the privacy policy version changes, set both
`formError` and `fieldErrors.consent` to
`"隐私政策已更新，请重新阅读并确认后提交"`.

- [ ] **Step 5: 重组表单组件**

Add these component properties:

```ts
fieldErrors: { type: Object, value: {} },
focusedField: { type: String, value: "" },
optionalDetailsExpanded: { type: Boolean, value: false },
```

Add:

```ts
onToggleOptionalDetails() {
  if (!this.data.submitting) this.triggerEvent("toggleoptional");
},
```

Replace `components/lead-form/index.ttml` with the complete template below. It
contains exactly the existing three required and five optional fields:

```xml
<form class="lead-form ui-card" bindsubmit="onSubmit">
  <view class="required-fields">
    <view class="field-group">
      <view class="field-label">怎么称呼你 <text class="required" style="color: {{primaryColor}}">*</text></view>
      <input class="field-input ui-control {{fieldErrors.name ? 'ui-control--error' : ''}}" aria-label="称呼" data-field="name" maxlength="40" value="{{value.name}}" placeholder="例如：李先生" focus="{{focusedField === 'name'}}" disabled="{{submitting}}" bindinput="onInput" />
      <view tt:if="{{fieldErrors.name}}" class="ui-field-error" role="alert">{{fieldErrors.name}}</view>
    </view>
    <view class="field-group">
      <view class="field-label">联系电话 <text class="required" style="color: {{primaryColor}}">*</text></view>
      <input class="field-input ui-control {{fieldErrors.phone ? 'ui-control--error' : ''}}" aria-label="联系电话" data-field="phone" type="number" maxlength="11" value="{{value.phone}}" placeholder="请输入手机号" focus="{{focusedField === 'phone'}}" disabled="{{submitting}}" bindinput="onInput" />
      <view tt:if="{{fieldErrors.phone}}" class="ui-field-error" role="alert">{{fieldErrors.phone}}</view>
    </view>
    <view class="field-group">
      <view class="field-label">短信验证码 <text class="required" style="color: {{primaryColor}}">*</text></view>
      <sms-code-input value="{{value.sms_code}}" phone-ready="{{phoneReady && !submitting}}" sending="{{smsSending || submitting}}" cooldown="{{smsCooldown}}" focused="{{focusedField === 'sms_code'}}" error="{{fieldErrors.sms_code || ''}}" primary-color="{{primaryColor}}" bindchange="onSmsCodeChange" bindsend="onSendSms" />
      <view tt:if="{{fieldErrors.sms_code}}" class="ui-field-error" role="alert">{{fieldErrors.sms_code}}</view>
    </view>
  </view>

  <button class="optional-toggle ui-pressable" hover-class="ui-pressable--pressed" aria-label="{{optionalDetailsExpanded ? '收起补充装修信息' : '展开补充装修信息'}}" disabled="{{submitting}}" bindtap="onToggleOptionalDetails">
    <view class="optional-copy"><view class="optional-title">补充装修信息（选填）</view><view class="optional-description">填写小区、面积和计划，有助于装修公司提前了解需求。</view></view>
    <view class="optional-state" style="color: {{primaryColor}}">{{optionalDetailsExpanded ? '收起' : '展开'}}</view>
  </button>

  <view tt:if="{{optionalDetailsExpanded}}" class="optional-fields">
    <view class="field-group">
      <view class="field-label">小区名称</view>
      <input class="field-input ui-control" aria-label="小区名称" data-field="community" maxlength="80" value="{{value.community}}" placeholder="例如：示例花园" disabled="{{submitting}}" bindinput="onInput" />
    </view>
    <view class="field-group">
      <view class="field-label">房屋面积</view>
      <input class="field-input ui-control {{fieldErrors.area ? 'ui-control--error' : ''}}" aria-label="房屋面积" data-field="area" type="digit" maxlength="8" value="{{value.area}}" placeholder="请输入面积（㎡）" focus="{{focusedField === 'area'}}" disabled="{{submitting}}" bindinput="onInput" />
      <view tt:if="{{fieldErrors.area}}" class="ui-field-error" role="alert">{{fieldErrors.area}}</view>
    </view>
    <view class="field-group">
      <view class="field-label">预算范围</view>
      <input class="field-input ui-control" aria-label="预算范围" data-field="budget" maxlength="40" value="{{value.budget}}" placeholder="例如：20-30万" disabled="{{submitting}}" bindinput="onInput" />
    </view>
    <view class="field-group">
      <view class="field-label">计划开工时间</view>
      <input class="field-input ui-control" aria-label="计划开工时间" data-field="start_time" maxlength="40" value="{{value.start_time}}" placeholder="例如：三个月内" disabled="{{submitting}}" bindinput="onInput" />
    </view>
    <view class="field-group">
      <view class="field-label">装修需求</view>
      <textarea class="field-textarea ui-control" aria-label="装修需求" data-field="demand" maxlength="1000" value="{{value.demand}}" placeholder="可填写户型、风格、收纳等重点需求" disabled="{{submitting}}" bindinput="onInput" />
    </view>
  </view>

  <view class="consent-block"><privacy-consent checked="{{consented}}" company-name="{{companyName}}" primary-color="{{primaryColor}}" primary-text-color="{{primaryTextColor}}" error="{{fieldErrors.consent || ''}}" disabled="{{submitting}}" bindchange="onConsentChange" bindopenpolicy="onOpenPolicy" /></view>
  <button class="submit-button ui-pressable" hover-class="ui-pressable--pressed" style="background-color: {{primaryColor}}; color: {{primaryTextColor}}" form-type="submit" loading="{{submitting}}" disabled="{{submitting}}">{{submitting ? '正在提交' : '提交装修需求'}}</button>
</form>
```

- [ ] **Step 6: 扩大隐私同意触达区并隔离政策链接事件**

Add these properties to `privacy-consent`:

```ts
primaryColor: { type: String, value: "#191817" },
primaryTextColor: { type: String, value: "#FFFFFF" },
error: { type: String, value: "" },
```

Replace its template with a single full-row button:

```xml
<view>
  <button class="consent-row ui-pressable" hover-class="ui-pressable--pressed" aria-label="{{checked ? '取消同意隐私政策' : '同意隐私政策'}}" disabled="{{disabled}}" bindtap="onToggle">
    <view class="consent-check" style="{{checked ? 'border-color: ' + primaryColor + '; background-color: ' + primaryColor + '; color: ' + primaryTextColor : ''}}">{{checked ? '✓' : ''}}</view>
    <view class="consent-copy">我已阅读并同意由 {{companyName}} 按照<text class="policy-link" style="color: {{primaryColor}}" catchtap="onOpenPolicy">《隐私政策与用户协议》</text>处理本次咨询信息。</view>
  </button>
  <view tt:if="{{error}}" class="ui-field-error" role="alert">{{error}}</view>
</view>
```

Replace its TTSS with:

```css
@import "../../styles/tokens.ttss";

.consent-row { box-sizing: border-box; display: flex; width: 100%; min-height: 88rpx; align-items: flex-start; gap: 18rpx; margin: 0; padding: 12rpx 0; background: transparent; color: #191817; text-align: left; line-height: normal; }
.consent-check { box-sizing: border-box; display: flex; width: 40rpx; min-width: 40rpx; height: 40rpx; min-height: 40rpx; margin-top: 3rpx; align-items: center; justify-content: center; border: 2rpx solid #9b948e; border-radius: 8rpx; background: #fff; color: #fff; font-size: 26rpx; line-height: 36rpx; }
.consent-row[disabled] { opacity: .55; }
.consent-copy { min-width: 0; flex: 1; color: #625f5b; font-size: 23rpx; line-height: 1.7; }
.policy-link { text-decoration: underline; }
```

The visual check remains compact inside the larger touch target.

- [ ] **Step 7: 完成短信输入和页面样式**

Change every lead page and form component default primary color from
`#C45A32` to `#191817`, with `#FFFFFF` as its default foreground. Add
`focused`, `error` and `primaryColor` properties to `sms-code-input`, then use:

```xml
<view class="sms-row">
  <input class="sms-input ui-control {{error ? 'ui-control--error' : ''}}" aria-label="短信验证码" type="number" maxlength="6" value="{{value}}" placeholder="请输入6位验证码" focus="{{focused}}" disabled="{{sending}}" bindinput="onInput" />
  <button class="sms-button ui-pressable" hover-class="ui-pressable--pressed" style="{{phoneReady && !sending && cooldown <= 0 ? 'border-color: ' + primaryColor + '; color: ' + primaryColor : ''}}" disabled="{{!phoneReady || sending || cooldown > 0}}" loading="{{sending}}" bindtap="onSend">
    {{cooldown > 0 ? cooldown + '秒后重发' : (sending ? '发送中' : '获取验证码')}}
  </button>
</view>
```

Replace the lead page kicker with:

```xml
<view class="page-header">
  <view class="ui-page-title">免费装修咨询</view>
  <view class="ui-page-description">留下联系方式后，由 {{companyName}} 的服务人员与你沟通；浏览公开内容无需提交信息。</view>
</view>
```

The complete page content passes the new state explicitly:

```xml
<view tt:else class="page-content lead-page">
  <view class="page-header">
    <view class="ui-page-title">免费装修咨询</view>
    <view class="ui-page-description">留下联系方式后，由 {{companyName}} 的服务人员与你沟通；浏览公开内容无需提交信息。</view>
  </view>
  <view class="form-block">
    <lead-form value="{{form}}" company-name="{{companyName}}" primary-color="{{primaryColor}}" primary-text-color="{{primaryTextColor}}" phone-ready="{{phoneReady}}" sms-sending="{{smsSending}}" sms-cooldown="{{smsCooldown}}" consented="{{consented}}" submitting="{{submitting}}" field-errors="{{fieldErrors}}" focused-field="{{focusedField}}" optional-details-expanded="{{optionalDetailsExpanded}}" bindfieldchange="onFieldChange" bindsendsms="onSendSms" bindconsentchange="onConsentChange" bindopenpolicy="onOpenPolicy" bindtoggleoptional="onToggleOptionalDetails" bindsubmit="onSubmit" />
  </view>
  <view tt:if="{{formError}}" class="form-error ui-error-surface" role="alert">{{formError}}</view>
  <view class="security-note">验证码仅用于确认本次联系方式。平台不会在客户端读取抖音账号绑定手机号。</view>
  <button tt:if="{{servicePhone}}" class="phone-action ui-pressable" hover-class="ui-pressable--pressed" style="color: {{primaryColor}}" bindtap="onPhoneCall">直接联系装修公司：{{servicePhone}}</button>
</view>
```

Import `../../styles/tokens.ttss` in `lead-form`, `sms-code-input` and
`privacy-consent` TTSS. Replace their remaining local styles with:

```css
/* lead-form/index.ttss */
@import "../../styles/tokens.ttss";

.lead-form { padding: 30rpx; }
.field-group { margin-top: 28rpx; }
.field-group:first-child { margin-top: 0; }
.field-label { margin-bottom: 12rpx; color: #625f5b; font-size: 24rpx; font-weight: 650; }
.field-input, .field-textarea { width: 100%; font-size: 27rpx; }
.field-input { height: 92rpx; padding: 0 22rpx; }
.field-textarea { min-height: 184rpx; padding: 20rpx 22rpx; line-height: 1.6; }
.optional-toggle { box-sizing: border-box; display: flex; width: 100%; min-height: 104rpx; align-items: center; justify-content: space-between; gap: 20rpx; margin: 30rpx 0 0; padding: 20rpx; border-radius: 12rpx; background: #eceae6; color: #191817; text-align: left; line-height: normal; }
.optional-copy { min-width: 0; flex: 1; }
.optional-title { font-size: 26rpx; font-weight: 650; line-height: 1.4; }
.optional-description { margin-top: 6rpx; color: #625f5b; font-size: 22rpx; line-height: 1.5; }
.optional-state { flex: none; font-size: 24rpx; }
.optional-fields { padding-top: 2rpx; }
.consent-block { margin-top: 30rpx; }
.submit-button { box-sizing: border-box; width: 100%; min-height: 96rpx; margin-top: 28rpx; border-radius: 12rpx; font-size: 29rpx; font-weight: 650; line-height: 96rpx; }
.submit-button[disabled] { opacity: .6; }
```

```css
/* sms-code-input/index.ttss */
@import "../../styles/tokens.ttss";

.sms-row { display: flex; gap: 14rpx; }
.sms-input { min-width: 0; height: 92rpx; flex: 1; padding: 0 22rpx; font-size: 27rpx; }
.sms-button { box-sizing: border-box; width: 226rpx; height: 92rpx; margin: 0; padding: 0 10rpx; border: 1rpx solid #191817; border-radius: 12rpx; background: #fff; color: #191817; font-size: 24rpx; line-height: 90rpx; }
.sms-button[disabled] { border-color: #dddad5; background: #eceae6; color: #706c67; opacity: 1; }
```

```css
/* pages/lead/index.ttss */
.lead-page { padding-bottom: 64rpx; }
.page-header { padding-bottom: 22rpx; }
.form-block { margin-top: 18rpx; }
.form-error { margin-top: 20rpx; padding: 20rpx 22rpx; font-size: 24rpx; line-height: 1.6; }
.security-note { margin-top: 26rpx; color: #706c67; font-size: 22rpx; line-height: 1.65; text-align: center; }
.phone-action { min-height: 88rpx; margin-top: 18rpx; padding: 0 16rpx; background: transparent; font-size: 25rpx; line-height: 88rpx; }
```

- [ ] **Step 8: 验证表单行为和原有安全契约**

Run:

```bash
bun test src/pages/lead/form-model.test.ts src/api/leads.test.ts \
  src/utils/idempotency.test.ts src/ui-contracts.test.ts
bun run typecheck
git diff --check
```

Expected:

- 新模型与 UI 契约通过。
- API 严格字段和幂等测试继续通过。
- 0 failed、类型检查成功。

- [ ] **Step 9: 提交咨询页**

```bash
git add apps/douyin-mini/src/ui-contracts.test.ts \
  apps/douyin-mini/src/pages/lead \
  apps/douyin-mini/src/components/lead-form \
  apps/douyin-mini/src/components/sms-code-input \
  apps/douyin-mini/src/components/privacy-consent
git commit -m "feat(douyin-mini): 优化咨询表单节奏"
```

## Task 7: 统一加载、空、错误和分页状态

**Files:**

- Modify: `apps/douyin-mini/src/ui-contracts.test.ts`
- Modify: `apps/douyin-mini/src/components/empty-state/index.ttml`
- Modify: `apps/douyin-mini/src/components/empty-state/index.ttss`
- Modify: `apps/douyin-mini/src/components/error-state/index.ttml`
- Modify: `apps/douyin-mini/src/components/error-state/index.ttss`
- Modify: `apps/douyin-mini/src/components/page-skeleton/index.ttss`
- Modify: `apps/douyin-mini/src/components/pagination-loader/index.ttml`
- Modify: `apps/douyin-mini/src/components/pagination-loader/index.ttss`

- [ ] **Step 1: 追加共享状态失败契约**

```ts
test("shared state actions use semantic styles and native press feedback", async () => {
  const files = await Promise.all([
    readSource("components/empty-state/index.ttml"),
    readSource("components/error-state/index.ttml"),
    readSource("components/pagination-loader/index.ttml"),
    readSource("components/empty-state/index.ttss"),
    readSource("components/error-state/index.ttss"),
    readSource("components/pagination-loader/index.ttss"),
  ]);
  expect(files.slice(0, 3).join("\n").match(/hover-class="ui-pressable--pressed"/g))
    .toHaveLength(4);
  for (const style of files.slice(3)) {
    expect(style).toContain('@import "../../styles/tokens.ttss";');
  }
});

test("four-page target contains no fixed terracotta brand palette", async () => {
  const targetFiles = [
    "pages/home/index.ts",
    "pages/home/index.ttml",
    "pages/home/index.ttss",
    "pages/cases/index.ts",
    "pages/cases/index.ttml",
    "pages/cases/index.ttss",
    "pages/sites/index.ts",
    "pages/sites/index.ttml",
    "pages/sites/index.ttss",
    "pages/lead/index.ts",
    "pages/lead/index.ttml",
    "pages/lead/index.ttss",
    "components/tenant-brand/index.ttss",
    "components/hero-banner/index.ts",
    "components/hero-banner/index.ttss",
    "components/case-card/index.ttss",
    "components/site-card/index.ttss",
    "components/lead-form/index.ts",
    "components/lead-form/index.ttss",
    "components/sms-code-input/index.ttss",
    "components/privacy-consent/index.ttss",
    "components/empty-state/index.ttss",
    "components/error-state/index.ttss",
    "components/pagination-loader/index.ttss",
  ];
  const source = (await Promise.all(targetFiles.map(readSource))).join("\n").toLowerCase();
  for (const bannedColor of [
    "#c45a32",
    "#a84324",
    "#9a4124",
    "#8b371f",
    "#91391f",
    "#983d22",
    "#b84e2d",
    "#8d3d22",
    "#7f351f",
    "#f4e7e0",
    "#f5e7e1",
    "#fff7f3",
  ]) {
    expect(source).not.toContain(bannedColor);
  }
});
```

- [ ] **Step 2: 运行并确认旧状态组件失败**

Run: `bun test src/ui-contracts.test.ts`

Expected: 缺少 token import 和按压反馈导致失败。

- [ ] **Step 3: 应用共享状态视觉**

Add `class="ui-pressable"` plus
`hover-class="ui-pressable--pressed"` to the empty-state action and error-state
action. Add the same two attributes to both pagination buttons.

Use these semantic style rules:

```css
/* empty-state/index.ttss */
@import "../../styles/tokens.ttss";

.empty-state { box-sizing: border-box; display: flex; min-height: 360rpx; flex-direction: column; align-items: center; justify-content: center; padding: 48rpx 32rpx; color: #191817; text-align: center; }
.empty-mark { width: 72rpx; height: 54rpx; border: 3rpx solid #9b948e; border-top: 0; border-radius: 0 0 12rpx 12rpx; }
.empty-title { margin-top: 28rpx; font-size: 30rpx; font-weight: 650; line-height: 1.4; }
.empty-description { max-width: 540rpx; margin-top: 12rpx; color: #625f5b; font-size: 25rpx; line-height: 1.65; }
.empty-action { min-width: 176rpx; min-height: 88rpx; margin-top: 28rpx; border-radius: 12rpx; background: #191817; color: #fff; font-size: 27rpx; line-height: 88rpx; }
```

```css
/* error-state/index.ttss */
@import "../../styles/tokens.ttss";

.error-state { box-sizing: border-box; display: flex; min-height: 360rpx; flex-direction: column; align-items: center; justify-content: center; padding: 48rpx 32rpx; color: #191817; text-align: center; }
.error-mark { display: flex; width: 68rpx; height: 68rpx; align-items: center; justify-content: center; border-radius: 34rpx; background: #fdecea; color: #b42318; font-size: 36rpx; font-weight: 650; }
.error-title { margin-top: 24rpx; font-size: 30rpx; font-weight: 650; line-height: 1.4; }
.error-description { max-width: 540rpx; margin-top: 12rpx; color: #625f5b; font-size: 25rpx; line-height: 1.65; }
.error-action { min-width: 190rpx; min-height: 88rpx; margin-top: 28rpx; border-radius: 12rpx; background: #191817; color: #fff; font-size: 27rpx; line-height: 88rpx; }
.error-action[disabled] { opacity: .6; }
```

```css
/* pagination-loader/index.ttss */
@import "../../styles/tokens.ttss";

.pagination { display: flex; min-height: 112rpx; align-items: center; justify-content: center; padding: 12rpx 0; }
.pagination-copy { color: #625f5b; font-size: 24rpx; line-height: 1.5; }
.pagination-action { min-height: 88rpx; margin: 0; padding: 0 28rpx; border-radius: 12rpx; background: transparent; color: #191817; font-size: 26rpx; line-height: 88rpx; }
```

Change page skeleton surfaces to `#ECEAE6` and keep its existing
`prefers-reduced-motion` rule unchanged.

- [ ] **Step 4: 验证四页目标范围不再出现固定陶土品牌色**

Run:

```bash
rg -n -i '#(c45a32|a84324|9a4124|8b371f|91391f|983d22|b84e2d|8d3d22|7f351f|f4e7e0|f5e7e1|fff7f3)' \
  src/app.json src/app.ttss src/pages/home src/pages/cases src/pages/sites \
  src/pages/lead src/components/theme.ts src/components/tenant-brand \
  src/components/hero-banner src/components/trust-metrics \
  src/components/case-card src/components/site-card \
  src/components/lead-form src/components/sms-code-input \
  src/components/privacy-consent src/components/empty-state \
  src/components/error-state src/components/page-skeleton \
  src/components/pagination-loader src/assets/tabbar
```

Expected: no output.

Run:

```bash
bun test src/ui-contracts.test.ts
bun run check
git diff --check
```

Expected: 所有测试通过、0 failed、类型检查成功。

- [ ] **Step 5: 提交共享状态**

```bash
git add apps/douyin-mini/src/ui-contracts.test.ts \
  apps/douyin-mini/src/components/empty-state \
  apps/douyin-mini/src/components/error-state \
  apps/douyin-mini/src/components/page-skeleton \
  apps/douyin-mini/src/components/pagination-loader
git commit -m "style(douyin-mini): 统一页面状态反馈"
```

## Task 8: 完整自动化与源码契约验证

**Files:**

- Read only: `apps/douyin-mini/src`
- Read only: Git diff and commit range

- [ ] **Step 1: 运行完整小程序检查**

Run:

```bash
cd apps/douyin-mini
bun run check
```

Expected:

- 测试总数大于基线 66。
- 0 failed。
- `tsc -p tsconfig.json --noEmit` 成功。

- [ ] **Step 2: 运行设计契约扫描**

Run:

```bash
rg -n 'section-kicker|page-kicker|lead-kicker|border-left:\\s*6rpx' \
  src/pages/home src/pages/cases src/pages/sites src/pages/lead
rg --files-without-match 'lazy-load="true"' \
  src/components/case-card/index.ttml src/components/site-card/index.ttml
rg -n 'aria-label=' \
  src/components/lead-form/index.ttml src/components/sms-code-input/index.ttml \
  src/components/privacy-consent/index.ttml
```

Expected:

- 第一条无输出。
- 第二条无输出。
- 第三条列出 8 个输入名称和隐私同意名称。

- [ ] **Step 3: 检查提交范围与用户改动**

Run:

```bash
git diff --check
git status --short
git log --oneline b85a5d23..HEAD
```

Expected:

- 无空白错误。
- 用户原有脏文件仍未暂存、未提交。
- 提交范围只包含计划中的小程序 UI、测试和后续复审文档。

## Task 9: 在抖音 IDE 完成四页视觉与交互验收

**Files:**

- Runtime only: 抖音开发者工具当前项目
- Do not click: 上传、提审、发布

- [ ] **Step 1: 刷新当前项目并确认路径**

在抖音开发者工具中确认项目根目录为：

```text
/Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp/apps/douyin-mini
```

只点击编译或刷新，不点击上传。

- [ ] **Step 2: 验收首页**

在 393px 模拟器检查：

- 顶部：租户 Logo、名称、Banner、唯一主 CTA。
- 中段：一张精选案例、一张在建工地、两类卡片语言一致。
- 底部：服务流程、本地服务与公司介绍、隐私链接。
- 页面不再出现底部重复咨询卡。
- 当前开发租户主色在 Hero、链接、流程编号和卡片重点状态中一致。
- 另一个合法主色的前景选择由 `theme.test.ts` 验证，主色属性传递由
  `ui-contracts.test.ts` 验证；不修改服务端租户配置。

- [ ] **Step 3: 验收案例**

- 页头紧凑，首张案例上移。
- 风格和户型筛选可切换。
- 多个筛选生效后“清除筛选”一次清空并重新加载第一页。
- 有筛选的空结果显示清除动作。
- 分页加载、结束、错误重试状态仍可识别。

- [ ] **Step 4: 验收工地**

- “公开范围”提示无左侧色条。
- 卡片显示阶段、区域和最近更新时间。
- 不显示姓名、电话、门牌号或精确地址。
- 工地卡与案例卡共享圆角、边界和按压反馈。

- [ ] **Step 5: 验收免费咨询**

- 默认只显示姓名、手机号、验证码、选填区入口、隐私同意和提交。
- 展开选填区后显示且只显示五个现有选填字段。
- 填入选填值后折叠再展开，值仍保留。
- 空表提交时显示字段级错误并聚焦称呼。
- 非法手机号、非 6 位验证码、非法面积分别显示对应字段错误。
- 未同意隐私时显示同意错误。
- 点击政策链接只打开政策页，不反向切换同意状态。
- 验证码倒计时、提交中、失败重试和幂等行为保持原样。

- [ ] **Step 6: 记录视觉证据**

分别保存四页的顶部、关键中段和底部截图，截图不得包含完整 AppID、
手机号、验证码、JWT 或其他秘密。证据文件只放入既有
`docs/operations/evidence/` 目录，文件名以
`2026-07-23-douyin-four-page-` 开头。

## Task 10: 复审、手机预览与最终交付

**Files:**

- Create: `docs/superpowers/specs/2026-07-23-douyin-miniapp-four-page-ui-reaudit.md`
- Optional evidence: `docs/operations/evidence/2026-07-23-douyin-four-page-*.png`

- [ ] **Step 1: 按原五维模型重新审计**

逐项复核：

1. Accessibility
2. Performance
3. Responsive Design
4. Theming
5. Anti-Patterns

复审文档必须逐条映射原 5 个 P1、7 个 P2、2 个 P3，标记为
“已解决”“保留并说明原因”或“未解决”；不得只写总分。目标为 P1 清零、
总分不低于 17/20。

- [ ] **Step 2: 记录自动化与 IDE 证据**

文档写入：

- 完整 `bun run check` 的测试总数和 0 failed 结果。
- 四页 IDE 截图相对路径。
- 主色切换、清除筛选、折叠保持、字段错误和隐私链接独立点击的观察结果。
- 官方 TTSS、button、image 文档链接。
- “未执行上传、提审、发布”的边界声明。

- [ ] **Step 3: 提交复审文档与脱敏截图**

先验证暂存范围：

```bash
git add docs/superpowers/specs/2026-07-23-douyin-miniapp-four-page-ui-reaudit.md
git add docs/operations/evidence/2026-07-23-douyin-four-page-*.png
git diff --cached --check
git diff --cached --name-status
```

确认没有带入既有证据文档和配置文件后提交：

```bash
git commit -m "docs(douyin-mini): 记录四页视觉复审"
```

- [ ] **Step 4: 邀请用户执行手机预览**

Codex 只停留在开发工具可预览状态，不点击上传。请用户通过开发者工具允许的
手机预览入口扫码，并确认：

- 四个 Tab 均可进入。
- 租户主色与模拟器一致。
- 案例和工地滚动、图片加载正常。
- 咨询选填折叠、隐私同意和键盘交互正常。

- [ ] **Step 5: 完成最终审计**

Run:

```bash
cd apps/douyin-mini
bun run check
cd ../..
git diff --check
git status --short
git log --oneline b85a5d23..HEAD
```

Completion requires:

- 正式设计规格中的四页要求全部有当前源码、测试、IDE 截图或手机结果证明。
- P1 问题清零。
- 手机预览由用户确认。
- 用户原有脏文件完整保留。
- 没有上传、提审、发布、生产或数据库操作。
