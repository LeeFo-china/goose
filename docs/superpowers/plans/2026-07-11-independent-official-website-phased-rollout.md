# 独立官网与城市合伙人内容平台分阶段实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有城市合伙人公开页从 `apps/admin` 迁移到独立 `apps/web`，再建设可发布文章、案例和城市页的 CMS，最终完成官网生产切流。

**Architecture:** `apps/web` 使用 Next.js App Router 渲染公开官网并通过 `apps/api` 读取内容，不直连 Supabase；`apps/admin` 继续承担内容编辑和发布；`apps/api` 按 controller/service/repository 分层管理内容、版本、预览、权限和审计。整个交付分为三个可独立部署、验收和回滚的阶段，每个阶段完成后才进入下一阶段。

**Tech Stack:** Next.js 15.3、React 19、TypeScript、Tailwind CSS 3、shadcn/ui on Radix、Zod、React Hook Form、Bun Test、Playwright、Fastify 5、Supabase/PostgreSQL、Docker、Nginx、GitHub Actions。

---

## 0. 执行规则与阶段门

### 必须使用的技能

- 开始执行前使用 `using-git-worktrees` 创建独立 worktree。
- 每个功能或缺陷按 `test-driven-development` 先写失败测试。
- 官网页面实施时同时使用 `design-taste-frontend`、`impeccable` 和 `shadcn`。
- 每个阶段结束前使用 `requesting-code-review` 和 `verification-before-completion`。
- 阶段内按任务提交，禁止把三个阶段压成一个提交或一次部署。

### 固定设计约束

```text
Reading this as: 面向装修企业负责人和城市渠道伙伴的完整 B2B 品牌官网，
以务实、在地、可靠的黄黑品牌语言呈现，采用定制 Tailwind 构图和 shadcn/Radix 交互基础。

DESIGN_VARIANCE   7
MOTION_INTENSITY  4
VISUAL_DENSITY    4
```

- 真实项目图片优先，不制作 `div` 拼装的假截图。
- shadcn 只提供 Button、Field、Select、Dialog、Accordion、Alert、Skeleton、Empty 等交互基础。
- 默认 Server Components，表单、菜单、主题和动画保持为 Client Component 叶子。
- 页面必须支持浅色、深色语义 Token 和 `prefers-reduced-motion`。
- 页面验收覆盖手机、平板、桌面；性能目标为 LCP `< 2.5s`、INP `< 200ms`、CLS `< 0.1`。

### 阶段门

| 阶段 | 可交付结果 | 进入下一阶段的硬条件 |
| --- | --- | --- |
| 一 | 独立 `apps/web` 和 `/partners` dev 服务 | dev 域名可用，申请闭环通过，Admin 旧页仍可回滚 |
| 二 | CMS 数据、API、Admin 编辑发布和 Preview | migration 对齐，权限审计通过，发布后缓存可失效 |
| 三 | 完整官网、SEO 和生产切流 | 全站 E2E、SEO、性能与 Nginx 回滚演练通过 |

## 1. 文件总图

### 阶段一新增或修改

- Create `apps/web/package.json`: 官网依赖和 build/check/test 命令。
- Create `apps/web/{next.config.ts,tsconfig.json,tailwind.config.ts,postcss.config.mjs,components.json}`: Next、Tailwind、shadcn 配置。
- Create `apps/web/app/{layout.tsx,globals.css,page.tsx,not-found.tsx,sitemap.ts,robots.ts}`: 官网根布局和基础 SEO。
- Create `apps/web/app/(marketing)/partners/page.tsx`: 城市合伙人公开页。
- Create `apps/web/components/official-site/*`: Header、Footer、Partner Sections 和申请表。
- Create `apps/web/components/ui/*`: 只添加实际使用的 shadcn 源码组件。
- Create `apps/web/app/api/public/partner-applications/{route.ts,send-code/route.ts}`: 同源公开代理。
- Create `apps/web/lib/{backend.ts,site-config.ts,utils.ts}`: API 地址、站点常量和 `cn()`。
- Create `apps/web/tests/*` and `apps/web/e2e/*`: 契约与浏览器测试。
- Create `docker/web.Dockerfile` and `deploy/docker-compose.web.yml`: 官网镜像和生产服务。
- Create `deploy/nginx/gooes-web-dev.conf`: dev 官网反向代理配置来源文件。
- Modify `deploy/docker-compose.dev.yml`: 增加 `gooes-web-dev`。
- Modify `.github/workflows/{deploy-dev.yml,build-docker-images.yml,deploy-docker-services.yml}`: 增加 web 构建部署目标。
- Modify root `package.json`: 增加 web scripts。

### 阶段二新增或修改

- Create `packages/domain/src/site-content.ts`: 内容类型、状态、块、DTO 和分页契约。
- Modify `packages/domain/src/{index.ts,permission.ts,permission.test.ts}`: 导出内容契约并增加三项平台权限。
- Create `supabase/migrations/20260711170000_create_site_content_cms.sql`: 内容、版本、Preview token、索引和发布 RPC。
- Create `supabase/migrations/20260711171000_seed_site_content_permissions.sql`: 权限和平台管理员授权。
- Create `apps/api/src/schema/site-content.ts`: 管理和公开接口 Zod Schema。
- Create `apps/api/src/repositories/site-content.ts`: Supabase 直接访问层。
- Create `apps/api/src/services/site-content.ts`: 内容版本、发布、回滚、审计和失效编排。
- Create `apps/api/src/controllers/site-content/{index.ts,routes.test.ts}`: HTTP 路由。
- Modify `apps/api/src/routes/index.ts`: 注册 controller。
- Create `apps/admin/app/(console)/platform/site-content/*`: CMS 列表、新建、编辑页。
- Create `apps/admin/components/site-content/*`: 列表、表单、块编辑器、发布和版本组件。
- Modify `apps/admin/components/layout/menu-config.ts`: 平台内容入口。
- Create `apps/web/app/api/{preview,revalidate}/route.ts`: Preview 和按需失效。
- Create `apps/web/lib/{site-content-api.ts,preview-session.ts}`: 服务端内容客户端和预览会话。

### 阶段三新增或修改

- Create `apps/web/app/(marketing)/{products,solutions,about}/*`: 核心营销页。
- Create `apps/web/app/(content)/{articles,cases,cities}/*`: CMS 列表和详情。
- Create `apps/web/components/content/*`: 白名单块渲染器和内容布局。
- Modify `apps/web/app/{page.tsx,sitemap.ts,robots.ts}`: 首页和完整 SEO。
- Create `apps/web/app/opengraph-image.tsx`: 默认 OG 图。
- Create `deploy/nginx/gooes-web.conf`: 生产官网 upstream、Admin 旧地址 301 和回滚来源文件。
- Remove only after production observation: Admin 公开 `/partners` 页面、表单和公开代理。

## 阶段一：独立 App 与城市合伙人页面

### Task 1: 建立 `apps/web` 可构建基线

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/components.json`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/lib/utils.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: 写失败的应用结构测试**

Create `apps/web/tests/app-scaffold.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("web app scaffold", () => {
  test("uses the repository Next and React major versions", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.name).toBe("@gooes/web");
    expect(pkg.dependencies.next).toBe("^15.3.0");
    expect(pkg.dependencies.react).toBe("^19.0.0");
  });

  test("is a standalone RSC application", () => {
    expect(read("next.config.ts")).toContain('output: "standalone"');
    expect(read("app/layout.tsx")).not.toContain('"use client"');
    expect(existsSync(new URL("components.json", root))).toBe(true);
  });
});
```

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/web/tests/app-scaffold.test.ts`

Expected: FAIL because `apps/web/package.json` does not exist.

- [ ] **Step 3: 创建最小应用配置**

`apps/web/package.json` 固定包含：

```json
{
  "name": "@gooes/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3020",
    "build": "next build && node scripts/sync-standalone-assets.mjs",
    "start": "PORT=${PORT:-3020} HOSTNAME=${GOOES_WEB_HOSTNAME:-127.0.0.1} node .next/standalone/apps/web/server.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "check": "pnpm run typecheck",
    "test": "bun test tests",
    "test:e2e": "env -u NO_COLOR playwright test"
  },
  "dependencies": {
    "@gooes/domain": "workspace:*",
    "@hookform/resolvers": "^5.2.2",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-slot": "^1.2.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "next": "^15.3.0",
    "next-themes": "^0.4.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.75.0",
    "sonner": "^2.0.7",
    "tailwind-merge": "^2.6.0",
    "zod": "^4.4.2"
  },
  "devDependencies": {
    "@playwright/test": "^1.60.0",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.2",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2"
  }
}
```

配置复制 `apps/admin` 的 standalone、路径别名和 Tailwind 3 结构，只把应用路径、端口和站点 Token 改为 web。根脚本增加：

```json
"web:dev": "pnpm --dir apps/web dev",
"web:build": "pnpm --dir apps/web build",
"web:check": "pnpm --dir apps/web check",
"web:test": "pnpm --dir apps/web test",
"web:start": "pnpm --dir apps/web start"
```

- [ ] **Step 4: 初始化并核验 shadcn 上下文**

Run:

```bash
cd apps/web
pnpm dlx shadcn@latest info --json
pnpm dlx shadcn@latest docs button field input select checkbox alert skeleton
```

Expected: framework is Next.js, RSC is true, Tailwind is v3, base is Radix, aliases resolve under `@/`。若输出与配置不符，先修 `components.json`，不要添加组件。

- [ ] **Step 5: 安装依赖并验证基线**

Run:

```bash
pnpm install --frozen-lockfile=false
bun test apps/web/tests/app-scaffold.test.ts
pnpm --dir apps/web typecheck
pnpm --dir apps/web build
```

Expected: test PASS、typecheck exit 0、Next build exit 0。

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml apps/web
git commit -m "feat(web): 初始化独立官网应用"
```

### Task 2: 建立官网品牌 Token、Shell 和状态基线

**Files:**
- Create: `apps/web/components/theme-provider.tsx`
- Create: `apps/web/components/official-site/site-header.tsx`
- Create: `apps/web/components/official-site/site-footer.tsx`
- Create: `apps/web/components/official-site/site-shell.tsx`
- Create: `apps/web/components/ui/{button,field,input,textarea,select,checkbox,alert,skeleton,separator}.tsx`
- Create: `apps/web/tests/design-system-contract.test.ts`
- Modify: `apps/web/app/{layout.tsx,globals.css}`

- [ ] **Step 1: 写设计约束失败测试**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("official site design system", () => {
  test("uses semantic light and dark tokens", () => {
    const css = read("../app/globals.css");
    expect(css).toContain(":root");
    expect(css).toContain(".dark");
    expect(css).toContain("--primary:");
    expect(css).toContain("--accent:");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("keeps the shell server rendered", () => {
    expect(read("../components/official-site/site-shell.tsx")).not.toContain('"use client"');
  });
});
```

- [ ] **Step 2: 验证测试失败**

Run: `bun test apps/web/tests/design-system-contract.test.ts`

Expected: FAIL because theme and shell files do not exist.

- [ ] **Step 3: 通过 shadcn CLI 添加组件**

Run:

```bash
cd apps/web
pnpm dlx shadcn@latest add button field input textarea select checkbox alert skeleton separator --dry-run
pnpm dlx shadcn@latest add button field input textarea select checkbox alert skeleton separator
```

逐个阅读新增文件。保持 Radix `asChild` API、Lucide 图标族和语义颜色；不得使用 raw yellow、任意 z-index、`space-y-*`。

- [ ] **Step 4: 实现主题和 Shell**

Token 规则固定为：中性 off-white/off-black 表面、鹅班长黄色唯一品牌强调色、成功/警告/错误独立语义色。`ThemeProvider` 只在根布局包裹一次：

```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  <SiteShell>{children}</SiteShell>
</ThemeProvider>
```

Header 桌面高度 72px、单行导航；移动端菜单使用 shadcn Dialog 并包含 `DialogTitle`。Footer 不显示版本号、天气或装饰性状态点。

- [ ] **Step 5: 验证**

Run:

```bash
bun test apps/web/tests/design-system-contract.test.ts
pnpm --dir apps/web check
pnpm --dir apps/web build
```

Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): 建立官网品牌设计系统"
```

### Task 3: 迁移城市合伙人页面与申请闭环

**Files:**
- Create: `apps/web/app/(marketing)/partners/page.tsx`
- Create: `apps/web/components/official-site/{partner-hero,partner-revenue,partner-process,partner-application-form}.tsx`
- Create: `apps/web/app/api/public/partner-applications/route.ts`
- Create: `apps/web/app/api/public/partner-applications/send-code/route.ts`
- Create: `apps/web/lib/backend.ts`
- Copy and verify: `apps/admin/public/{logo.png,partner-hero-renovation.png}` to `apps/web/public/`
- Create: `docs/assets/official-site-assets.md`
- Create: `apps/web/tests/partner-site.test.ts`

- [ ] **Step 1: 写迁移契约失败测试**

测试必须断言：Metadata、收益边界、2.5%、月结、短信 endpoint、申请 endpoint、`FieldGroup`、`aria-invalid`、公开代理不读取 Admin token，且页面不存在三等分 feature card 源码标记。

```ts
expect(page).toContain("城市合伙人招募");
expect(page).toContain("装修公司自己的业务收支独立");
expect(form).toContain('fetch("/api/public/partner-applications/send-code"');
expect(form).toContain('fetch("/api/public/partner-applications"');
expect(form).toContain("FieldGroup");
expect(form).toContain("aria-invalid");
expect(proxy).not.toContain("getAdminToken");
```

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/web/tests/partner-site.test.ts`

Expected: FAIL because the partner files do not exist.

- [ ] **Step 3: 实现公开代理**

两个 Route Handler 都必须：限制 `content-length <= 32KB`、只转发 accept/content-type 和设备 ID、`cache: "no-store"`、`redirect: "manual"`，网络错误统一返回：

```ts
return NextResponse.json(
  { success: false, message: "后端服务未连接，请稍后再试", code: "BACKEND_UNAVAILABLE" },
  { status: 502 },
);
```

- [ ] **Step 4: 实现页面和表单**

表单继续提交现有字段，标签位于输入框上方，错误位于字段下方。提交按钮 pending 时使用 shadcn Spinner、`disabled` 和 `aria-busy`。Hero 使用真实图片、首屏可见 CTA、标题最多两行；不保留当前 Hero 底部三等分指标条。

- [ ] **Step 5: 素材验收**

使用 `view_image` 检查两张迁移素材。无论是否替换，都在 `docs/assets/official-site-assets.md` 记录文件、来源、用途、尺寸、版权状态和移动端裁切结论。若 Hero 不满足至少 1600px 宽、移动端安全裁切或版权来源不可确认，执行 `imagegen` 生成替换位图并补充生成来源。

- [ ] **Step 6: 验证**

Run:

```bash
bun test apps/web/tests/partner-site.test.ts
pnpm --dir apps/web check
pnpm --dir apps/web build
```

Expected: all exit 0，构建输出包含 `/partners` 和两个 Route Handler。

- [ ] **Step 7: Commit**

```bash
git add apps/web docs/assets/official-site-assets.md
git commit -m "feat(web): 迁移城市合伙人公开页面"
```

### Task 4: 补齐阶段一 SEO、E2E 和独立部署

**Files:**
- Create: `apps/web/app/{not-found.tsx,sitemap.ts,robots.ts}`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/partner-application.spec.ts`
- Create: `apps/web/scripts/{sync-standalone-assets.mjs,verify-standalone-css.mjs}`
- Create: `docker/web.Dockerfile`
- Create: `deploy/docker-compose.web.yml`
- Create: `deploy/nginx/gooes-web-dev.conf`
- Modify: `deploy/docker-compose.dev.yml`
- Modify: `.github/workflows/{deploy-dev.yml,build-docker-images.yml,deploy-docker-services.yml}`

- [ ] **Step 1: 写 E2E**

```ts
import { expect, test } from "@playwright/test";

test("partner page is indexable and submits through the proxy", async ({ page }) => {
  await page.route("**/api/public/partner-applications/send-code", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) }),
  );
  await page.goto("/partners");
  await expect(page).toHaveTitle(/城市合伙人招募/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/partners$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
```

- [ ] **Step 2: 运行 E2E 并确认失败**

Run: `pnpm --dir apps/web test:e2e -- --grep "partner page"`

Expected: FAIL until Playwright config and SEO files exist.

- [ ] **Step 3: 实现 SEO 文件**

Sitemap 一期只包含 `/` 和 `/partners`；robots 允许公开页，禁止 `/api/` 和未来 `/portal/`；根 Metadata 使用 `metadataBase`、title template、description 和 canonical。

- [ ] **Step 4: 实现镜像和 Compose**

`docker/web.Dockerfile` 镜像结构复用 `docker/admin.Dockerfile`，使用 `@gooes/web` filter、端口 3020、`com.goodcms.service="web"`。`deploy/docker-compose.web.yml` 服务名固定 `gooes-web`，健康检查请求 `/partners`。

dev Compose 增加：

```yaml
gooes-web-dev:
  image: ${GOOES_WEB_IMAGE:?set GOOES_WEB_IMAGE}
  container_name: gooes-web-dev
  environment:
    NODE_ENV: production
    PORT: 3020
    HOSTNAME: 0.0.0.0
    GOOES_API_BASE_URL: http://gooes-api-dev:3000
  ports:
    - "127.0.0.1:13020:3020"
```

- [ ] **Step 5: 扩展 Actions service 枚举**

在三个 workflow 的 service 校验、matrix、compose 映射、健康检查和域名 smoke 中增加 `web`。dev 受影响路径增加 `apps/web/**`、`docker/web.Dockerfile`；生产 smoke 使用 `https://www.goodcms.cn/partners`，dev smoke 使用 `https://www-dev.goodcms.cn/partners`。

`deploy/nginx/gooes-web-dev.conf` 固定代理 `www-dev.goodcms.cn` 到 `127.0.0.1:13020`，转发 `Host`、`X-Real-IP`、`X-Forwarded-For` 和 `X-Forwarded-Proto`，并为 `/_next/static/` 设置 immutable 缓存。安装到服务器前先备份 `/etc/nginx/sites-enabled/reverse-proxy`，执行 `nginx -t` 后才 reload。

- [ ] **Step 6: 本地验证**

Run:

```bash
pnpm --dir apps/web check
pnpm --dir apps/web build
pnpm --dir apps/web verify:standalone-css
docker build -f docker/web.Dockerfile -t gooes-web:local .
docker run --rm -d --name gooes-web-plan-smoke -p 13020:3020 gooes-web:local
curl -fsS http://127.0.0.1:13020/partners >/dev/null
docker rm -f gooes-web-plan-smoke
pnpm --dir apps/web test:e2e
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web docker/web.Dockerfile deploy .github/workflows
git commit -m "ci(web): 增加独立官网部署流水线"
```

- [ ] **Step 8: 按 migration → API → Web 顺序部署 dev**

阶段一验证码限流依赖新增 RPC，部署顺序是强制门禁，不得并行或颠倒：

1. plan 并 review `20260711120000_reserve_sms_verification_code.sql`，确认待执行内容后通过批准的 migration 流程 apply；禁止手动在远端执行 DDL。
2. 运行 `supabase migration list`，确认该 migration 的 Local/Remote 已对齐且无 failed migration。
3. 仅在 migration 成功后部署包含 `c44ab26` 的 API；migration 未成功时禁止部署新 API。
4. 在 dev 完成验证码 smoke：单次发送成功；同 IP 6 路并发最多 5 路成功；同 phone 双路、同 device 双路均最多 1 路成功。
5. API 和验证码 smoke 全部通过后再部署 Web，并访问 `/partners` 验证申请闭环。

流水线强制采用分阶段发布，禁止在同一次请求中部署 API 和 Web：

1. 通过批准的 migration workflow apply，并以 `supabase migration list` 保存
   `20260711120000` Local/Remote 对齐证据。
2. 只选择 `api` 部署当前提交 SHA，等待 API container health 和公开 health 通过。
3. 针对同一提交 SHA 人工执行并记录验证码 smoke：单次发送成功、同 IP 6 路最多
   5 路成功、同 phone 双路和同 device 双路均最多 1 路成功。
4. 只选择 `web` 手动 dispatch，并填写：
   `migration_version=20260711120000`、`verified_commit_sha=<当前 GITHUB_SHA>`、
   `sms_smoke_confirmation=API_HEALTH_AND_SMS_CONCURRENCY_SMOKE_PASSED`。
5. 任一证据缺失或 SHA 不一致时 Web-only 流水线 fail closed。push 只构建并推送
   Web 镜像，不重建或检查 Web 容器；生产 `all` 继续发布 API、Admin 和 workers，
   同时构建 Web 镜像但从部署集合排除 Web。Web 必须另行执行 gated Web-only 发布。

失败或回滚时，API 可回滚到 `815d5fca`；新增数据库函数保持不动，不影响旧 API。禁止为了回滚手动在远端 `DROP FUNCTION`。未来如需移除函数，必须新建 forward migration，经 review/apply 后执行。

### 阶段一验收门

- [ ] `20260711120000_reserve_sms_verification_code.sql` 已成功 apply，`supabase migration list` 显示 Local/Remote 对齐；否则不得部署包含 `c44ab26` 的 API。
- [ ] dev 验证码并发 smoke 通过：同 IP 6 路最多成功 5 路，同 phone/device 双路最多成功 1 路。
- [ ] 部署 `www-dev.goodcms.cn`，连续访问 `/partners` 3 次均为 200。
- [ ] 发送验证码和提交申请各完成一次真实 dev smoke，Admin 可看到新申请。
- [ ] 手机 390px、平板 768px、桌面 1440px 截图通过设计预检。
- [ ] 浅色、深色、减少动态效果、键盘 Tab 顺序全部通过。
- [ ] Admin 旧 `/partners` 保留，不配置生产 301。
- [ ] 记录阶段一提交 SHA、镜像 tag、dev 验收时间和回滚命令。

## 阶段二：CMS 后端、Admin、Preview 与缓存失效

### Task 5: 定义共享内容和权限契约

**Files:**
- Create: `packages/domain/src/site-content.ts`
- Create: `packages/domain/src/site-content.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, test } from "bun:test";
import { PERMISSION_CODE_VALUES, SITE_CONTENT_TYPE_VALUES, SiteContentDraftBlockSchema } from "./index";

describe("site content domain", () => {
  test("exports content types and controlled blocks", () => {
    expect(SITE_CONTENT_TYPE_VALUES).toEqual(["article", "case", "city"]);
    expect(SiteContentDraftBlockSchema.safeParse({ type: "paragraph", text: "正文" }).success).toBe(true);
    expect(SiteContentDraftBlockSchema.safeParse({ type: "html", html: "<script />" }).success).toBe(false);
  });

  test("exports platform site content permissions", () => {
    expect(PERMISSION_CODE_VALUES).toContain("platform.site_content.read");
    expect(PERMISSION_CODE_VALUES).toContain("platform.site_content.manage");
    expect(PERMISSION_CODE_VALUES).toContain("platform.site_content.publish");
  });
});
```

- [ ] **Step 2: 运行失败测试**

Run: `bun test packages/domain/src/site-content.test.ts packages/domain/src/permission.test.ts`

Expected: FAIL because site content exports do not exist.

- [ ] **Step 3: 实现稳定契约**

固定导出：

```ts
export const SITE_CONTENT_TYPE_VALUES = ["article", "case", "city"] as const;
export const SITE_CONTENT_STATUS_VALUES = ["draft", "published", "archived"] as const;

export type SiteContentDraftBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "image"; fileId: string; alt: string }
  | { type: "quote"; text: string; attribution?: string }
  | { type: "list"; style: "ordered" | "unordered"; items: string[] }
  | { type: "callout"; tone: "info" | "warning"; title: string; text: string }
  | { type: "metrics"; items: Array<{ label: string; value: string }> }
  | { type: "gallery"; images: Array<{ fileId: string; alt: string }> };

export type SiteContentPublicAsset = {
  fileId: string;
  src: string;
  alt: string;
  width: number;
  height: number;
};
```

公开 DTO 中的 image/gallery block 使用由 API 根据 `platform_file_objects` 解析出的 `SiteContentPublicAsset`，不信任编辑请求传入的 URL 或尺寸。公开 DTO 必须区分 summary/detail，分页结构固定 `{ list, pagination }`，不得暴露 `created_by`、草稿或历史版本。

- [ ] **Step 4: 验证并提交**

Run:

```bash
bun test packages/domain/src/site-content.test.ts packages/domain/src/permission.test.ts
pnpm --dir packages/domain exec tsc -p tsconfig.json --noEmit
bun --cwd packages/domain run build
```

Expected: all exit 0.

```bash
git add packages/domain
git commit -m "feat(domain): 定义官网内容契约"
```

### Task 6: 通过 migration 建立 CMS 数据与发布事务

**Files:**
- Create: `supabase/migrations/20260711170000_create_site_content_cms.sql`
- Create: `supabase/migrations/20260711171000_seed_site_content_permissions.sql`

- [ ] **Step 1: 写 migration contract 检查**

Run before creating files:

```bash
rg -n "site_content_entries|site_content_versions|site_preview_tokens|publish_site_content" supabase/migrations
```

Expected: no matches.

- [ ] **Step 2: 创建结构 migration**

Migration 必须完整包含：

```sql
CREATE TABLE public.site_content_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type IN ('article', 'case', 'city')),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_version_id uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, slug)
);

CREATE TABLE public.site_content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.site_content_entries(id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK (version_no > 0),
  title text NOT NULL CHECK (btrim(title) <> ''),
  summary text,
  cover_file_id uuid REFERENCES public.platform_file_objects(id) ON DELETE SET NULL,
  content_blocks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(content_blocks) = 'array'),
  seo_title text,
  seo_description text,
  canonical_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, version_no),
  UNIQUE (entry_id, id)
);

ALTER TABLE public.site_content_entries
ADD CONSTRAINT site_content_published_version_fk
FOREIGN KEY (id, published_version_id)
REFERENCES public.site_content_versions(entry_id, id);
```

增加 `(content_type,status,published_at DESC)`、`(entry_id,version_no DESC)` 索引和 `update_updated_at_column()` trigger。`site_preview_tokens` 只保存 token hash、entry/version、expires_at、consumed_at 和关联 `employees` 的 created_by，不保存明文 token。

三张表全部启用 RLS，并显式撤销 `anon`、`authenticated` 的表权限；仅授予 `service_role` 所需 CRUD。公开读取仍必须经过 `apps/api`，不能通过 Supabase REST 绕过 DTO 和发布状态过滤。

`publish_site_content(entry_id, version_id, actor_id)` 必须锁定 entry、校验 version 归属、原子更新 `published_version_id/status/published_at/updated_at` 并返回发布记录。`rollback_site_content` 复用同样归属校验。只向 `service_role` 授权执行 RPC。

- [ ] **Step 3: 创建权限 migration**

按 `20260705113000_seed_platform_partner_permissions.sql` 模式插入：

```text
platform.site_content.read
platform.site_content.manage
platform.site_content.publish
```

并授权 `tenant_id IS NULL` 的 `platform_admin`，使用 `ON CONFLICT` 保证幂等。

- [ ] **Step 4: 应用本地 migration 并验证**

Run:

```bash
supabase db reset
supabase migration list
```

Expected: Local 列出现两个新 migration，无 failed migration。

Run SQL smoke through approved database query tool:

```sql
SELECT indexname FROM pg_indexes WHERE tablename IN ('site_content_entries', 'site_content_versions');
SELECT proname FROM pg_proc WHERE proname IN ('publish_site_content', 'rollback_site_content');
```

- [ ] **Step 5: 记录回滚方案并提交**

回滚只允许在未产生生产内容时 drop 新 RPC、三张新表和三项权限；已有内容后采用 forward migration 禁用入口，不删除数据。

```bash
git add supabase/migrations/20260711170000_create_site_content_cms.sql supabase/migrations/20260711171000_seed_site_content_permissions.sql
git commit -m "feat(db): 建立官网内容版本模型"
```

### Task 7: 实现 CMS API 分层和测试

**Files:**
- Create: `apps/api/src/schema/site-content.ts`
- Create: `apps/api/src/schema/site-content.test.ts`
- Create: `apps/api/src/repositories/site-content.ts`
- Create: `apps/api/src/repositories/site-content.test.ts`
- Create: `apps/api/src/services/site-content.ts`
- Create: `apps/api/src/services/site-content.test.ts`
- Create: `apps/api/src/controllers/site-content/index.ts`
- Create: `apps/api/src/controllers/site-content/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: 写 Schema 和路由失败测试**

Schema 测试覆盖：slug、UUID、分页默认 1/20、pageSize 101 拒绝、受控 block、article/case/city metadata、canonical URL。路由顺序固定：

```ts
expect(routes).toEqual([
  { method: "GET", path: "/public/site/articles" },
  { method: "GET", path: "/public/site/articles/:slug" },
  { method: "GET", path: "/public/site/cases" },
  { method: "GET", path: "/public/site/cases/:slug" },
  { method: "GET", path: "/public/site/cities/:slug" },
  { method: "GET", path: "/platform/site-content" },
  { method: "POST", path: "/platform/site-content" },
  { method: "GET", path: "/platform/site-content/:id" },
  { method: "PATCH", path: "/platform/site-content/:id" },
  { method: "GET", path: "/platform/site-content/:id/versions" },
  { method: "POST", path: "/platform/site-content/:id/versions" },
  { method: "POST", path: "/platform/site-content/:id/publish" },
  { method: "POST", path: "/platform/site-content/:id/rollback" },
  { method: "POST", path: "/platform/site-content/:id/archive" },
  { method: "POST", path: "/platform/site-content/:id/preview-token" },
  { method: "POST", path: "/internal/site-content/preview/consume" },
  { method: "GET", path: "/internal/site-content/versions/:id/preview" },
]);
```

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/api/src/schema/site-content.test.ts apps/api/src/controllers/site-content/routes.test.ts`

Expected: FAIL because files do not exist.

- [ ] **Step 3: 实现 repository 并测试查询边界**

公开列表必须 `.select()` 必要字段、`.eq("status", "published")`、`.range(from,to)`、按 `published_at DESC`。详情必须同时过滤 type、slug、published。管理列表和版本历史都使用 `.range(from,to)`，默认 `page=1&pageSize=20`、最大 100；不得假设单条内容版本总数有上限。

Preview token 创建时保存 `sha256(token)`；消费使用单次条件更新 `consumed_at IS NULL AND expires_at > now()`。创建版本前批量验证 cover 和所有 block fileId 均指向 `platform_file_objects.status='active'` 且 `visibility='public'`，公开读取时由 repository 批量查询这些 fileId，service 组装可信 URL 和尺寸，避免 N+1、失效或私有素材。所有数据库错误使用 `Errors.dbError()`。

- [ ] **Step 4: 实现 service 并测试领域行为**

依赖注入测试覆盖：权限 read/manage/publish、版本号递增、发布 RPC、回滚 RPC、归档、审计、token 10 分钟过期、token 只能消费一次、公开 DTO 不泄露内部字段。

发布返回固定结构：

```ts
type PublishSiteContentResult = {
  entry: SiteContentAdminDetail;
  cache_revalidation: { status: "succeeded" | "failed"; requestId?: string };
};
```

数据库发布成功后缓存失效失败不得把整个请求伪装成发布失败；记录 failure audit 并返回 `cache_revalidation.status="failed"`。

- [ ] **Step 5: 实现 controller**

Controller 只做 safeParse、读取平台上下文、调用 service、`ResponseHandler.success`。内部 Preview 路由校验独立 `x-gooes-preview-signature`，签名错误使用 `Errors.business(401, ..., "INVALID_PREVIEW_SIGNATURE")`，不得复用 Admin cookie。

- [ ] **Step 6: 验证并提交**

Run:

```bash
bun test apps/api/src/schema/site-content.test.ts apps/api/src/repositories/site-content.test.ts apps/api/src/services/site-content.test.ts apps/api/src/controllers/site-content/routes.test.ts
bun run api:check
```

Expected: tests pass, API check exit 0.

```bash
git add apps/api packages/domain
git commit -m "feat(api): 增加官网内容管理接口"
```

### Task 8: 实现 Web 内容客户端、Preview 和缓存失效

**Files:**
- Create: `apps/web/lib/site-content-api.ts`
- Create: `apps/web/lib/preview-session.ts`
- Create: `apps/web/app/api/preview/route.ts`
- Create: `apps/web/app/api/revalidate/route.ts`
- Create: `apps/web/tests/preview-revalidate.test.ts`

- [ ] **Step 1: 写安全契约失败测试**

测试断言 revalidate 使用 `timingSafeEqual`、拒绝缺失签名、Preview cookie 为 HttpOnly/Secure/SameSite=Lax、token 不进入重定向 URL、错误页 noindex。

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/web/tests/preview-revalidate.test.ts`

Expected: FAIL because routes do not exist.

- [ ] **Step 3: 实现 Preview 激活**

`GET /api/preview?token=...` 将 token POST 到 API consume endpoint，得到 entry/version/path 后签发 15 分钟 HttpOnly preview session cookie，删除查询参数并 303 到公开 path。后续 Server Component 用 session 中 versionId 调内部 preview endpoint。任何 Preview 页面 Metadata 固定 `{ robots: { index: false, follow: false } }`。

- [ ] **Step 4: 实现 Revalidate**

`POST /api/revalidate` 只接受 JSON `{ entryId, paths, tags }`，验证 HMAC 和 32KB body，限制 path 必须以 `/articles/`、`/cases/`、`/cities/` 开头，再调用 `revalidateTag` 和 `revalidatePath`。

- [ ] **Step 5: 验证并提交**

Run:

```bash
bun test apps/web/tests/preview-revalidate.test.ts
pnpm --dir apps/web check
pnpm --dir apps/web build
```

Expected: all exit 0.

```bash
git add apps/web
git commit -m "feat(web): 增加内容预览与缓存失效"
```

### Task 9: 实现 Admin CMS 列表、编辑、版本与发布

**Files:**
- Create: `apps/admin/app/(console)/platform/site-content/page.tsx`
- Create: `apps/admin/app/(console)/platform/site-content/new/page.tsx`
- Create: `apps/admin/app/(console)/platform/site-content/[id]/page.tsx`
- Create: `apps/admin/app/(console)/platform/site-content/loading.tsx`
- Create: `apps/admin/components/site-content/{site-content-table,site-content-editor,site-content-block-editor,site-content-version-panel,site-content-actions,site-content-types}.tsx`
- Create: `apps/admin/components/site-content/site-content-editor.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: 写 Admin 失败测试**

测试覆盖平台模式隔离、权限字符串、分页参数、FieldGroup、受控 block 八种类型、Preview/发布/回滚/归档动作、无任意 HTML 编辑器。

```ts
expect(menu).toContain('permission: "platform.site_content.read"');
expect(editor).toContain("FieldGroup");
expect(editor).toContain("SiteContentBlockEditor");
expect(editor).not.toContain("dangerouslySetInnerHTML");
expect(actions).toContain("preview-token");
```

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/admin/components/site-content/site-content-editor.test.ts`

Expected: FAIL because CMS UI does not exist.

- [ ] **Step 3: 核对 shadcn 真实 API**

Run:

```bash
cd apps/admin
pnpm dlx shadcn@latest info --json
pnpm dlx shadcn@latest docs field input textarea select dialog alert-dialog accordion tabs skeleton empty
```

使用现有已安装组件；缺失组件先 `add --dry-run`，未经确认不 overwrite 本地组件。

- [ ] **Step 4: 实现列表和编辑器**

列表和版本历史默认 `page=1&pageSize=20`，最大 100；内容列表过滤 content type/status/keyword。编辑器使用 RHF + Zod；每个 block 是可折叠编辑单元，可新增、上移、下移、删除，但不实现自由拖拽页面搭建。图片复用 `apps/admin/lib/cos-direct-upload.ts`。

- [ ] **Step 5: 实现发布动作**

发布、回滚、归档使用 AlertDialog；Preview 在新窗口打开 API 返回的短期 URL。发布成功但 revalidation failed 时显示 warning Alert，不显示失败 toast。

- [ ] **Step 6: 验证并提交**

Run:

```bash
bun test apps/admin/components/site-content/site-content-editor.test.ts
pnpm --dir apps/admin check
pnpm --dir apps/admin build
```

Expected: all exit 0.

```bash
git add apps/admin
git commit -m "feat(admin): 增加官网内容发布后台"
```

### 阶段二验收门

- [ ] `supabase migration list` 显示 Local/Remote 两个新 migration 对齐。
- [ ] 无 publish 权限账号只能查看，manage 账号可存草稿，publish 账号可发布和回滚。
- [ ] Preview token 第二次使用返回 `INVALID_OR_EXPIRED_PREVIEW_TOKEN`。
- [ ] 发布前公开页保持旧版本，发布后 dev 站点在一次 revalidate 内显示新版本。
- [ ] 发布、回滚、归档均能在平台审计日志按 resource id 查询。
- [ ] API 列表 pageSize 101 返回校验错误，草稿不出现在公开接口。
- [ ] Admin 和 Web 均完成 typecheck/build，阶段一申请闭环未回归。

## 阶段三：完整官网、SEO 与生产切流

### Task 10: 实现白名单内容渲染器和 CMS 页面

**Files:**
- Create: `apps/web/components/content/{content-block-renderer,article-layout,case-layout,city-layout,content-card,content-list}.tsx`
- Create: `apps/web/components/content/content-block-renderer.test.ts`
- Create: `apps/web/app/(content)/articles/{page.tsx,[slug]/page.tsx}`
- Create: `apps/web/app/(content)/cases/{page.tsx,[slug]/page.tsx}`
- Create: `apps/web/app/(content)/cities/[slug]/page.tsx`

- [ ] **Step 1: 写渲染器失败测试**

```ts
expect(source).toContain('case "paragraph"');
expect(source).toContain('case "heading"');
expect(source).toContain('case "image"');
expect(source).toContain('case "quote"');
expect(source).toContain('case "list"');
expect(source).toContain('case "callout"');
expect(source).toContain('case "metrics"');
expect(source).toContain('case "gallery"');
expect(source).not.toContain("dangerouslySetInnerHTML");
```

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/web/components/content/content-block-renderer.test.ts`

Expected: FAIL because renderer does not exist.

- [ ] **Step 3: 实现渲染和页面缓存**

列表使用 `searchParams` 解析 page 并调用 API 分页；详情使用 `generateMetadata`、`notFound()`、`next: { revalidate: 300, tags: [...] }`。Preview session 存在时改读指定 version 并禁用缓存。

- [ ] **Step 4: 实现结构化数据**

文章输出 `Article`，案例输出 `CreativeWork`，城市页输出 BreadcrumbList 和服务描述。JSON-LD 使用经过 domain 类型构造的对象并转义 `<`，不得渲染 CMS 任意 HTML。

- [ ] **Step 5: 验证并提交**

Run:

```bash
bun test apps/web/components/content/content-block-renderer.test.ts
pnpm --dir apps/web check
pnpm --dir apps/web build
```

Expected: build 输出动态 slug 页面且无 client-only warning。

```bash
git add apps/web
git commit -m "feat(web): 渲染官网动态内容"
```

### Task 11: 实现首页、产品、解决方案和关于我们

**Files:**
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/app/(marketing)/products/page.tsx`
- Create: `apps/web/app/(marketing)/solutions/page.tsx`
- Create: `apps/web/app/(marketing)/about/page.tsx`
- Create: `apps/web/components/official-site/{home-sections,product-sections,solution-sections,about-sections}.tsx`
- Create: `apps/web/tests/marketing-pages.test.ts`

- [ ] **Step 1: 为每页写内容和反模板约束测试**

测试每页只有一个 H1、有真实图片引用、CTA 意图一致、没有 `grid-cols-3` 三等分功能卡、没有 section 编号和 `Scroll to explore` 文案。

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/web/tests/marketing-pages.test.ts`

Expected: FAIL because marketing pages do not exist.

- [ ] **Step 3: 完成设计资产和页面实现**

每页先输出固定 Design Read 和 dials 到任务记录，再使用 `impeccable` brand register 确认场景、字体、色彩和图片。没有合格品牌图片时使用 `imagegen` 生成页面指定比例位图，禁止临时 CSS 占位。

页面职责固定：

- 首页：平台定位、装修业务闭环、真实使用场景、案例入口、合伙人入口。
- 产品：客户、项目、施工、验收、财务和营销能力，按工作流叙事，不做六张同款卡。
- 解决方案：装企经营、项目交付、客户透明、城市合作四类实际问题。
- 关于我们：公司使命、产品边界、联系方式和合规信息，不编造团队规模与客户数字。

- [ ] **Step 4: 浏览器设计验收**

使用浏览器分别截图 390x844、768x1024、1440x1000 的浅色和深色页面；机械检查 Hero 两行、CTA 不换行、导航单行、眉题数量、图片裁切、无横向滚动、focus 和 reduced motion。

- [ ] **Step 5: 验证并提交**

Run:

```bash
bun test apps/web/tests/marketing-pages.test.ts
pnpm --dir apps/web check
pnpm --dir apps/web build
```

```bash
git add apps/web docs/assets/official-site-assets.md
git commit -m "feat(web): 完成官网核心营销页面"
```

### Task 12: 完成全站 SEO、E2E 和性能门槛

**Files:**
- Modify: `apps/web/app/{sitemap.ts,robots.ts,layout.tsx}`
- Create: `apps/web/app/opengraph-image.tsx`
- Create: `apps/web/e2e/{site-navigation,content-preview,seo-accessibility}.spec.ts`
- Create: `apps/web/scripts/check-visible-copy.mjs`

- [ ] **Step 1: 写全站 E2E**

覆盖导航、404、分页、文章/案例/城市详情、canonical、OG、JSON-LD、Preview noindex、Sitemap 排除草稿/归档/portal、键盘导航和申请回归。

- [ ] **Step 2: 运行 E2E 并确认失败项**

Run: `pnpm --dir apps/web test:e2e`

Expected: new SEO tests FAIL before sitemap and metadata completion.

- [ ] **Step 3: 实现动态 Sitemap 与默认 OG**

Sitemap 从公开 API 分页读取全部已发布条目，每次最多 100，循环到 totalPages，不允许调用无分页全量接口。API 失败时保留核心静态 URL 并记录 requestId，不把草稿写入 sitemap。

- [ ] **Step 4: 运行文案和反模式扫描**

`check-visible-copy.mjs` 扫描公开 TSX，至少拒绝可见 em dash、`Scroll to explore`、版本页脚、连续 section 编号和 placeholder-as-label。执行结果纳入 `web:check`。

- [ ] **Step 5: 性能和可访问性 smoke**

Run Lighthouse mobile against dev for `/`、`/partners`、一篇文章、一篇案例和一个城市页。硬门：Performance >= 85、Accessibility >= 95、SEO >= 95，且真实 CWV 目标没有明确阻塞项。若 LCP 超标，优先修 Hero 图片尺寸、priority 和字体，不提高阈值。

- [ ] **Step 6: 验证并提交**

Run:

```bash
pnpm --dir apps/web check
pnpm --dir apps/web build
pnpm --dir apps/web test:e2e
git diff --check
```

```bash
git add apps/web package.json
git commit -m "test(web): 完成官网发布质量门"
```

### Task 13: 生产切流、观察和旧页清理

**Files:**
- Modify: `.github/workflows/{build-docker-images.yml,deploy-docker-services.yml}`
- Create: `deploy/nginx/gooes-web.conf`
- Remove after observation: `apps/admin/app/(site)/partners/page.tsx`
- Remove after observation: `apps/admin/components/official-site/{partner-application-form.tsx,city-partner-site.test.ts}`
- Remove after observation: `apps/admin/app/api/public/partner-applications/route.ts`

- [ ] **Step 1: 生产切流前快照**

记录当前 Admin 镜像、Web 镜像、Nginx 配置 checksum、DNS TTL、`/partners` 响应头、Sitemap URL 数量。备份 Nginx 配置但不备份 secret 文件。

- [ ] **Step 2: 部署生产 Web 但不切域名**

通过 loopback/临时 Host header 检查容器 `/`、`/partners`、内容详情、Sitemap 和 Preview 拒绝路径。确认 `gooes-web` 健康后才改 Nginx。

- [ ] **Step 3: 切换 Nginx**

先提交 `deploy/nginx/gooes-web.conf`，配置 `www.goodcms.cn -> 127.0.0.1:3020`，并将 `admin.goodcms.cn/partners` 301 到 `https://www.goodcms.cn/partners`。服务器安装目标固定为 `/etc/nginx/sites-enabled/reverse-proxy`；覆盖前生成带时间戳备份，执行 `nginx -t` 成功后 reload，禁止未验证语法直接重启。

- [ ] **Step 4: 生产 smoke 和观察**

连续检查 30 分钟：5xx、容器重启、API requestId、申请提交、Web access log、LCP 和缓存命中。检查历史 UTM 链接和 canonical；不得在观察期删除 Admin 旧实现。

- [ ] **Step 5: 回滚演练**

将 Nginx upstream 临时切回旧 Admin，验证 `/partners` 可用，再恢复 Web。若生产出现 P0/P1，直接执行相同回滚，不回滚 CMS 数据。

- [ ] **Step 6: 观察期后删除旧公开实现**

至少一个发布周期且无回滚后，先写测试断言 Admin 不再暴露公开 `/partners`，再删除三个旧实现；后台 `/platform/partners` 保持不变。

- [ ] **Step 7: 最终验证和提交**

Run:

```bash
bun test apps/admin/components/official-site
pnpm --dir apps/admin check
pnpm --dir apps/admin build
pnpm --dir apps/web check
pnpm --dir apps/web build
git diff --check
```

Expected: Admin 公开测试目录为空或仅保留明确的 301 契约测试，平台合伙人后台仍构建成功。

```bash
git add apps/admin deploy/nginx/gooes-web.conf .github/workflows
git commit -m "refactor(admin): 移除旧官网公开入口"
```

## 最终验收清单

- [ ] `apps/web`、`apps/admin`、`apps/api`、`packages/domain` 全部 typecheck/build 通过。
- [ ] API 和 Web 新测试全部通过，Playwright 无 retry 后偶发失败。
- [ ] migration list Local/Remote 对齐，数据库无手工 DDL。
- [ ] 公开列表全部分页，pageSize 默认 20、最大 100。
- [ ] 内容发布、回滚、归档有权限和审计；Preview token 一次性且短期。
- [ ] Web 不包含 Supabase client、service role key 或 Admin token 读取逻辑。
- [ ] 全站浅色、深色、键盘、reduced motion、手机、平板、桌面通过。
- [ ] Sitemap、canonical、JSON-LD、OG 和 301 通过线上验证。
- [ ] RAG 同步只上传本计划、设计文档和后续正式交接文档，不上传 secret 或构建产物。

## 回滚边界

- 阶段一：停止 `gooes-web[-dev]`，域名切回 Admin，代码无需删除。
- 阶段二：隐藏 Admin CMS 菜单并停止发布；已创建表保留，使用 forward migration 修复，禁止删除已有内容。
- 阶段三：Nginx upstream 切回旧 Admin 或上一版 Web 镜像；CMS/API 继续运行，不回退已发布数据。
- 任一阶段回滚都记录镜像 tag、Git SHA、操作时间、原因和恢复验证，不修改 orange 仓库。
