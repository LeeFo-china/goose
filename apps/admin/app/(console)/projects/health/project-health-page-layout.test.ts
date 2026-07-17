import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeDir = new URL(".", import.meta.url).pathname;
const adminRoot = join(routeDir, "../../../..");
const componentDir = join(adminRoot, "components/project-health");

function readRouteFile(fileName: string) {
  return readFileSync(join(routeDir, fileName), "utf8");
}

function readComponentFile(fileName: string) {
  return readFileSync(join(componentDir, fileName), "utf8");
}

describe("project health page layout contract", () => {
  test("keeps the page inside a fixed admin workspace", () => {
    const page = readRouteFile("page.tsx");
    const shell = readComponentFile("project-health-client-shell.tsx");

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(page).toContain("ProjectHealthClientShell");
    expect(page).not.toContain("headerIcon=");
    expect(shell).toContain('<h1 className="sr-only">项目风险</h1>');
    expect(shell).not.toContain("ShieldAlert");
    expect(shell).not.toContain("text-xl font-semibold tracking-normal");
    expect(shell).not.toContain("聚合流程、施工、日志、验收和客服风险");
  });

  test("uses one card workspace with fixed table viewport and footer", () => {
    const shell = readComponentFile("project-health-client-shell.tsx");

    expect(shell).toContain("CardHeader");
    expect(shell).toContain("CardContent");
    expect(shell).toContain("CardFooter");
    expect(shell).toContain('data-testid="project-health-table-viewport"');
    expect(shell).toContain("min-h-0 flex-1 overflow-auto");
    expect(shell).not.toContain("bg-gradient");
    expect(shell).not.toContain("backdrop-blur");
    expect(shell).not.toContain("text-transparent");
  });

  test("uses approved local admin UI primitives", () => {
    const filters = readComponentFile("project-health-filters.tsx");
    const table = readComponentFile("project-health-table.tsx");
    const shell = readComponentFile("project-health-client-shell.tsx");
    const loading = readRouteFile("loading.tsx");

    expect(filters).toContain("@/components/ui/input");
    expect(filters).toContain("@/components/ui/select");
    expect(filters).toContain("@/components/ui/button");
    expect(table).toContain("@/components/admin/data-table");
    expect(shell).toContain("@/components/admin/status-alert");
    expect(loading).toContain("@/components/ui/skeleton");
    expect(loading).not.toContain("Loader2");
  });

  test("keeps loading aligned with project health tabs and labeled filters", () => {
    const loading = readRouteFile("loading.tsx");

    expect(loading).toContain('data-testid="project-section-tabs-loading"');
    expect(loading).toContain("h-auto min-w-max justify-start gap-5");
    expect(loading).toContain(
      "md:grid-cols-[minmax(220px,1fr)_160px_180px_auto_auto]",
    );
    expect(loading).toContain('data-testid="project-health-filter-loading"');
    expect(loading).toContain("flex min-w-0 flex-col gap-1");
    expect(loading).not.toContain("ShieldAlert");
    expect(loading).not.toContain("md:grid-cols-[1fr_160px_180px_auto_auto]");
  });

  test("keeps ai summary as an explicit client action", () => {
    const page = readRouteFile("page.tsx");
    const shell = readComponentFile("project-health-client-shell.tsx");
    const aiPanel = readComponentFile("project-health-ai-summary.tsx");

    expect(page).not.toContain("ai-summary");
    expect(shell).toContain("fetchProjectHealthAiSummary");
    expect(shell).toContain("const [aiSummary");
    expect(shell).toContain("const [aiError");
    expect(shell).toContain("const [isAiLoading");
    expect(shell).toContain("const aiRequestRef = useRef<AbortController | null>(null)");
    expect(shell).toContain("const aiRequestIdRef = useRef(0)");
    expect(shell).toContain("handleGenerateAiSummary");
    expect(shell).toContain("setAiSummary(null)");
    expect(shell).toContain("setAiError(null)");
    expect(shell).toContain("<ProjectHealthAiSummary");
    expect(aiPanel).toContain('aria-live="polite"');
    expect(aiPanel).toContain("AI 经营摘要");
    expect(aiPanel).toContain("仅供处理排序参考");
    expect(aiPanel).toContain("@/components/admin/status-alert");
    expect(aiPanel).not.toContain("bg-gradient");
    expect(aiPanel).not.toContain("text-transparent");
    expect(aiPanel).not.toContain("backdrop-blur");
  });
});
