import { expect, test } from "bun:test";

const readSource = (relativePath: string) =>
  Bun.file(`${__dirname}/${relativePath}`).text();

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

test("cases exposes a compact header and one-step filter reset", async () => {
  const template = await readSource("pages/cases/index.ttml");
  expect(template).not.toContain("page-kicker");
  expect(template).toContain('bindtap="onClearFilters"');
  expect(template).toContain('bindaction="onClearFilters"');
  expect(template).toContain('primary-color="{{primaryColor}}"');
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
  expect(consentStyle).toMatch(/min-height:\s*88rpx/);
});
