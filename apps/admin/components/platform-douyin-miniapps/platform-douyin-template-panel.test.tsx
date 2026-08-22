import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PlatformDouyinTemplatePanel } from "./platform-douyin-template-panel";
import type { PlatformDouyinTemplateStatus } from "./platform-douyin-template-rules";

const status: PlatformDouyinTemplateStatus = {
  template_app_id: "tt0d647bd99301341b01",
  latest_draft: {
    version: "0.1.4",
    description: "修复模板确认页面",
    created_at: 1_786_608_000,
  },
  current_template: {
    id: "00000000-0000-4000-8000-000000000001",
    source_draft_id: "78149",
    template_id: "78149",
    template_version: "0.1.3",
    description: "图片更新",
    channel: "default",
    confirmed_at: "2026-08-13T11:53:09.793818+00:00",
  },
  is_latest_confirmed: false,
};

describe("PlatformDouyinTemplatePanel", () => {
  test("renders template controls without constraining the card width", () => {
    const html = renderToStaticMarkup(
      <PlatformDouyinTemplatePanel initialError={null} initialStatus={status} />,
    );

    expect(html).toContain("w-full");
    expect(html).not.toContain("max-w-4xl");
  });

  test("keeps the platform template page scrollable inside the admin shell", async () => {
    const pageSource = await Bun.file(
      "app/(console)/platform/douyin-miniapps/page.tsx",
    ).text();

    expect(pageSource).toContain("h-full");
    expect(pageSource).toContain("min-h-0");
    expect(pageSource).toContain("overflow-y-auto");
    expect(pageSource).toContain("[scrollbar-gutter:stable]");
  });

  test("does not cap either platform douyin panel below the content width", async () => {
    const [templateSource, releaseSource] = await Promise.all([
      Bun.file(
        "components/platform-douyin-miniapps/platform-douyin-template-panel.tsx",
      ).text(),
      Bun.file(
        "components/platform-douyin-miniapps/platform-douyin-release-audit-panel.tsx",
      ).text(),
    ]);

    expect(templateSource).not.toContain("max-w-4xl");
    expect(releaseSource).not.toContain("max-w-4xl");
    expect(templateSource).toContain('<Card className="w-full shadow-none">');
    expect(releaseSource).toContain('<Card className="w-full shadow-none">');
  });

  test("renders an explicit action to fetch the latest provider template", () => {
    const html = renderToStaticMarkup(
      <PlatformDouyinTemplatePanel initialError={null} initialStatus={status} />,
    );

    expect(html).toContain("获取最新模板");
    expect(html).toContain("上传新草稿后，先获取最新模板状态");
  });

  test("uses a read-only refresh request for the latest template state", async () => {
    const source = await Bun.file(
      "components/platform-douyin-miniapps/platform-douyin-template-panel.tsx",
    ).text();

    expect(source).toContain("refreshTemplateStatus");
    expect(source).toContain(
      'requestBackendJson<PlatformDouyinTemplateStatus>(',
    );
    expect(source).toContain(
      '"/platform/douyin-miniapps/deployable-template?channel=default"',
    );
    expect(source).toContain('fallbackMessage: "获取抖音模板状态失败"');
    expect(source).not.toContain(
      'method: "GET"',
    );
  });
});
