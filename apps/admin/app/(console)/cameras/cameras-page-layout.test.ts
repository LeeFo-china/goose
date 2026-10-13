import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readCamerasSources() {
  return {
    page: readFileSync(new URL("./page.tsx", import.meta.url), "utf8"),
    loading: readFileSync(new URL("./loading.tsx", import.meta.url), "utf8"),
    tabs: readFileSync(
      new URL("../../../components/cameras/cameras-workspace-tabs.tsx", import.meta.url),
      "utf8",
    ),
  };
}

describe("cameras page layout contract", () => {
  test("keeps the camera workspace inside the fixed admin viewport", () => {
    const { loading, page, tabs } = readCamerasSources();

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(page).toContain("CamerasWorkspaceTabs");

    expect(loading).toContain("h-[calc(100vh-6.5625rem)]");
    expect(loading).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(loading).toContain(
      'Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none"',
    );
    expect(tabs).toContain(
      'Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none"',
    );
  });

  test("starts the camera workspace with tabs instead of duplicate global actions", () => {
    const { loading, page, tabs } = readCamerasSources();

    expect(page).toContain('<h1 className="sr-only">工地监控</h1>');
    expect(page).not.toContain("actions={headerAction}");
    expect(page).not.toContain("summary={(");
    expect(page).not.toContain("truncate text-xl font-semibold tracking-normal");
    expect(page).not.toContain("维护项目摄像头、客户可见权限和设备资产接入。");
    expect(page).not.toContain(
      "flex size-10 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground",
    );

    expect(tabs).not.toContain("actions?: ReactNode");
    expect(tabs).not.toContain("summary?: ReactNode");
    expect(tabs).toContain("className={adminTabsListClassName}");
    expect(tabs).not.toContain("ml-5");

    expect(loading).not.toContain("size-10 shrink-0");
    expect(loading).not.toContain("h-6 w-32");
    expect(loading).toContain("adminTabsListClassName");
  });

  // Binding context and entry behavior are exercised by cameras-workspace.spec.ts.
});
