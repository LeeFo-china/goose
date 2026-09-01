import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SupplierSkuDialogLoadError } from "./supplier-sku-dialog-load-error";

describe("SupplierSkuDialogLoadError", () => {
  test("渲染可感知的内联错误和带刷新图标的 retry 命令", () => {
    const markup = renderToStaticMarkup(
      <SupplierSkuDialogLoadError
        message="规格模板加载失败"
        onRetry={() => undefined}
      />,
    );

    expect(markup).toContain("role=\"alert\"");
    expect(markup).toContain("SKU 表单资料加载失败");
    expect(markup).toContain("规格模板加载失败");
    expect(markup).toContain("lucide-refresh-cw");
    expect(markup).toContain("重新加载");
  });
});
