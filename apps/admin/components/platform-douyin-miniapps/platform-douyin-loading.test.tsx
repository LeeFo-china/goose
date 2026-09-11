import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import PlatformDouyinMiniappsLoading from "@/app/(console)/platform/douyin-miniapps/loading";

describe("PlatformDouyinMiniappsLoading", () => {
  test("mirrors both page sections and the two template version blocks", () => {
    const html = renderToStaticMarkup(<PlatformDouyinMiniappsLoading />);

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="抖音模板版本加载中"');
    expect(html).toContain('aria-label="商户发布审核加载中"');
    expect(html.match(/data-slot="template-version-skeleton"/g)).toHaveLength(2);
    expect(html).not.toContain("max-w-4xl");
  });
});
