import { expect, test } from "bun:test";

const readSource = (relativePath: string) =>
  Bun.file(`${__dirname}/${relativePath}`).text();

test("global shell imports semantic styles and contains no terracotta tab accent", async () => {
  const [appStyle, appConfig, theme, ...icons] = await Promise.all([
    readSource("app.ttss"),
    readSource("app.json"),
    readSource("components/theme.ts"),
    ...["home", "cases", "budget", "lead"].flatMap((name) => [
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

test("case and site cards lazy load media and expose native press feedback", async () => {
  const [caseTemplate, siteTemplate] = await Promise.all([
    readSource("components/case-card/index.ttml"),
    readSource("components/site-card/index.ttml"),
  ]);
  for (const template of [caseTemplate, siteTemplate]) {
    expect(template).toContain('lazy-load="true"');
    expect(template).toContain('hover-class="ui-pressable--pressed"');
    expect(template).toContain("primaryColor");
  }
});

test("site cards keep a compact 240rpx square media layout", async () => {
  const style = await readSource("components/site-card/index.ttss");
  expect(style).toMatch(/\.site\s*\{[^}]*height:\s*240rpx/);
  expect(style).toMatch(
    /\.site-image\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*240rpx[^}]*height:\s*240rpx/,
  );
  expect(style).toMatch(/\.site-skeleton\s*\{[^}]*height:\s*192rpx/);
});

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

test("hero collapses the reserved media column when no image is visible", async () => {
  const [template, style] = await Promise.all([
    readSource("components/hero-banner/index.ttml"),
    readSource("components/hero-banner/index.ttss"),
  ]);
  expect(template).toContain(
    "{{imageUrl && !imageFailed ? 'hero--with-image' : 'hero--without-image'}}",
  );
  expect(style).toMatch(/\.hero--without-image \.hero-content\s*\{[^}]*max-width:\s*none/);
  expect(style).toMatch(/\.hero--without-image \.hero-action\s*\{[^}]*width:\s*100%/);
});

test("unified projects bind authoritative phase and paginated detail actions", async () => {
  const [template, pageSource, pageConfig, detailTemplate, detailConfig, homeTemplate] = await Promise.all([
    readSource("pages/cases/index.ttml"),
    readSource("pages/cases/index.ts"),
    readSource("pages/cases/index.json"),
    readSource("pages/case-detail/index.ttml"),
    readSource("pages/case-detail/index.json"),
    readSource("pages/home/index.ttml"),
  ]);
  expect(template).not.toContain("page-kicker");
  expect(template).toContain('bindtap="onSelectPhase"');
  expect(template).not.toContain("更多筛选");
  expect(template).not.toContain("onSelectStyle");
  expect(template).not.toContain("onSelectLayout");
  expect(template).not.toContain("onClearFilters");
  expect(template).toContain('primary-color="{{primaryColor}}"');
  expect(pageSource).toContain('onPullDownRefresh()');
  expect(pageSource).toContain('void this.load("refresh")');
  expect(pageSource).toContain('onRetry() { void this.load("retry"); }');
  expect(pageConfig).toContain('"pagination-loader"');
  expect(pageConfig).toContain('"empty-state"');
  expect(pageConfig).toContain('"error-state"');
  expect(detailTemplate).toContain('bindloadmore="onLoadMoreProgress"');
  expect(detailTemplate).toContain('bindretry="onRetryProgress"');
  expect(detailConfig).toContain('"pagination-loader"');
  expect(homeTemplate.match(/<case-card/g)).toHaveLength(1);
  expect(homeTemplate).not.toContain("<site-card");
});

test("project detail bounds long public copy with existing overflow patterns", async () => {
  const style = await readSource("pages/case-detail/index.ttss");
  for (const className of [
    "detail-title",
    "fact-value",
    "progress-title",
  ]) {
    expect(style).toMatch(new RegExp(`\\.${className}\\s*\\{[^}]*max-height:[^}]*overflow:\\s*hidden`));
  }
  expect(style).toMatch(/\.description-copy\s*\{[^}]*overflow:\s*hidden/);
  expect(style).not.toMatch(/\.description-copy\s*\{[^}]*max-height:/);
  expect(style).toMatch(
    /\.detail-location\s*\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/,
  );
});

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

test("lead form labels every input and keeps optional details collapsed", async () => {
  const [pageTemplate, pageStyle, formTemplate, smsTemplate, consentTemplate, consentStyle] = await Promise.all([
    readSource("pages/lead/index.ttml"),
    readSource("pages/lead/index.ttss"),
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
    "期望量房日期",
    "期望量房时段",
    "装修需求",
  ]) {
    expect(`${formTemplate}\n${smsTemplate}`).toContain(`aria-label="${label}"`);
  }
  expect(formTemplate).toContain("补充装修需求（选填）");
  expect(formTemplate).toContain('tt:if="{{optionalDetailsExpanded}}"');
  expect(formTemplate.match(/<button[^>]*class="period-option/g)).toHaveLength(3);
  expect(formTemplate.match(/<view[^>]*class="period-option(?:\s|")/g)).toBeNull();
  expect(formTemplate.match(/role="radio"/g)).toHaveLength(3);
  expect(formTemplate.match(/aria-checked=/g)).toHaveLength(3);
  expect(formTemplate.match(/disabled="{{submitting}}"/g)?.length ?? 0)
    .toBeGreaterThanOrEqual(8);
  expect(pageTemplate).toContain("验证码仅用于确认本次联系，不会用于其他用途");
  expect(pageTemplate).not.toContain("平台不会在客户端读取抖音账号绑定手机号");
  expect(pageStyle).toMatch(/\.security-note \{[^}]*white-space:\s*nowrap;/);
  expect(pageStyle).toMatch(/\.security-note \{[^}]*font-size:\s*21rpx;/);
  expect(consentTemplate).toContain('<view class="consent-row"');
  expect(consentTemplate).toContain('class="consent-toggle ui-pressable"');
  expect(consentTemplate).toContain('catchtap="onOpenPolicy"');
  expect(consentTemplate).not.toMatch(
    /<button[^>]*class="consent-row[\s\S]*class="policy-link"/,
  );
  expect(consentStyle).toMatch(/min-height:\s*88rpx/);
});

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

test("primary mini-program surfaces contain no fixed terracotta brand palette", async () => {
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
    "pages/budget/index.ts",
    "pages/budget/index.ttml",
    "pages/budget/index.ttss",
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
