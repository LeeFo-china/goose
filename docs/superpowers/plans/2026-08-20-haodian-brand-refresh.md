# 好店智装云品牌迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在一个 PR 中将用户可见平台品牌迁移为“好店智装云”，完成分尺寸 Logo、Admin 租户与超管纯色化、Web/SEO 和 API 运行时兜底更新，同时保持租户私有品牌及 H5/抖音小程序渐变不变。

**Architecture:** 静态 Admin/Web 品牌和 API 运行时有效品牌继续沿用现有应用边界，不新增共享框架或数据库结构。Admin 通过现有语义 Token 切换为深蓝主色、橙色点缀和纯色工作台；平台已发布品牌在部署后继续通过现有 `/platform/branding` 管理与发布链路更新。

**Tech Stack:** Bun、TypeScript、Next.js 15、React 19、Tailwind CSS、Fastify、Supabase 品牌资料、Bun Test、Playwright、PNG 品牌资产

---

## 文件结构与职责

### 新建文件

- `apps/web/app/icon.png`：官网 favicon/App Router 小尺寸品牌图标。
- `apps/admin/components/layout/admin-brand-contract.test.ts`：Admin 新品牌、纯色样式和 H5/抖音渐变边界契约。

### 品牌资产

- `apps/admin/public/logo.png`：Admin 大尺寸完整品牌锁定稿。
- `apps/admin/app/icon.png`：Admin 小尺寸 `HD + 鹅` 图标。
- `apps/web/public/logo.png`：官网导航使用的 `HD + 鹅` 图标。
- `apps/api/src/services/branding-default-logo.ts`：受控 256 × 256 图标 Base64、来源和哈希。

### Admin

- `apps/admin/app/globals.css`：默认蓝橙品牌 Token 和纯色登录/工作台背景。
- `apps/admin/components/layout/admin-shell-preferences-store.ts`：默认主题 Token 与废弃渐变 Token 清理。
- `apps/admin/app/layout.tsx`：Admin Metadata。
- `apps/admin/app/login/page.tsx`：登录品牌文案、大图和纯色视觉。
- `apps/admin/components/login-form.tsx`：语义色登录表单和纯色主按钮。
- `apps/admin/components/layout/admin-shell.tsx`：租户/平台共用工作台品牌。
- `apps/admin/components/layout/platform-mode-access-denied.tsx`：平台拒绝页语义品牌色。
- `apps/admin/app/(site)/partners/page.tsx`：遗留公开合伙人页品牌。
- `apps/admin/components/site-content/site-content-editor.test.ts`、`apps/admin/e2e/admin-smoke.spec.ts`：品牌断言。

### Web

- `apps/web/app/globals.css`：官网蓝橙语义 Token，保留明暗主题和对比度。
- `apps/web/app/layout.tsx`、`apps/web/app/opengraph-image.tsx`：Metadata、分享图和品牌色。
- `apps/web/app/page.tsx`、`apps/web/app/(content)/*`、`apps/web/app/(marketing)/*`：用户可见品牌文案。
- `apps/web/components/content/content-structured-data.tsx`：JSON-LD Organization 名称。
- `apps/web/components/official-site/*`：页头、页脚、移动导航和营销内容品牌。
- `apps/web/tests/content-rendering.test.ts`、`apps/web/tests/preview-revalidate.test.ts`、`apps/web/tests/design-system-contract.test.ts`、`apps/web/tests/partner-site.test.ts`：SEO、结构化数据、色彩和资产契约。

### API 与当前规范

- `apps/api/src/services/branding-contracts.ts`、`branding-contracts.test.ts`：平台兜底名称。
- `apps/api/src/services/effective-branding-platform.test.ts`：已发布平台品牌和受控 PNG 快照。
- `apps/api/src/gateways/douyin-open-platform/template-client.test.ts`、`apps/api/src/services/platform-douyin-template-promotion.test.ts`：目标第三方应用名称样例。
- `PRODUCT.md`、`DESIGN.md`、`docs/assets/official-site-assets.md`：当前品牌设计规范。

## Task 1：准备并验证分尺寸品牌资产

**Files:**
- Modify: `apps/admin/public/logo.png`
- Modify: `apps/admin/app/icon.png`
- Modify: `apps/web/public/logo.png`
- Create: `apps/web/app/icon.png`

- [ ] **Step 1：检查确认源文件不变**

Run:

```bash
sips -g pixelWidth -g pixelHeight -g hasAlpha -g format \
  "/Users/leefo/Downloads/ChatGPT Image 2026年8月5日 15_27_39.png"
shasum -a 256 "/Users/leefo/Downloads/ChatGPT Image 2026年8月5日 15_27_39.png"
```

Expected: `1254 × 1254`、PNG、无 Alpha，SHA-256 为
`df390951cc1111dc215c266a4a23ebb6d96754bd9a00f211c2046532c6990b4d`。

- [ ] **Step 2：生成小尺寸品牌图标**

使用 `imagegen` 编辑确认源图，只保留原图中的 `HD + 白鹅 + 橙色鹅嘴` 图形，保持形状、
颜色和比例，不新增文字、不重新设计，输出方形白底 PNG。生成后视觉检查：四周留白均衡，
16/32/48px 缩略图仍能识别 HD 和鹅，不包含“好店智装云”或“HAODIAN DATA”小字。

- [ ] **Step 3：写入四个仓库资产位置**

将确认源原样写入 `apps/admin/public/logo.png`。将 Step 2 的图标写入
`apps/admin/app/icon.png`、`apps/web/public/logo.png` 和 `apps/web/app/icon.png`。

- [ ] **Step 4：验证资产格式和大小**

Run:

```bash
sips -g pixelWidth -g pixelHeight -g hasAlpha -g format \
  apps/admin/public/logo.png apps/admin/app/icon.png \
  apps/web/public/logo.png apps/web/app/icon.png
stat -f '%N %z bytes' apps/admin/public/logo.png apps/admin/app/icon.png \
  apps/web/public/logo.png apps/web/app/icon.png
```

Expected: 全部为方形 PNG；完整 Logo 保持 1254 × 1254；图标至少 256 × 256；单文件均不
超过 2 MB。

- [ ] **Step 5：提交资产**

```bash
git add apps/admin/public/logo.png apps/admin/app/icon.png \
  apps/web/public/logo.png apps/web/app/icon.png
git commit -m "feat(brand): 更新好店智装云品牌资产"
```

## Task 2：用契约测试驱动 Admin 品牌和纯色化

**Files:**
- Create: `apps/admin/components/layout/admin-brand-contract.test.ts`
- Modify: `apps/admin/app/globals.css`
- Modify: `apps/admin/components/layout/admin-shell-preferences-store.ts`
- Modify: `apps/admin/app/layout.tsx`
- Modify: `apps/admin/app/login/page.tsx`
- Modify: `apps/admin/components/login-form.tsx`
- Modify: `apps/admin/components/layout/admin-shell.tsx`
- Modify: `apps/admin/components/layout/platform-mode-access-denied.tsx`
- Modify: `apps/admin/app/(site)/partners/page.tsx`
- Modify: `apps/admin/components/site-content/site-content-editor.test.ts`
- Modify: `apps/admin/e2e/admin-smoke.spec.ts`

- [ ] **Step 1：写失败的 Admin 品牌契约**

新增测试固定最终品牌、去渐变和跨端边界。最终契约不是入口文件白名单，而是以下递归与 Git
边界检查：

```ts
const adminRenderSources = recursivelyRead("apps/admin", {
  extensions: [".css", ".tsx"],
  excludeDirectories: [
    ".next", "coverage", "e2e", "node_modules",
    "playwright-report", "test-results", "tests",
  ],
  excludeFiles: [/\.(?:test|spec)\.tsx$/],
});
const gradientViolations = adminRenderSources
  .filter(({ source }) =>
    /(?:linear|radial|conic)-gradient|bg-gradient-/.test(source)
  )
  .map(({ path }) => path);
expect(gradientViolations).toEqual([]);

const originPaths = gitTreePaths("origin/main");
const trackedPaths = gitTrackedPaths();
const untrackedPaths = gitUntrackedPaths();
const protectedPaths = union(
  originPaths,
  trackedPaths,
  untrackedPaths,
).filter(isH5OrDouyinPath);
// isH5OrDouyinPath 精确匹配 apps/h5/、apps/douyin-mini/，以及 apps/admin/
// 下由路径分隔符或 . _ - 界定的 h5/douyin 名称，避免普通子串误命中。
const changedPaths = unique([
  ...gitDiffNames("origin/main", protectedPaths),
  ...untrackedPaths.filter(isH5OrDouyinPath),
]);
expect(changedPaths).toEqual([]); // 覆盖新增、修改、删除和改名两端路径

expect(read("apps/h5/src/styles.css")).toContain("linear-gradient");
expect(read("apps/douyin-mini/src/components/hero-banner/index.ttss"))
  .toContain("linear-gradient");
```

品牌入口同时断言租户与平台壳统一使用“好店智装云”，并由独立 E2E 覆盖租户工作台。Web
生产源码的递归品牌与无渐变契约在 Task 3 的 Web 测试中负责，不纳入 Admin 扫描。

- [ ] **Step 2：运行测试确认失败**

Run:

```bash
bun test apps/admin/components/layout/admin-brand-contract.test.ts
```

Expected: FAIL，旧名称或 Admin 渐变仍存在。

- [ ] **Step 3：更新 Admin 默认 Token 和纯色背景**

在 `:root` 和 `themeTokens.goose` 使用以下默认角色；其他可选主题保留自身实体色，但删除
所有仅服务于渐变的 `--workbench-glow*`、`--workbench-bg-start/mid/end` 项：

```css
--background: 210 33% 98%;
--foreground: 204 70% 16%;
--primary: 203 88% 29%;
--primary-foreground: 0 0% 100%;
--secondary: 205 42% 93%;
--secondary-foreground: 204 70% 20%;
--muted: 207 33% 95%;
--accent: 20 100% 58%;
--accent-foreground: 204 70% 16%;
--border: 207 24% 86%;
--input: 207 24% 82%;
--ring: 203 88% 29%;
--goose-yellow: #095488;
--goose-yellow-soft: #d7e7f1;
--goose-cream: #f8fafc;
--goose-cream-deep: #edf3f7;
--goose-ink: #0b2f46;
--goose-brown: #35556a;
--goose-surface-warm: #f4f8fb;
```

`--accent-foreground` 使用深蓝 `204 70% 16%`，这是实施时为满足 WCAG AA 对比度而对最初
白色建议的替代；与橙色 Accent 的实测对比度为 5.068:1。`--primary-foreground` 仍保持白色。

`--goose-yellow`、`--goose-yellow-soft`、`--goose-cream`、`--goose-cream-deep`、
`--goose-ink`、`--goose-brown`、`--goose-surface-warm`、`themeTokens.goose` 和
`goose-workbench-bg` 全部是为现有主题存储、CSS 选择器与组件引用保留的兼容层标识，禁止
新代码依赖其字面语义；新代码优先使用语义 Token，本次不重命名这些标识。规范前景以
`204 70% 16%`（约 `#0c2f45`）为准，`--goose-ink: #0b2f46` 仅是兼容的 Shell 深蓝别名。

纯色背景实现：

```css
.console-grid,
.goose-workbench-bg {
  background: hsl(var(--background));
}
```

- [ ] **Step 4：更新 Admin 名称和品牌表面**

将用户可见“鹅班长”改为“好店智装云”，将“鹅班长工作台”改为“好店智装云工作台”，
编辑部改为“好店智装云编辑部”。登录页使用完整 `logo.png`，侧栏和移动顶部使用
`app/icon.png`；登录表单和拒绝页使用 `bg-primary text-primary-foreground`、
`bg-muted`、`text-foreground`、`text-muted-foreground` 等语义类，登录主按钮为纯色：

```tsx
<Button
  className="h-11 w-full rounded-md bg-primary font-bold text-primary-foreground hover:bg-primary/90"
  type="submit"
  disabled={loggingIn}
>
```

删除登录页黄色文字阴影和暖黄色硬编码，不增加发光圆斑或替代渐变。

- [ ] **Step 5：运行 Admin 契约和相关测试**

Run:

```bash
bun test apps/admin/components/layout/admin-brand-contract.test.ts \
  apps/admin/components/site-content/site-content-editor.test.ts
bun run admin:check
```

Expected: 全部 PASS，Admin 文件大小检查和类型检查通过。

- [ ] **Step 6：提交 Admin 改造**

```bash
git add apps/admin
git commit -m "feat(admin): 迁移好店智装云纯色品牌界面"
```

## Task 3：用 Web 契约驱动名称、SEO、分享图和蓝橙 Token

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/opengraph-image.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/(content)/articles/page.tsx`
- Modify: `apps/web/app/(content)/cases/page.tsx`
- Modify: `apps/web/app/(marketing)/about/page.tsx`
- Modify: `apps/web/app/(marketing)/partners/page.tsx`
- Modify: `apps/web/app/(marketing)/products/page.tsx`
- Modify: `apps/web/components/content/content-structured-data.tsx`
- Modify: `apps/web/components/official-site/about-sections.tsx`
- Modify: `apps/web/components/official-site/mobile-navigation.tsx`
- Modify: `apps/web/components/official-site/partner-hero.tsx`
- Modify: `apps/web/components/official-site/site-footer.tsx`
- Modify: `apps/web/components/official-site/site-header.tsx`
- Modify: `apps/web/tests/content-rendering.test.ts`
- Modify: `apps/web/tests/preview-revalidate.test.ts`
- Modify: `apps/web/tests/design-system-contract.test.ts`
- Modify: `apps/web/tests/partner-site.test.ts`

- [ ] **Step 1：先更新 Web 品牌契约期望**

将结构化数据和预览作者期望改为“好店智装云”，并在 `partner-site.test.ts` 增加：

```ts
test("publishes the complete Haodian brand asset set", () => {
  expect(existsSync(new URL("public/logo.png", webRoot))).toBe(true);
  expect(existsSync(new URL("app/icon.png", webRoot))).toBe(true);
  const shell = [
    readWebFile("app/layout.tsx"),
    readWebFile("components/official-site/site-header.tsx"),
    readWebFile("components/official-site/site-footer.tsx"),
  ].join("\n");
  expect(shell).toContain("好店智装云");
  expect(shell).not.toContain("鹅班长");
});
```

在 `design-system-contract.test.ts` 中要求根主题包含品牌蓝 `0.43 0.11 242`，且继续禁止
渐变文字。

- [ ] **Step 2：运行 Web 测试确认失败**

Run:

```bash
bun --cwd apps/web test
```

Expected: FAIL，旧品牌名称或品牌 Token 不满足新断言。

- [ ] **Step 3：更新 Web 文案、Metadata 和结构化数据**

将列出的 Web 文件中用户可见“鹅班长”改为“好店智装云”；保留 URL、Canonical、ICP、
CTA 和业务字段不变。页头以 32px 图标配邻近文字“好店智装云”，避免完整锁定稿缩小。

- [ ] **Step 4：更新 Web 明暗主题 Token 和分享图**

根主题以品牌蓝为主操作，橙色为点缀；暗色主题使用更亮的蓝色保持对比。至少固定：

```css
:root {
  --primary: 0.43 0.11 242;
  --primary-foreground: 0.99 0 0;
  --accent: 0.72 0.18 45;
  --accent-foreground: 0.18 0.02 45;
  --ring: 0.43 0.11 242;
}

.dark {
  --primary: 0.76 0.11 235;
  --primary-foreground: 0.16 0.03 242;
  --accent: 0.76 0.16 45;
  --accent-foreground: 0.17 0.02 45;
  --ring: 0.76 0.11 235;
}
```

`opengraph-image.tsx` 使用实体 `#095488` 深蓝主面、白色标题和 `#ff6b2b` 橙色短强调条，
品牌名改为“好店智装云”，不使用渐变。

- [ ] **Step 5：运行 Web 测试和检查**

Run:

```bash
bun --cwd apps/web test
bun run web:check
```

Expected: 全部 PASS；若对比度测试失败，只调整语义 Token 到达到 4.5:1，不降低测试门槛。

- [ ] **Step 6：提交 Web 改造**

```bash
git add apps/web
git commit -m "feat(web): 更新好店智装云官网品牌"
```

## Task 4：用 API 测试驱动运行时平台兜底品牌

**Files:**
- Modify: `apps/api/src/services/branding-contracts.test.ts`
- Modify: `apps/api/src/services/branding-contracts.ts`
- Modify: `apps/api/src/services/effective-branding-platform.test.ts`
- Modify: `apps/api/src/services/branding-default-logo.ts`
- Modify: `apps/api/src/gateways/douyin-open-platform/template-client.test.ts`
- Modify: `apps/api/src/services/platform-douyin-template-promotion.test.ts`

- [ ] **Step 1：先修改 API 期望**

将平台兜底名称和平台已发布资料样例改为“好店智装云”；将第三方应用名称样例改为
“好店智装云装企管家”。`effective-branding-platform.test.ts` 保留对受控 PNG 的严格验证：

```ts
expect(first).toMatchObject({
  display_name: "好店智装云",
  support_text: "好店智装云",
  version: 0,
});
expect(png.subarray(0, 8)).toEqual(
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
);
expect(png.readUInt32BE(16)).toBe(256);
expect(png.readUInt32BE(20)).toBe(256);
```

在生成 256 × 256 受控快照后，把测试中的字节长度和 SHA-256 更新为该文件的实际固定值，
同时把同一值写入 `branding-default-logo.ts` 来源注释；两处必须一致。

- [ ] **Step 2：运行聚焦测试确认失败**

Run:

```bash
bun test apps/api/src/services/branding-contracts.test.ts \
  apps/api/src/services/effective-branding-platform.test.ts \
  apps/api/src/gateways/douyin-open-platform/template-client.test.ts \
  apps/api/src/services/platform-douyin-template-promotion.test.ts
```

Expected: FAIL，旧兜底名称、旧 Base64 或旧第三方应用样例仍存在。

- [ ] **Step 3：实现新运行时兜底**

设置：

```ts
export const PLATFORM_FALLBACK_DISPLAY_NAME = "好店智装云";
```

把 Task 1 图标缩放为 256 × 256 PNG，更新 `CONTROLLED_FALLBACK_LOGO_URL`。注释来源改为
Gooes 仓库内的 `apps/admin/app/icon.png`，记录实际 SHA-256、尺寸和字节数。不得改动
`effective-branding.ts` 的租户优先级、权益判断或安全回退流程。

- [ ] **Step 4：运行 API 聚焦测试和完整检查**

Run:

```bash
bun test apps/api/src/services/branding-contracts.test.ts \
  apps/api/src/services/effective-branding-platform.test.ts \
  apps/api/src/gateways/douyin-open-platform/template-client.test.ts \
  apps/api/src/services/platform-douyin-template-promotion.test.ts
bun run api:check
```

Expected: 全部 PASS，API 类型检查、构建和 500 行门槛通过。

- [ ] **Step 5：提交 API 改造**

```bash
git add apps/api/src/services/branding-contracts.ts \
  apps/api/src/services/branding-contracts.test.ts \
  apps/api/src/services/branding-default-logo.ts \
  apps/api/src/services/effective-branding-platform.test.ts \
  apps/api/src/gateways/douyin-open-platform/template-client.test.ts \
  apps/api/src/services/platform-douyin-template-promotion.test.ts
git commit -m "feat(api): 更新好店智装云运行时兜底"
```

## Task 5：更新当前品牌规范并保留历史事实

**Files:**
- Modify: `PRODUCT.md`
- Modify: `DESIGN.md`
- Modify: `docs/assets/official-site-assets.md`
- Modify: `docs/superpowers/plans/2026-08-20-haodian-brand-refresh.md`（仅纠正当前计划中已确认的可访问性 Token、Task 5 文件与检查清单，不重写历史事实）

- [ ] **Step 1：更新当前规范**

将 PRODUCT/DESIGN 的黄黑品牌描述改为“好店智装云深蓝主色、橙色点缀、中性表面”；
Creative North Star 改为 `The Blue Project Ledger`。明确 Admin 禁止装饰性渐变，品牌色只用于
主操作、当前选择、焦点和少量识别；业务状态继续使用语义色。

`docs/assets/official-site-assets.md` 更新为新 Logo 角色、蓝橙色彩和分尺寸资产说明。不要
重写 `docs/operations/evidence/**` 和已有日期的历史计划/规格事实。

同时把本计划 Task 2 中实施后确认的 `--accent-foreground` 记录为 `204 70% 16%`，保留
`--primary-foreground` 白色，并注明橙色配深蓝的实测对比度 5.068:1；这只纠正当前计划的
实现值，不回写其他历史计划、规格或证据。

- [ ] **Step 2：检查当前规范不再指导旧品牌**

Run:

```bash
git grep -n -I -E '鹅班长|黄黑|Gooes yellow|yellow and black|Yellow Site Ledger' \
  -- PRODUCT.md DESIGN.md docs/assets/official-site-assets.md
```

Expected: 无输出。

Run:

```bash
git grep -n -A 2 -- '--accent-foreground: 204 70% 16%' \
  docs/superpowers/plans/2026-08-20-haodian-brand-refresh.md
git diff --check
bun run check:file-size
```

Expected: 当前计划显示深蓝 Accent 前景及 WCAG AA 说明，格式与文件大小检查通过。

- [ ] **Step 3：提交规范**

```bash
git add PRODUCT.md DESIGN.md docs/assets/official-site-assets.md \
  docs/superpowers/plans/2026-08-20-haodian-brand-refresh.md
git commit -m "docs: 更新好店智装云品牌规范"
```

## Task 6：执行完整静态、自动化和范围审计

**Files:**
- Modify only if verification reveals an in-scope defect.

- [ ] **Step 1：审计旧品牌残留**

Run:

```bash
git grep -n -I '鹅班长' -- apps/admin apps/web apps/api PRODUCT.md DESIGN.md docs/assets
```

Expected: 无输出。历史计划、历史规格和证据目录不作为零匹配目标。

- [ ] **Step 2：审计 Admin 渐变和 H5/抖音边界**

Run:

```bash
git grep -n -I -i -E '(linear|radial|conic)-gradient|bg-gradient-' -- \
  apps/admin/app/globals.css apps/admin/components/login-form.tsx
git diff --exit-code origin/main -- apps/h5 apps/douyin-mini
```

Expected: 两条命令均无输出并返回 0。Admin 负向测试中的 `bg-gradient` 字符串允许存在。

- [ ] **Step 3：运行完整验证**

Run:

```bash
bun run test
bun run admin:check
bun run web:check
bun run api:check
bun run check:file-size
```

Expected: 全部退出码为 0；不使用 `--no-verify`。

- [ ] **Step 4：执行视觉 Smoke**

先通过最小静态检查，再启动 Admin 和 Web 开发服务。分别截取并检查：Admin 登录页、租户
展开/收起侧栏、平台超管展开/收起侧栏、官网页头页脚、32px 导航图标、浏览器图标和
1200 × 630 分享图。确认：

- Admin 背景和按钮无渐变；
- 新 Logo 无压缩、重复文字或小字糊成色块；
- 品牌蓝/橙与正文、按钮、焦点满足对比度；
- 租户和超管使用相同品牌外壳；
- H5 和抖音页面不在本次视觉回归范围且代码无改动。

- [ ] **Step 5：提交验证修正**

只有出现真实回归时才创建修正提交：

```bash
git add apps/admin apps/web apps/api PRODUCT.md DESIGN.md docs/assets
git commit -m "fix(brand): 修正品牌迁移回归"
```

若无需修正，不创建空提交。

## Task 7：代码审查、推送并创建单一 PR

**Files:**
- Review all changes from `origin/main...HEAD`.

- [ ] **Step 1：执行完成前审查**

使用 `requesting-code-review` 检查设计覆盖、租户品牌隔离、Admin 渐变边界、资产清晰度、
测试覆盖、文件大小和无关改动。修复所有 P0/P1 和本次范围内的明确 P2。

- [ ] **Step 2：检查提交与工作区**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
```

Expected: 工作区干净；只有本计划的小提交；无空白错误。

- [ ] **Step 3：推送分支并创建 PR**

```bash
git push -u origin feature/haodian-brand-refresh
gh pr create \
  --base main \
  --head feature/haodian-brand-refresh \
  --title "feat: 迁移好店智装云品牌并统一 Admin 纯色界面" \
  --body $'## 范围\n- 用户可见平台品牌迁移为好店智装云\n- Admin 租户与平台超管改为蓝橙纯色界面\n- Web SEO、分享图和 API 运行时兜底同步更新\n\n## 边界\n- H5 与抖音小程序渐变未修改\n- 租户私有品牌不覆盖\n- 无数据库 migration\n\n## 验证\n- bun run test\n- bun run admin:check\n- bun run web:check\n- bun run api:check\n- bun run check:file-size\n- Admin 与 Web 视觉 smoke\n\n## 合并后\n- 平台品牌管理发布新资料\n- 抖音开放平台提交实际应用改名'
```

PR 说明必须包含：范围、Admin-only 去渐变边界、H5/抖音未改、租户私有品牌保护、无
migration、测试结果、截图、部署后平台品牌发布步骤和抖音开放平台实际改名待办。

- [ ] **Step 4：记录合并后运营动作**

PR 创建后报告而不自动执行以下外部状态变更：

1. 部署 API/Admin/Web；
2. 平台超管上传并发布“好店智装云”品牌资料；
3. 调用 `/branding/effective` 验证平台回退、普通租户和私有品牌租户；
4. 在抖音开放平台提交“好店智装云装企管家”实际改名；
5. 检查 SEO、Open Graph 和 favicon 缓存。
