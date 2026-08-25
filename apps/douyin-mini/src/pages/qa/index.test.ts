import { describe, expect, test } from "bun:test";

const read = (name: string) => Bun.file(`${__dirname}/${name}`).text();

describe("Douyin Q&A page", () => {
  test("registers a native page with safe question presets and lead CTA", async () => {
    const [source, pageSource, template, style, config, appConfig, navigation, models] =
      await Promise.all([
        read("index.ts"),
        read("qa-page.ts"),
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
    expect(source).toContain("createQaPageDefinition");
    expect(source).toContain("askDecorationQuestion");
    expect(source).toContain("switchToTab");
    expect(pageSource).toContain('dependencies.switchToTab("lead")');
    expect(source).toContain("getApp<DouyinAppContext>()");
    expect(pageSource).toContain("attribution: app.launchContext");
    expect(pageSource).toContain("requestSequence");
    expect(pageSource).toContain("if (this.requestSequence !== sequence) return;");
    expect(pageSource).toContain("beginAnswerStream");
    expect(pageSource).toContain("appendAnswerChunk");
    expect(pageSource).toContain("finishAnswerStream");
    expect(pageSource).toContain("typingTimer");
    expect(pageSource).toContain("clearTypingTimer()");
    expect(pageSource).toContain("onUnload()");
    expect(template).toContain("装修问题助手");
    expect(template).toContain("qa-chat");
    expect(template).toContain("qa-composer");
    expect(template).toContain('maxlength="120"');
    expect(template).toContain('<form class="qa-composer" bindsubmit="onSubmit">');
    expect(template).toContain('name="question"');
    expect(template).toContain('show-confirm-bar="{{false}}"');
    expect(template).toContain('confirm-type="send"');
    expect(template).toContain('fixed="{{true}}"');
    expect(template).toContain('adjust-position="{{true}}"');
    expect(template).toContain('cursor-spacing="24"');
    expect(template).toContain('bindconfirm="onQuestionConfirm"');
    expect(template).toContain('form-type="submit"');
    expect(template).not.toContain('bindtap="onSubmit"');
    expect(template).not.toContain('loading="{{status === \'submitting\'}}"');
    expect(template).toContain('submit-button__spinner');
    expect(template).toContain('submit-button__label');
    expect(template).toContain('bindtap="onBookMeasurement"');
    expect(template).toContain('role="status"');
    expect(template).toContain("typing-dot");
    expect(template).not.toContain("参考建议");
    expect(template).not.toContain("ui-card");
    expect(template).not.toContain("15518591857");
    expect(template).not.toContain("直接联系公司");
    expect(config).toContain('"navigationBarTitleText": "装修问题助手"');
    expect(style).toContain(".message--assistant");
    expect(style).toContain(".qa-composer");
    expect(style).toContain("white-space: nowrap");
    expect(style).toContain("@keyframes qaSubmitSpin");
    expect(style).toContain("@keyframes qaTypingPulse");
    expect(style).not.toContain(":nth-child");
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
