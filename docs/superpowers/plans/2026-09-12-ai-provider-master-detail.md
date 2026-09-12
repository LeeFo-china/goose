# AI Provider Master Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将平台 Admin 的供应商 Tab 固定为左侧供应商列表和右侧唯一供应商详情，详情在一个大 Card 内同时展示当前供应商连接配置与模型列表。

**Architecture:** 保留现有 `AiModelRoutingPanel -> AiProviderWorkspace -> AiProviderEditor/AiProviderModels` 边界，不修改 API 或数据合同。`AiProviderWorkspace` 继续拥有唯一 `selectedId`，新增单一详情容器并以供应商 ID 作为身份边界；浏览器回归通过两个具有不同名称、Endpoint 和模型的供应商证明右侧替换而非追加。

**Tech Stack:** Next.js App Router、React、TypeScript、shadcn/Radix、Tailwind、Bun test、Playwright

---

## File map

- Modify: `apps/admin/components/platform-ai/ai-provider-workspace.tsx`
  - 维护唯一选中供应商，绘制左侧选择栏和右侧单一大 Card。
- Modify: `apps/admin/components/platform-ai/ai-model-routing-layout.test.ts`
  - 锁定主从布局、唯一详情实例和无嵌套 Card 合同。
- Modify: `apps/admin/e2e/ai-provider-secrets-mock-backend.mjs`
  - 为第二供应商提供独立 Endpoint 和供应商模型，支持可控迟到响应。
- Modify: `apps/admin/e2e/ai-provider-secrets.spec.ts`
  - 验证切换、快速切换、唯一详情和桌面/窄屏布局。

不创建后端文件，不新增依赖，不修改 `AiProviderEditor`、`AiProviderModels` 的请求合同。

### Task 1: 固定唯一供应商详情结构

**Files:**
- Modify: `apps/admin/components/platform-ai/ai-model-routing-layout.test.ts:25-38`
- Modify: `apps/admin/components/platform-ai/ai-provider-workspace.tsx:3-70`

- [ ] **Step 1: 写入失败的结构合同测试**

在 `workspace keeps table overflow local with a single-column mobile layout` 用例中加入以下断言，要求右栏使用单一大 Card，并且编辑器和模型列表各只有一个挂载点：

```ts
expect(workspace).toContain("<ProviderDetail");
expect(workspace).toContain('aria-labelledby="ai-provider-detail-label"');
expect(workspace).toContain('data-provider-detail-id={provider?.id || "new"}');
expect(workspace.match(/<AiProviderEditor/g)).toHaveLength(1);
expect(workspace.match(/<AiProviderModels/g)).toHaveLength(1);
expect(workspace).toContain("<CardHeader");
expect(workspace).toContain("<CardContent");
expect(source("./ai-provider-editor.tsx")).not.toContain("<Card");
expect(source("./ai-provider-models.tsx")).not.toContain("<Card");
```

同时加入选中态语义断言：

```ts
expect(workspace).toContain('aria-current={selectedId === provider.id ? "true" : undefined}');
expect(workspace).toContain('data-provider-id={provider.id}');
```

- [ ] **Step 2: 运行测试并确认失败原因**

Run:

```bash
cd apps/admin
bun test components/platform-ai/ai-model-routing-layout.test.ts
```

Expected: FAIL，缺少 `ProviderDetail`、`CardHeader`、唯一详情标记或 `aria-current`，现有无关断言保持通过。

- [ ] **Step 3: 实现单一大 Card 的主从布局**

在 `ai-provider-workspace.tsx` 中从现有 shadcn 组件导入：

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
```

将左栏列表项改为一个清晰的大块选择项，保留删除操作但不嵌套 Card：

```tsx
<div
  key={provider.id}
  data-provider-id={provider.id}
  className={selectedId === provider.id
    ? "rounded-lg border border-primary/40 bg-primary/10 p-3"
    : "rounded-lg border bg-card p-3"}
>
  <Button
    variant="ghost"
    className="h-auto w-full min-w-0 justify-start px-2 text-left"
    aria-pressed={selectedId === provider.id}
    aria-current={selectedId === provider.id ? "true" : undefined}
    onClick={() => onSelect(provider.id)}
  >
    <span className={selectedId === provider.id ? "truncate font-semibold text-primary" : "truncate font-medium"} title={provider.name}>
      {provider.name}
    </span>
  </Button>
  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-2">
    <Badge variant={provider.status === "active" ? "success" : "outline"}>
      {provider.status === "active" ? "启用" : "停用"}
    </Badge>
    {canManage ? (
      <AiProviderDelete provider={provider} onDeleted={onDeleted} disabled={deleteDisabled} />
    ) : null}
  </div>
</div>
```

新增文件内私有 `ProviderDetail`。它是右栏唯一内容容器，连接配置与模型列表以区块和分隔线组织，不嵌套同级 Card：

```tsx
function ProviderDetail({ provider, canManage, onSaved, onReload }: {
  provider: AiProviderRecord | null;
  canManage: boolean;
  onSaved: (provider: AiProviderRecord) => Promise<void>;
  onReload?: () => Promise<AiProviderRecord | null>;
}) {
  const detailId = provider?.id || "new";
  return (
    <Card
      key={detailId}
      role="region"
      aria-labelledby="ai-provider-detail-label"
      data-provider-detail-id={detailId}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden shadow-sm"
    >
      <span id="ai-provider-detail-label" className="sr-only">供应商详情</span>
      <CardHeader className="shrink-0 border-b px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle id="ai-provider-detail-title" className="truncate text-base">
              {provider?.name || "新增供应商"}
            </CardTitle>
            <CardDescription className="mt-1">
              {provider ? `系统编码：${provider.code}` : "填写连接配置，保存后即可维护模型。"}
            </CardDescription>
          </div>
          {provider ? (
            <Badge variant={provider.status === "active" ? "success" : "outline"}>
              {provider.status === "active" ? "启用" : "停用"}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-5">
        <AiProviderEditor
          key={`editor:${detailId}`}
          provider={provider}
          canManage={canManage}
          onSaved={onSaved}
          onReload={onReload}
        />
        <Separator />
        <AiProviderModels
          key={`models:${detailId}`}
          providerId={provider?.id || ""}
          providerName={provider?.name || "新供应商"}
          canManage={canManage}
        />
      </CardContent>
    </Card>
  );
}
```

`AiProviderWorkspace` 只能调用一次 `ProviderDetail`：

```tsx
return (
  <div className="grid h-full min-h-0 auto-rows-max grid-cols-1 gap-4 overflow-auto xl:auto-rows-fr xl:grid-cols-[320px_minmax(0,1fr)] xl:overflow-hidden">
    <ProviderRail
      {...props}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onCreate={() => setSelectedId(null)}
      onDeleted={deleted}
    />
    <ProviderDetail
      provider={provider}
      canManage={props.canManage}
      onSaved={saved}
      onReload={provider ? () => props.onReload?.(provider.id) ?? Promise.resolve(null) : undefined}
    />
  </div>
);
```

不在右栏对 `page.list` 或 `providers` 使用 `map()`；只有左栏可以遍历供应商。

- [ ] **Step 4: 运行组件测试与静态检查**

Run:

```bash
cd apps/admin
bun test components/platform-ai/ai-model-routing-layout.test.ts components/platform-ai/ai-provider-form.test.tsx components/platform-ai/use-ai-provider-models.test.ts
bun run check:file-size
bun run typecheck
```

Expected: 全部 PASS，`next typegen` 与 `tsc --noEmit` exit 0。

- [ ] **Step 5: 提交结构改动**

```bash
git add apps/admin/components/platform-ai/ai-provider-workspace.tsx \
  apps/admin/components/platform-ai/ai-model-routing-layout.test.ts
git commit -m "refactor(admin): 固定供应商单详情工作区"
```

### Task 2: 验证供应商切换与迟到响应隔离

**Files:**
- Modify: `apps/admin/e2e/ai-provider-secrets-mock-backend.mjs:49-53,195-208`
- Modify: `apps/admin/e2e/ai-provider-secrets.spec.ts:18-222`

- [ ] **Step 1: 为浏览器测试写入失败断言**

在 `ai-provider-secrets.spec.ts` 新增用例：

```ts
test('供应商切换只替换右侧唯一详情和对应模型', async ({ page, request }, info) => {
  await request.post(`${backend}/__test/options`, {
    data: { second_provider: true, provider_models_by_supplier: true },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();

  const tab = page.getByRole('tabpanel', { name: '供应商', exact: true });
  const detail = tab.getByRole('region', { name: '供应商详情', exact: true });
  await expect(detail).toHaveCount(1);
  await expect(detail).toHaveAttribute('data-provider-detail-id', '10000000-0000-4000-8000-000000000001');
  await expect(detail.getByLabel('名称', { exact: true })).toHaveValue('方舟测试');
  await expect(detail.getByLabel('Endpoint Base URL')).toHaveValue('https://ark.example.test/api/v3');

  await page.getByRole('button', { name: '第二供应商', exact: true }).click();
  await expect(detail).toHaveCount(1);
  await expect(detail).toHaveAttribute('data-provider-detail-id', '10000000-0000-4000-8000-000000000002');
  await expect(detail.getByLabel('名称', { exact: true })).toHaveValue('第二供应商');
  await expect(detail.getByLabel('Endpoint Base URL')).toHaveValue('https://second.example.test/v1');
  await expect(detail.getByRole('table', { name: '第二供应商的模型' })).toBeVisible();
  await expect(detail.getByRole('table', { name: '方舟测试的模型' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('provider-master-detail-desktop.png'), fullPage: true });
});
```

再新增快速切换用例：让第一供应商的模型请求延迟，第二供应商详情先完成，随后等待第一请求返回，证明迟到数据没有覆盖当前模型列表：

```ts
test('快速切换时迟到的旧供应商模型不会覆盖当前详情', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, {
    data: {
      second_provider: true,
      provider_models_by_supplier: true,
      delay_first_provider_models: true,
    },
  });
  const staleRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/platform/ai-config/models'
      && url.searchParams.get('providerId') === '10000000-0000-4000-8000-000000000001';
  });
  await page.goto('/platform/ai-models', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await staleRequest;
  await page.getByRole('button', { name: '第二供应商', exact: true }).click();

  const detail = page.getByRole('region', { name: '供应商详情', exact: true });
  await expect(detail).toHaveAttribute('data-provider-detail-id', '10000000-0000-4000-8000-000000000002');
  await expect(detail.getByRole('table', { name: '第二供应商的模型' })).toContainText('第二供应商模型');
  await page.waitForTimeout(1400); // 跨过 mock 固定的 1.2 秒旧请求边界。
  await expect(detail).toHaveAttribute('data-provider-detail-id', '10000000-0000-4000-8000-000000000002');
  await expect(detail.getByRole('table', { name: '第二供应商的模型' })).toContainText('第二供应商模型');
  await expect(detail.getByRole('table', { name: '方舟测试的模型' })).toHaveCount(0);
});
```

扩展现有 400px 用例，要求窄屏也只有一个详情区且页面不横向溢出：

```ts
const detail = page.getByRole('region', { name: '供应商详情', exact: true });
await expect(detail).toHaveCount(1);
await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
```

- [ ] **Step 2: 运行新用例并确认失败**

Run:

```bash
cd apps/admin
bunx playwright test --config playwright.ai-provider-secrets.config.ts \
  --grep "供应商切换只替换右侧唯一详情和对应模型"
```

Expected: FAIL，当前详情没有“供应商详情”语义，第二供应商也没有独立 Endpoint 或模型数据。

- [ ] **Step 3: 完善合成测试数据**

在 mock backend 中定义第二供应商，避免继续复制第一供应商的 Endpoint：

```js
const secondProvider = () => ({
  ...initial(),
  id: secondProviderId,
  name: '第二供应商',
  code: 'second',
  endpoint_url: 'https://second.example.test/v1',
});
```

`providerList()` 使用 `secondProvider()`。模型列表请求继续按 `providerId` 过滤；当 `provider_models_by_supplier` 为 true 且查询第二供应商时返回一条只属于第二供应商的模型：

```js
if (options.provider_models_by_supplier && providerId === secondProviderId && !filtered.length) {
  const secondModels = [modelRecord({
    provider_id: secondProviderId,
    name: '第二供应商模型',
    model_name: 'second-model',
    modality: 'text',
    input_modalities: ['text'],
    status: 'active',
    sort_order: 0,
  }, '40000000-0000-4000-8000-000000000002')];
  return send(res, 200, page(secondModels));
}
```

同一 GET handler 在筛选前加入可控延迟，仅延迟第一供应商：

```js
if (options.delay_first_provider_models && providerId === id) {
  await new Promise((resolve) => setTimeout(resolve, 1200));
}
```

保持所有 fixture 为合成值，不加入真实 Endpoint、密钥或供应商请求。

- [ ] **Step 4: 给唯一详情补充稳定无障碍名称**

在 `ProviderDetail` 的 Card 上增加独立的屏幕阅读器标签，使详情区域名称保持固定；可见供应商名称继续使用单独的标题 ID：

```tsx
<Card
  role="region"
  aria-labelledby="ai-provider-detail-label"
  data-provider-detail-id={detailId}
>
  <span id="ai-provider-detail-label" className="sr-only">供应商详情</span>
  <CardHeader>
    <CardTitle id="ai-provider-detail-title">
      {provider?.name || "新增供应商"}
    </CardTitle>
  </CardHeader>
</Card>
```

最终 accessible name 必须精确为“供应商详情”，动态供应商名称仍作为可见标题，不用于定位唯一详情容器。

- [ ] **Step 5: 运行完整浏览器回归并检查截图**

Run:

```bash
cd apps/admin
bunx playwright test --config playwright.ai-provider-secrets.config.ts
```

Expected: Chromium 全部 PASS，新增桌面截图呈现左侧供应商列表与右侧单一大 Card；现有 400px 截图无页面级横向溢出。

人工检查：右侧只出现一个供应商标题、一组连接字段和一个对应模型列表；没有第二个供应商详情接在下方；连接区和模型区以一条分隔线组织，没有 Card 套 Card。

- [ ] **Step 6: 提交浏览器合同**

```bash
git add apps/admin/e2e/ai-provider-secrets-mock-backend.mjs \
  apps/admin/e2e/ai-provider-secrets.spec.ts \
  apps/admin/components/platform-ai/ai-provider-workspace.tsx
git commit -m "test(admin): 覆盖供应商单详情切换"
```

### Task 3: 完整回归与交付

**Files:**
- Verify: `apps/admin/components/platform-ai/**`
- Verify: `apps/admin/e2e/ai-provider-*.spec.ts`

- [ ] **Step 1: 运行 Admin 定向组件回归**

Run:

```bash
cd apps/admin
bun test --dots components/platform-ai
```

Expected: 0 fail。

- [ ] **Step 2: 运行静态检查**

Run:

```bash
cd apps/admin
bun run check:file-size
bun run typecheck
```

Expected: 文件大小、`next typegen` 和 `tsc --noEmit` 全部通过。

- [ ] **Step 3: 运行 AI 模型路由浏览器回归**

Run:

```bash
cd apps/admin
bunx playwright test --config playwright.ai-provider-secrets.config.ts
```

Expected: 0 fail，浏览器控制台没有 `pageerror`，所有请求只访问本地 mock backend。

- [ ] **Step 4: 执行交付前检查**

Run:

```bash
git diff --check
git status --short
git log --oneline main..HEAD
```

Expected: 无空白错误；状态只包含计划内文件；提交历史包含设计规格、工作区实现和浏览器合同，不包含主工作区原有未跟踪资料。

- [ ] **Step 5: 请求代码审查并修复阻断项**

审查清单：

```text
1. 右侧是否只存在一个详情实例。
2. 连接配置与模型列表是否共享同一个 provider ID。
3. 切换是否会取消或隔离旧请求和草稿状态。
4. 是否只有一个顶层大 Card，没有 Card 嵌套。
5. 1440px 与 400px 是否均无页面级溢出。
6. 权限、删除冲突、密钥不回显和分页行为是否保持。
```

Expected: 无 P0/P1 阻断问题；若修改代码，重新执行受影响测试和 Step 1 至 Step 4 的最终门禁。

## 最终实现偏差/审查调整

本计划前文保留实施前的示例与预期；最终代码及以下审查调整取代对应示例：

- 详情中的动态供应商名称由 `CardTitle` 改为普通视觉标题，避免形成 `h3` 后再出现模型区 `h2` 的倒序标题层级。
- 快速切换回归不再使用固定 1400ms 等待，改为 `started -> release -> completed` 的确定性测试屏障，明确跨过旧请求 handler 的完成点。
- 第二供应商模型不再作为 `filtered.length === 0` 的 fallback；它在过滤前加入统一候选集并按模型 ID 去重，再统一参与 provider、关键词、模态、状态过滤和分页。
- 1440px 正常切换用例在截图前自动断言 `document.documentElement.scrollWidth <= window.innerWidth`，与 400px 页面级横向溢出合同保持一致。
