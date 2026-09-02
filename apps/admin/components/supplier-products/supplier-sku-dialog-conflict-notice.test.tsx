import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SupplierSkuDialogConflictNotice } from
  "./supplier-sku-dialog-conflict-notice";

describe("SupplierSkuDialogConflictNotice", () => {
  test("说明已刷新且用户输入保留", () => {
    const html = renderToStaticMarkup(
      <SupplierSkuDialogConflictNotice refreshFailed={false} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("数据已更新");
    expect(html).toContain("你填写的内容已保留");
    expect(html).not.toContain("<button");
  });

  test("刷新失败时提供可访问的重试命令", () => {
    const html = renderToStaticMarkup(
      <SupplierSkuDialogConflictNotice
        refreshFailed
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain("最新版本加载失败");
    expect(html).toContain("刷新最新版本");
    expect(html).toContain("lucide-refresh-cw");
  });
});
