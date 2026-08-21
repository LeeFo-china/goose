import { expect, test } from "bun:test";

const read = (name: string) => Bun.file(`${__dirname}/${name}`).text();

test("budget page registers native handlers and mutually exclusive states", async () => {
  const [source, template, config] = await Promise.all([
    read("index.ts"),
    read("index.ttml"),
    read("index.json"),
  ]);

  for (const handler of [
    "onShow()",
    "onHide()",
    "onPullDownRefresh()",
    "onRetryConfig()",
    "onAreaInput(",
    "onSelectChoice(",
    "onToggleOption(",
    "onCalculate()",
    "onRetryAi()",
    "onBookMeasurement()",
    "onUnload()",
  ]) expect(source).toContain(handler);
  expect(source).toContain("fetchBudgetConfig");
  expect(source).toContain("createBudgetEstimate");
  expect(source).toContain("fetchBudgetAiAnalysis");
  expect(source).toContain("const pending = beginConfigLoad(this.pageState);");
  expect(source).toContain("applyBudgetFormMutation");
  expect(source).toContain("resolveConfigLoadResult");
  expect(source).toContain("aiPolling.cancel()");
  expect(source).toContain("BudgetAiAnalysisRunner");
  expect(source).toContain("BudgetPageLifecycleCoordinator");
  expect(source).toContain("consumeBudgetResultReturnIntent");
  expect(source).toContain("shouldPreserveBudgetResultOnReturn");
  expect(source).toContain("shouldResumeBudgetAiOnReturn");
  expect(source).toContain("this.loadAi(estimateId, false)");
  expect(source).toContain("this.suspendPage()");
  expect(source.match(/this\.commitFormMutation\(/g)).toHaveLength(4);
  expect(source).toContain("if (!resolution.accepted) return;");
  expect(source).toContain("resolution.state.config");
  expect(source).toContain('switchToTab("lead")');
  expect(template).toContain('tt:if="{{status === \'loading_config\'}}"');
  expect(template).toContain('tt:elif="{{status === \'unavailable\'}}"');
  expect(template).toContain('tt:else');
  expect(template).toContain('aria-label="建筑面积"');
  expect(template).toContain('aria-label="个性需求"');
  expect(template).toContain('role="radio"');
  expect(template).toContain('role="checkbox"');
  expect(template.match(/placeholder-style="color: #706C67;"/g)).toHaveLength(4);
  expect(template).not.toContain("indexOf(");
  expect(template).not.toContain("{{estimate.id}}");
  expect(template).toContain("{{estimate.estimate_no}}");
  expect(template).toContain("报价版本 {{resultPricingVersion}}");
  expect(template).toContain("{{resultEffectivePeriod}}");
  expect(config).toContain('"enablePullDownRefresh": true');
  expect(config).toContain('"page-skeleton"');
  expect(config).toContain('"empty-state"');
  expect(source.split("\n").length).toBeLessThanOrEqual(300);
});

test("budget result keeps estimate, AI and disclaimer hierarchy without promises", async () => {
  const [template, style] = await Promise.all([read("index.ttml"), read("index.ttss")]);
  expect(template).toContain("预算初算结果");
  expect(template).toContain("分类参考");
  expect(template).toContain("暂无分类明细");
  expect(template).toContain("包含内容");
  expect(template).toContain("未包含内容");
  expect(template).toContain("AI 预算建议");
  expect(template).toContain("{{estimate.disclaimer}}");
  expect(template).toContain('role="status"');
  expect(template).toContain('bindtap="onRetryAi"');
  expect(template).toContain("重新获取 AI 说明");
  expect(template).toContain('bindtap="onBookMeasurement"');
  expect(template).not.toMatch(/保证|确保|绝不超预算|最终报价/);
  expect(style).not.toContain("border-left");
  expect(style).not.toMatch(/border-radius:\s*(?:3[2-9]|[4-9]\d)rpx/);
  expect(style).toMatch(/min-height:\s*88rpx/);
  expect(style).toContain("white-space: normal");
  expect(style).toContain("overflow: hidden");
});

test("tab assets and navigation preserve sites as a deep link", async () => {
  const [appConfig, navigation, models, normalIcon, activeIcon] = await Promise.all([
    Bun.file(`${__dirname}/../../app.json`).text(),
    Bun.file(`${__dirname}/../../platform/navigation.ts`).text(),
    Bun.file(`${__dirname}/../../models/index.ts`).text(),
    Bun.file(`${__dirname}/../../assets/tabbar/budget.svg`).text(),
    Bun.file(`${__dirname}/../../assets/tabbar/budget-active.svg`).text(),
  ]);
  expect(appConfig).toContain('"pages/budget/index"');
  expect(appConfig).toContain('"pagePath": "pages/budget/index"');
  expect(appConfig).toContain('"text": "预算初算"');
  expect(appConfig).not.toContain('"pagePath": "pages/sites/index"');
  expect(appConfig).toContain('"pages/sites/index"');
  expect(navigation).toContain('budget: "pages/budget/index"');
  expect(navigation).toContain('"pages/sites/index"');
  expect(models).toContain('"pages/budget/index"');
  expect(normalIcon).toContain('stroke="#625F5B"');
  expect(activeIcon).toContain('stroke="#191817"');
});
