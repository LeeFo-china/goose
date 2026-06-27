import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readSource(file: string) {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

describe("Project members and status lightweight layout", () => {
  test("renders members tab as lightweight sections instead of stacked cards", () => {
    const page = readSource("./project-detail-page-client.tsx");

    expect(page).toContain('activeTab === "members"');
    expect(page).toContain("<ProjectStatusPanel project={currentProject} />");
    expect(page).toContain("<ProjectMembersPanel");
    expect(page).toContain("<ProjectWorkflowRuntimePanel");
    expect(page).toContain('active={activeTab === "members"}\n                  compact');
  });

  test("uses row-based member list without card grid rows", () => {
    const membersPanel = readSource("./project-members-panel.tsx");

    expect(membersPanel).toContain('data-testid="project-members-panel"');
    expect(membersPanel).toContain('data-testid="project-member-list"');
    expect(membersPanel).toContain("divide-y");
    expect(membersPanel).not.toContain("rounded-lg border bg-card p-4");
    expect(membersPanel).not.toContain("grid gap-2 md:grid-cols-2");
    expect(membersPanel).not.toContain("rounded-md border bg-background p-3");
  });

  test("uses an inline status summary without the Card container", () => {
    const statusPanel = readSource("./project-status-panel.tsx");

    expect(statusPanel).toContain('data-testid="project-status-summary-panel"');
    expect(statusPanel).toContain("border-y bg-card");
    expect(statusPanel).not.toContain("@/components/ui/card");
    expect(statusPanel).not.toContain("<Card");
    expect(statusPanel).not.toContain("<CardHeader");
    expect(statusPanel).not.toContain("<CardContent");
  });
});
