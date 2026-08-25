import { describe, expect, test } from "bun:test";

const read = (name: string) => Bun.file(`${__dirname}/${name}`).text();

describe("Douyin Q&A page", () => {
  test("registers a native page with safe question presets and lead CTA", async () => {
    const [source, template, style, config, appConfig, navigation, models] =
      await Promise.all([
        read("index.ts"),
        read("index.ttml"),
        read("index.ttss"),
        read("index.json"),
        Bun.file(`${__dirname}/../../app.json`).text(),
        Bun.file(`${__dirname}/../../platform/navigation.ts`).text(),
        Bun.file(`${__dirname}/../../models/index.ts`).text(),
      ]);

    expect(appConfig).toContain('"pages/qa/index"');
    expect(navigation).toContain('"pages/qa/index"');
    expect(models).toContain('"pages/qa/index"');
    expect(source).toContain("askDecorationQuestion");
    expect(source).toContain('switchToTab("lead")');
    expect(source).toContain("const app = getApp<DouyinAppContext>();");
    expect(source).toContain("attribution: app.launchContext");
    expect(source).toContain("requestSequence");
    expect(source).toContain("if (this.requestSequence !== sequence) return;");
    expect(source).toContain("onUnload()");
    expect(template).toContain("装修问题助手");
    expect(template).toContain("常见问题");
    expect(template).toContain('maxlength="120"');
    expect(template).toContain('bindtap="onSubmit"');
    expect(template).toContain('bindtap="onBookMeasurement"');
    expect(template).toContain('role="status"');
    expect(template).not.toContain("15518591857");
    expect(template).not.toContain("直接联系公司");
    expect(config).toContain('"navigationBarTitleText": "装修问题助手"');
    expect(style).toMatch(/min-height:\s*88rpx/);
  });

  test("home exposes one AI Q&A card without duplicating the budget hero", async () => {
    const [homeSource, homeTemplate, homeStyle] = await Promise.all([
      Bun.file(`${__dirname}/../home/index.ts`).text(),
      Bun.file(`${__dirname}/../home/index.ttml`).text(),
      Bun.file(`${__dirname}/../home/index.ttss`).text(),
    ]);

    expect(homeSource).toContain("onAskQuestion()");
    expect(homeSource).toContain('navigateToPage("pages/qa/index")');
    expect(homeTemplate).toContain("装修问题助手");
    expect(homeTemplate).toContain("不确定先问什么，可以从常见装修问题开始");
    expect(homeTemplate.match(/开始预算初算/g)).toHaveLength(1);
    expect(homeTemplate).not.toContain("更多服务数据正在完善");
    expect(homeStyle).toContain(".qa-card");
  });
});
