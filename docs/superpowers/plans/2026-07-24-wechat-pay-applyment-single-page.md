# 微信支付开通申请单页重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将租户 Admin 微信支付开通申请重构为一个连续页面，让证照上传、OCR 回填、人工核对、补充资料和提交在同一上下文内完成。

**Architecture:** 保留现有上传、OCR、附件 checkpoint、自动保存和提交协调器，只重组 React 展示边界。新的单页工作流按资料组直接渲染附件和 OCR 字段，补充字段按联系、结算、经营拆分，底部提交区继续使用后端 readiness 和现有 flush 语义。

**Tech Stack:** Next.js 15、React 19、TypeScript、Tailwind CSS 3、shadcn/Radix、lucide-react、Bun test、Playwright。

**Status:** 已完成。实施结果和验收证据见对应设计文档的“实施验收记录”。

---

## 0. 文件职责

### 新建

- `apps/admin/components/finance/finance-wechat-pay-applyment-document-section.tsx`
  - 组合一个或两个附件槽、对应 OCR 预览和对应识别字段。
- `apps/admin/components/finance/finance-wechat-pay-applyment-single-page.tsx`
  - 编排申请身份、证照、联系、结算、经营和提交确认区。

### 修改

- `apps/admin/components/finance/finance-wechat-pay-applyment-attachments.tsx`
  - 导出可复用的单个附件槽和经营场景附件区，允许单页按资料组组合。
- `apps/admin/components/finance/finance-wechat-pay-applyment-ocr-review.tsx`
  - 导出按指定证照类别渲染的内联 OCR 核对内容，保留现有冲突选择。
- `apps/admin/components/finance/finance-wechat-pay-applyment-recognized-fields.tsx`
  - 支持直接渲染指定类别，不依赖隐藏的类别面板。
- `apps/admin/components/finance/finance-wechat-pay-applyment-supplement-fields.tsx`
  - 按联系、结算和经营拆成三个可组合区。
- `apps/admin/components/finance/finance-wechat-pay-applyment-review.tsx`
  - 缩减为 readiness、附件完成度和真实性确认。
- `apps/admin/components/finance/finance-wechat-pay-applyment-workflow.tsx`
  - 改为单页工作流适配器，移除阶段内容和阶段导航参数。
- `apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx`
  - 移除阶段导航和右侧处理记录，改为单列单页布局。
- `apps/admin/components/finance/finance-wechat-pay-applyment-validation.ts`
  - 增加与阶段无关的全表单定位函数。
- `apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`
  - 将四阶段契约改为单页资料组契约。
- 与阶段导航直接耦合的测试文件
  - 删除或改写只验证四阶段可达性的断言。

### 删除

- `apps/admin/components/finance/use-wechat-pay-applyment-stage-navigation.ts`
  - 单页不再维护 active/reachable stage。
- `apps/admin/components/finance/finance-wechat-pay-applyment-events.tsx`
  - 租户申请页不再展示处理记录。
- `apps/admin/components/finance/finance-wechat-pay-applyment-flow.tsx`
  - 四阶段按钮、Progress 和上一步/下一步整体移除；提交动作迁入单页底部。

---

### Task 1: 用失败测试锁定单页结构

**Files:**
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`

- [x] **Step 1: 将四阶段结构测试改为单页结构测试**

新增以下核心断言：

```ts
expect(singlePageSource).toContain("营业执照");
expect(singlePageSource).toContain("法人身份证");
expect(singlePageSource).toContain("联系信息");
expect(singlePageSource).toContain("结算账户");
expect(singlePageSource).toContain("经营资料");
expect(singlePageSource).toContain("提交平台审核");
expect(singlePageSource).not.toContain("<Progress");
expect(singlePageSource).not.toContain("上一步");
expect(singlePageSource).not.toContain("下一步");
expect(panelSource).not.toContain("FinanceWechatPayApplymentEvents");
```

补充身份证布局断言：

```ts
expect(documentSectionSource).toContain("md:grid-cols-2");
expect(documentSectionSource).toContain(
  "legal_representative_id_card_front",
);
expect(documentSectionSource).toContain(
  "legal_representative_id_card_back",
);
```

- [x] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --dir apps/admin exec bun test \
  components/finance/finance-wechat-pay-applyment-page-layout.test.ts
```

Expected: FAIL，因为单页组件尚不存在，旧流程仍包含 Progress 和阶段导航。

- [x] **Step 3: 提交测试基线**

```bash
git add apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
git commit -m "test(payment): 定义进件单页结构契约"
```

---

### Task 2: 建立资料组和内联 OCR 组件

**Files:**
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-document-section.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-attachments.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-ocr-review.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-recognized-fields.tsx`
- Test: `apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`

- [x] **Step 1: 导出附件槽输入模型**

在附件组件中导出：

```ts
export type ApplymentAttachmentSlotDefinition = {
  category: WechatPayApplymentAttachmentCategory;
  required: boolean;
  description: string;
};
```

将当前私有 `AttachmentSlot` 改为可复用导出组件，并让完整附件列表继续复用它，避免复制上传逻辑。

- [x] **Step 2: 导出指定类别的 OCR 核对内容**

增加组件接口：

```ts
export type ApplymentInlineOcrReviewProps = {
  category: WechatPayApplymentAttachmentCategory;
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
  contactType: string;
  subjectType: string;
  values: Readonly<Record<string, string>>;
  comparisonValues: Readonly<Record<string, string>>;
  fieldSources: Readonly<Record<string, ApplymentFieldSource>>;
  disabled?: boolean;
  onManualChange: (key: string, value: string) => void;
  onApply: (
    category: WechatPayApplymentAttachmentCategory,
    rows: readonly OcrFieldReviewRow[],
  ) => void | Promise<void>;
  onUseManualEntry: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void | Promise<void>;
};
```

该组件直接渲染当前类别的 warning、识别字段和冲突选择，不再包含类别 `Select`。

- [x] **Step 3: 创建资料组组件**

资料组组件接受标题、说明和一个或两个附件类别：

```ts
type DocumentSectionProps = {
  title: string;
  description: string;
  slots: readonly ApplymentAttachmentSlotDefinition[];
  reviewCategories: readonly WechatPayApplymentAttachmentCategory[];
  attachmentController: ApplymentAttachmentController;
  ocrController: ApplymentOcrController;
};
```

身份证组使用：

```tsx
<div className="grid gap-3 md:grid-cols-2">
  {slots.map((slot) => (
    <WechatPayApplymentAttachmentSlot key={slot.category} {...slotProps} />
  ))}
</div>
```

识别字段放在附件行之后，并以 `Separator` 与上传区分隔。

- [x] **Step 4: 运行结构测试**

Run:

```bash
pnpm --dir apps/admin exec bun test \
  components/finance/finance-wechat-pay-applyment-page-layout.test.ts
```

Expected: 资料组相关断言通过，完整单页测试仍因尚未接线而失败。

- [x] **Step 5: 提交资料组**

```bash
git add \
  apps/admin/components/finance/finance-wechat-pay-applyment-document-section.tsx \
  apps/admin/components/finance/finance-wechat-pay-applyment-attachments.tsx \
  apps/admin/components/finance/finance-wechat-pay-applyment-ocr-review.tsx \
  apps/admin/components/finance/finance-wechat-pay-applyment-recognized-fields.tsx
git commit -m "refactor(payment): 内联进件证照识别核对"
```

---

### Task 3: 将补充资料拆为三个单页区

**Files:**
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-supplement-fields.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-review.tsx`
- Test: `apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`

- [x] **Step 1: 拆分字段分组**

导出三个组件：

```ts
export function FinanceWechatPayApplymentContactFields(...)
export function FinanceWechatPayApplymentSettlementFields(...)
export function FinanceWechatPayApplymentBusinessFields(...)
```

保持所有字段 `name`、默认值、敏感占位符和 `onDataChange` 行为不变。

- [x] **Step 2: 缩减提交确认组件**

保留 `submission_readiness.blockers`、必传附件计数和真实性确认，删除四组重复摘要及“返回修改”按钮。

阻断项改为锚点定位：

```tsx
<Button
  type="button"
  variant="ghost"
  onClick={() => document.getElementById(blocker.targetId)?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  })}
>
  {blocker.label}
</Button>
```

若 blocker 暂无可靠目标 ID，则只显示说明，不猜测字段归属。

- [x] **Step 3: 运行测试**

Run:

```bash
pnpm --dir apps/admin exec bun test \
  components/finance/finance-wechat-pay-applyment-page-layout.test.ts
```

Expected: 字段分组和精简提交区断言通过。

- [x] **Step 4: 提交字段分组**

```bash
git add \
  apps/admin/components/finance/finance-wechat-pay-applyment-supplement-fields.tsx \
  apps/admin/components/finance/finance-wechat-pay-applyment-review.tsx \
  apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
git commit -m "refactor(payment): 收敛进件补充和提交区"
```

---

### Task 4: 接入单页并移除阶段导航和处理记录

**Files:**
- Create: `apps/admin/components/finance/finance-wechat-pay-applyment-single-page.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-workflow.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-panel.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-validation.ts`
- Delete: `apps/admin/components/finance/finance-wechat-pay-applyment-flow.tsx`
- Delete: `apps/admin/components/finance/use-wechat-pay-applyment-stage-navigation.ts`
- Delete: `apps/admin/components/finance/finance-wechat-pay-applyment-events.tsx`
- Test: `apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`

- [x] **Step 1: 创建单页编排**

单页组件按以下顺序渲染：

```tsx
<ApplymentIdentitySection />
<ApplymentDocumentSection id="license-materials" />
<ApplymentDocumentSection id="legal-id-materials" />
{contactType === "SUPER" ? (
  <ApplymentDocumentSection id="contact-id-materials" />
) : null}
<FinanceWechatPayApplymentContactFields />
<ApplymentSettlementSection />
<FinanceWechatPayApplymentBusinessFields />
<FinanceWechatPayApplymentReview />
<FinanceWechatPayApplymentActions />
```

营业执照只对应营业执照类别；身份证资料组传入正反面两个类别；结算区先显示结算账户证明，
再显示结算字段。

- [x] **Step 2: 将完整表单校验改为单页定位**

保留 `findFirstInvalidApplymentControl`，新增：

```ts
export function validateApplymentForm(
  form: HTMLFormElement,
  activateOcrCategory: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void,
) {
  const invalid = findFirstInvalidApplymentControl(form);
  if (!invalid) return true;
  revealInvalidElement(invalid, () => undefined, activateOcrCategory);
  return false;
}
```

定位逻辑只负责滚动和聚焦，不再切换阶段。

- [x] **Step 3: 精简 Panel 状态**

删除：

```ts
useWechatPayApplymentStageNavigation(...)
handleStageChange(...)
handleNextStage(...)
handleReviewNavigation(...)
```

提交时改为：

```ts
validate: () => {
  const form = formRef.current;
  return Boolean(form && validateApplymentForm(
    form,
    setOcrReviewCategory,
  ));
},
```

表单布局改为单列，删除：

```tsx
<FinanceWechatPayApplymentEvents events={data.events} />
```

- [x] **Step 4: 删除阶段专用组件并清理引用**

确认 `rg` 无引用后删除 flow、stage navigation 和 events 文件。保留 flow model 中仍被资料状态
使用的类型和纯函数，不为删除文件顺带重写资料状态机。

- [x] **Step 5: 运行单页结构测试和 Admin 检查**

Run:

```bash
pnpm --dir apps/admin exec bun test \
  components/finance/finance-wechat-pay-applyment-page-layout.test.ts
pnpm --dir apps/admin check
```

Expected: 测试 PASS，file-size 和 TypeScript 检查 PASS。

- [x] **Step 6: 提交单页接线**

```bash
git add apps/admin/components/finance
git commit -m "refactor(payment): 重构租户进件为单页表单"
```

---

### Task 5: 回归与浏览器验收

**Files:**
- Modify when needed: `apps/admin/components/finance/*.test.ts`
- Modify when needed: `apps/admin/e2e/wechat-pay-applyment*.spec.ts`
- Update: `docs/superpowers/specs/2026-07-24-wechat-pay-applyment-single-page-design.md`

- [x] **Step 1: 运行相关单元测试**

Run:

```bash
pnpm --dir apps/admin exec bun test \
  components/finance/finance-wechat-pay-applyment-*.test.ts \
  components/finance/use-wechat-pay-applyment-*.test.ts
```

Expected: PASS。

- [x] **Step 2: 运行 Admin 静态检查**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: PASS。

- [x] **Step 3: 启动本地 Admin 并执行浏览器 smoke**

在 API 可用的前提下打开：

```text
http://localhost:3010/finance/wechat-pay/applyment
```

验证：

- 360px：所有资料组单列，无横向滚动。
- 768px：身份证正反面可读，字段无截断。
- 1280px：单列主工作区不过宽，不出现处理记录。
- 上传、预览、替换、OCR 状态、手动修改、保存和提交阻断均可操作。
- 控制台无 hydration、React key 和网络异常。

- [x] **Step 4: 更新规格状态**

将设计规格状态改为：

```md
> 状态：已实现并验收
```

- [x] **Step 5: 最终提交**

```bash
git add \
  apps/admin \
  docs/superpowers/specs/2026-07-24-wechat-pay-applyment-single-page-design.md
git commit -m "test(payment): 验收进件单页重构"
```
