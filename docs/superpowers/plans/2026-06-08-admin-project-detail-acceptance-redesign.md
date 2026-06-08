# Admin Project Detail Acceptance Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone tenant-side `/projects/[id]` project detail page with an acceptance-first workbench and migrate project list detail entry points away from the modal.

**Architecture:** Add a new App Router page that server-loads project detail and hands it to a focused client shell. Keep existing API helpers and business hooks, then add page-specific layout components for project dossier, URL tabs, acceptance stage list, and acceptance detail/context panels. Keep `ProjectDetailDialog` temporarily for compatibility, but make the project list navigate to the standalone page.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, shadcn/Radix primitives, lucide-react, Playwright e2e.

---

## File Structure

- Create `apps/admin/app/(console)/projects/[id]/page.tsx`: server route for standalone project detail, reads `/projects/:id`, handles missing auth/data errors.
- Create `apps/admin/components/projects/project-detail-page-client.tsx`: client shell for URL tab state, project refresh, left rail, and active module rendering.
- Create `apps/admin/components/projects/project-detail-side-rail.tsx`: compact project dossier and module navigation.
- Create `apps/admin/components/projects/project-detail-page-tabs.ts`: tab constants, parsing, and href builders.
- Create `apps/admin/components/projects/project-members-panel.tsx`: page version of member list and add-member action, extracted from the old dialog.
- Create `apps/admin/components/projects/project-acceptance-workbench.tsx`: page container for acceptance workflow.
- Create `apps/admin/components/projects/project-acceptance-stage-list.tsx`: final acceptance block plus process-stage record list.
- Create `apps/admin/components/projects/project-acceptance-context-panel.tsx`: timeline, customer notification, latest dispute/reject context.
- Modify `apps/admin/components/projects/project-acceptances-panel-state.ts`: support optional externally selected acceptance ID for URL-driven detail pages.
- Modify `apps/admin/components/projects/project-acceptances-panel-derived.ts`: expose acceptance summary counts needed by the page workbench.
- Modify `apps/admin/components/projects/project-mutations.tsx`: make row detail buttons navigate to `/projects/[id]`, keep edit/delete dialogs.
- Modify `apps/admin/components/projects/projects-table.tsx`: ensure operation column width still fits the migrated row actions.
- Modify `apps/admin/e2e/admin-smoke.spec.ts`: replace modal acceptance smoke with standalone detail page smoke.

## Task 1: Update E2E To Describe The New Detail Page

**Files:**
- Modify: `apps/admin/e2e/admin-smoke.spec.ts`

- [ ] **Step 1: Replace the modal-based project detail smoke test**

Replace the existing test named `项目详情工序验收页签可打开` with:

```ts
  test("项目详情独立页默认展示工序验收工作区", async ({ page }) => {
    await gotoAdminPage(page, "/projects");

    const detailButton = page.getByRole("link", { name: "详情" }).first();
    if (await detailButton.count()) {
      await expect(detailButton).toBeVisible();
      await detailButton.click();
      await expect(page).toHaveURL(/\/projects\/[^/?]+(?:\?tab=acceptances)?/);
      await expect(page.getByRole("heading", { name: "工序验收" })).toBeVisible();
      await expect(page.getByText("项目档案")).toBeVisible();
      await expect(page.getByText(/验收记录|暂无验收记录|当前无可发起的工序验收/)).toBeVisible();
    } else {
      await expect(page.getByText("没有符合条件的项目")).toBeVisible();
    }
  });
```

- [ ] **Step 2: Run the smoke test and verify it fails for the expected reason**

Run:

```bash
pnpm --dir apps/admin test:e2e -- admin-smoke.spec.ts -g "项目详情独立页默认展示工序验收工作区"
```

Expected: FAIL because row actions still render a button that opens `ProjectDetailDialog`, not a link to `/projects/[id]`.

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/admin/e2e/admin-smoke.spec.ts
git commit -m "test: cover standalone project detail acceptance page"
```

## Task 2: Add Route Loader And URL Tab Utilities

**Files:**
- Create: `apps/admin/app/(console)/projects/[id]/page.tsx`
- Create: `apps/admin/components/projects/project-detail-page-tabs.ts`

- [ ] **Step 1: Add tab parsing utilities**

Create `apps/admin/components/projects/project-detail-page-tabs.ts`:

```ts
export const projectDetailTabs = ["acceptances", "logs", "members", "overview"] as const;

export type ProjectDetailPageTab = (typeof projectDetailTabs)[number];

export function parseProjectDetailTab(value: string | string[] | undefined): ProjectDetailPageTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return projectDetailTabs.includes(candidate as ProjectDetailPageTab)
    ? candidate as ProjectDetailPageTab
    : "acceptances";
}

export function projectDetailHref(projectId: string, tab: ProjectDetailPageTab, acceptanceId?: string | null) {
  const params = new URLSearchParams({ tab });
  if (acceptanceId) params.set("acceptanceId", acceptanceId);
  return `/projects/${projectId}?${params.toString()}`;
}
```

- [ ] **Step 2: Add the server page**

Create `apps/admin/app/(console)/projects/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { StatusAlert } from "@/components/admin/status-alert";
import { ProjectDetailPageClient } from "@/components/projects/project-detail-page-client";
import { parseProjectDetailTab } from "@/components/projects/project-detail-page-tabs";
import type { ProjectRecord } from "@/components/projects/project-mutations";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type ProjectDetailPageParams = {
  id: string;
};

type ProjectDetailPageSearchParams = {
  tab?: string;
  acceptanceId?: string;
};

async function getProject(projectId: string) {
  const token = await getAdminToken();
  if (!token) {
    return { project: null, error: "缺少登录凭证" };
  }

  try {
    const response = await fetch(buildBackendUrl(`/projects/${projectId}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (response.status === 404) {
      return { project: null, error: null };
    }

    const payload = await parseBackendJson<ProjectRecord>(response);
    return { project: payload.data || null, error: null };
  } catch (error) {
    return {
      project: null,
      error: error instanceof Error ? error.message : "项目详情加载失败",
    };
  }
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<ProjectDetailPageParams>;
  searchParams: Promise<ProjectDetailPageSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { project, error } = await getProject(id);

  if (!project && !error) {
    notFound();
  }

  if (!project) {
    return <StatusAlert>{error || "项目不存在"}</StatusAlert>;
  }

  return (
    <ProjectDetailPageClient
      project={project}
      initialTab={parseProjectDetailTab(query.tab)}
      initialAcceptanceId={query.acceptanceId || ""}
    />
  );
}
```

- [ ] **Step 3: Run typecheck and verify the missing client failure**

Run:

```bash
pnpm --dir apps/admin typecheck
```

Expected: FAIL with `Cannot find module '@/components/projects/project-detail-page-client'`.

- [ ] **Step 4: Commit route and tab utilities**

```bash
git add 'apps/admin/app/(console)/projects/[id]/page.tsx' apps/admin/components/projects/project-detail-page-tabs.ts
git commit -m "feat: add standalone project detail route"
```

## Task 3: Build The Project Detail Page Shell And Side Rail

**Files:**
- Create: `apps/admin/components/projects/project-detail-page-client.tsx`
- Create: `apps/admin/components/projects/project-detail-side-rail.tsx`

- [ ] **Step 1: Create the side rail component**

Create `apps/admin/components/projects/project-detail-side-rail.tsx`:

```tsx
"use client";

import { ArrowLeft, MapPin, UsersRound } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import {
  customerName,
  formatDate,
  personName,
  projectDisplayStatusBadgeVariant,
  projectDisplayStatusLabel,
  propertyLabel,
  relationOne,
} from "@/components/projects/project-mutation-utils";
import type { ProjectDetailPageTab } from "@/components/projects/project-detail-page-tabs";
import { cn } from "@/lib/utils";

const navItems: Array<{ tab: ProjectDetailPageTab; label: string }> = [
  { tab: "acceptances", label: "工序验收" },
  { tab: "logs", label: "施工日志" },
  { tab: "members", label: "成员/状态" },
  { tab: "overview", label: "总览" },
];

export function ProjectDetailSideRail({
  project,
  activeTab,
  onNavigate,
}: {
  project: ProjectRecord;
  activeTab: ProjectDetailPageTab;
  onNavigate: (tab: ProjectDetailPageTab) => void;
}) {
  const property = relationOne(project.property);
  const members = project.members || [];

  return (
    <aside className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
      <div className="flex items-center justify-between gap-3">
        <Button asChild type="button" variant="ghost" size="sm" className="px-2">
          <Link href="/projects">
            <ArrowLeft data-icon="inline-start" />
            返回项目
          </Link>
        </Button>
        <Badge variant={projectDisplayStatusBadgeVariant(project)}>
          {projectDisplayStatusLabel(project)}
        </Badge>
      </div>

      <section className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">项目档案</p>
        <h1 className="mt-2 text-lg font-semibold leading-6 text-foreground">
          {project.name || "未命名项目"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          客户：{customerName(project.customer)}
        </p>
      </section>

      <section className="grid gap-2 text-sm">
        <div className="rounded-md border bg-background p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <MapPin className="size-3.5" />
            房产
          </div>
          <div className="mt-2 font-medium">{propertyLabel(project.property)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {[property?.layout, property?.area != null ? `${property.area}㎡` : null]
              .filter(Boolean)
              .join(" · ") || project.address || "位置待补全"}
          </div>
        </div>

        <div className="rounded-md border bg-background p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <UsersRound className="size-3.5" />
            负责人
          </div>
          <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
            <span>设计：{personName(project.designer)}</span>
            <span>工程：{personName(project.supervisor)}</span>
            <span>开工：{formatDate(project.start_date)}</span>
            <span>成员：{members.length} 人</span>
          </div>
        </div>
      </section>

      <nav className="grid gap-1 border-t pt-3">
        {navItems.map((item) => (
          <button
            key={item.tab}
            type="button"
            className={cn(
              "flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeTab === item.tab
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground",
            )}
            onClick={() => onNavigate(item.tab)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Create the client shell with placeholder tabs**

Create `apps/admin/components/projects/project-detail-page-client.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectDetailSideRail } from "@/components/projects/project-detail-side-rail";
import {
  projectDetailHref,
  type ProjectDetailPageTab,
} from "@/components/projects/project-detail-page-tabs";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import { requestProject } from "@/components/projects/project-mutation-utils";

export function ProjectDetailPageClient({
  project,
  initialTab,
  initialAcceptanceId,
}: {
  project: ProjectRecord;
  initialTab: ProjectDetailPageTab;
  initialAcceptanceId: string;
}) {
  const router = useRouter();
  const [currentProject, setCurrentProject] = useState(project);
  const [activeTab, setActiveTab] = useState<ProjectDetailPageTab>(initialTab);
  const [acceptanceId, setAcceptanceId] = useState(initialAcceptanceId);
  const [refreshing, startRefreshTransition] = useTransition();
  const [error, setError] = useState("");

  const title = useMemo(() => {
    if (activeTab === "logs") return "施工日志";
    if (activeTab === "members") return "成员/状态";
    if (activeTab === "overview") return "总览";
    return "工序验收";
  }, [activeTab]);

  function navigate(tab: ProjectDetailPageTab, nextAcceptanceId = "") {
    setActiveTab(tab);
    if (tab === "acceptances") setAcceptanceId(nextAcceptanceId);
    router.push(projectDetailHref(currentProject.id, tab, nextAcceptanceId));
  }

  async function refreshProject() {
    setError("");
    startRefreshTransition(async () => {
      try {
        const data = await requestProject<ProjectRecord>({
          path: `/projects/${currentProject.id}`,
        });
        setCurrentProject(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "项目详情刷新失败");
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <ProjectDetailSideRail
        project={currentProject}
        activeTab={activeTab}
        onNavigate={(tab) => navigate(tab)}
      />
      <main className="min-w-0">
        <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentProject.name || "未命名项目"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {refreshing ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在刷新
              </Badge>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={refreshProject}>
              刷新项目
            </Button>
          </div>
        </div>

        {error ? <StatusAlert>{error}</StatusAlert> : null}

        <section className="min-w-0">
          {activeTab === "acceptances" ? (
            <div data-acceptance-id={acceptanceId} className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              工序验收工作区加载中
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              {title} 模块加载中
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck and verify it passes for the shell**

Run:

```bash
pnpm --dir apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit the shell**

```bash
git add apps/admin/components/projects/project-detail-page-client.tsx apps/admin/components/projects/project-detail-side-rail.tsx
git commit -m "feat: add project detail page shell"
```

## Task 4: Add URL-Driven Acceptance Workbench State

**Files:**
- Modify: `apps/admin/components/projects/project-acceptances-panel-state.ts`
- Modify: `apps/admin/components/projects/project-acceptances-panel-derived.ts`
- Create: `apps/admin/components/projects/project-acceptance-workbench.tsx`

- [ ] **Step 1: Extend derived data with summary counts**

In `project-acceptances-panel-derived.ts`, after `finalAcceptanceBlockedReason`, add:

```ts
  const summary = {
    total: input.acceptances.length,
    completed: input.acceptances.filter((item) => item.status === "customer_confirmed").length,
    pending: input.acceptances.filter((item) => openAcceptanceStatuses.has(item.status)).length,
    blocked: selectableStageOptions.filter((item) => item.constructionStage?.blocked_reason).length,
  };
```

Add `summary` to the returned object.

- [ ] **Step 2: Add optional URL selection to the hook signature**

Change the hook signature in `project-acceptances-panel-state.ts` to:

```ts
export function useProjectAcceptancesPanel(
  project: ProjectRecord,
  active: boolean,
  options: {
    selectedAcceptanceId?: string;
    onSelectedAcceptanceIdChange?: (id: string) => void;
  } = {},
) {
```

Add this helper after the existing state declarations:

```ts
  const selectAcceptanceId = (id: string) => {
    setSelectedId(id);
    options.onSelectedAcceptanceIdChange?.(id);
  };
```

In `loadAcceptances`, replace the current `setSelectedId((current) => ...)` block with:

```ts
      const preferredId = options.selectedAcceptanceId || selectedId;
      const nextSelectedId = preferredId && list.some((item) => item.id === preferredId)
        ? preferredId
        : list[0]?.id || "";
      selectAcceptanceId(nextSelectedId);
```

Replace `setSelectedId(created.id)` in `createAcceptance` and `createFinalAcceptance` with `selectAcceptanceId(created.id)`.

Return `summary` and expose `setSelectedId: selectAcceptanceId` instead of the raw state setter.

- [ ] **Step 3: Create a page workbench wrapper**

Create `apps/admin/components/projects/project-acceptance-workbench.tsx`:

```tsx
"use client";

import { ProjectAcceptanceDetail } from "@/components/projects/project-acceptance-detail";
import { AcceptanceActionDialog } from "@/components/projects/project-acceptance-action-dialog";
import { FinalAcceptanceTemplateDialog } from "@/components/projects/project-final-acceptance-template-dialog";
import { useProjectAcceptancesPanel } from "@/components/projects/project-acceptances-panel-state";
import type { ProjectRecord } from "@/components/projects/project-mutations";
import { toast } from "sonner";
import { StatusAlert } from "@/components/admin/status-alert";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectAcceptanceWorkbench({
  project,
  active,
  acceptanceId,
  onAcceptanceIdChange,
}: {
  project: ProjectRecord;
  active: boolean;
  acceptanceId: string;
  onAcceptanceIdChange: (id: string) => void;
}) {
  const panel = useProjectAcceptancesPanel(project, active, {
    selectedAcceptanceId: acceptanceId,
    onSelectedAcceptanceIdChange: onAcceptanceIdChange,
  });

  if (panel.loading) {
    return (
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-4">
      {panel.error ? <StatusAlert>{panel.error}</StatusAlert> : null}
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          验收记录加载中
        </aside>
        <ProjectAcceptanceDetail
          selected={panel.selected}
          selectedStats={panel.selectedStats}
          selectedSections={panel.selectedSections}
          latestCustomerDispute={panel.latestCustomerDispute}
          latestRejectAction={panel.latestRejectAction}
          editable={panel.editable}
          actionLoading={panel.actionLoading}
          uploadingItemId={panel.uploadingItemId}
          setEditable={panel.setEditable}
          openActionDialog={panel.openActionDialog}
          saveAcceptance={panel.saveAcceptance}
          notifyCustomer={panel.notifyCustomer}
          updateEditableItem={panel.updateEditableItem}
          uploadImages={panel.uploadImages}
        />
      </div>
      <FinalAcceptanceTemplateDialog
        open={panel.templateDialogOpen}
        loading={panel.templateLoading}
        error={panel.templateError}
        template={panel.finalTemplate}
        onSaved={(template) => {
          panel.setFinalTemplate(template);
          toast.success("竣工模板已保存");
        }}
        onOpenChange={panel.setTemplateDialogOpen}
      />
      <AcceptanceActionDialog
        state={panel.actionDialog}
        error={panel.actionDialogError}
        loading={panel.actionLoading}
        onOpenChange={(open) => {
          if (!open) panel.closeActionDialog();
        }}
        onCommentChange={(comment) => {
          panel.setActionDialog((current) => current ? { ...current, comment } : current);
          panel.setActionDialogError("");
        }}
        onConfirm={() => {
          if (!panel.actionDialog) return;
          if (panel.actionDialog.type === "approve") {
            void panel.approveAcceptance(panel.actionDialog.acceptanceId, panel.actionDialog.comment);
            return;
          }
          if (panel.actionDialog.type === "reject") {
            void panel.rejectAcceptance(panel.actionDialog.acceptanceId, panel.actionDialog.comment);
            return;
          }
          void panel.deleteDraftAcceptance(panel.actionDialog.acceptanceId);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm --dir apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit hook and workbench state**

```bash
git add apps/admin/components/projects/project-acceptances-panel-state.ts apps/admin/components/projects/project-acceptances-panel-derived.ts apps/admin/components/projects/project-acceptance-workbench.tsx
git commit -m "feat: add page acceptance workbench state"
```

## Task 5: Build The Acceptance Stage List And Wire The Workbench

**Files:**
- Create: `apps/admin/components/projects/project-acceptance-stage-list.tsx`
- Modify: `apps/admin/components/projects/project-detail-page-client.tsx`

- [ ] **Step 1: Create the stage list component**

Create `apps/admin/components/projects/project-acceptance-stage-list.tsx`:

```tsx
"use client";

import { FileText, Loader2, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { useProjectAcceptancesPanel } from "@/components/projects/project-acceptances-panel-state";
import { formatDateTime, getAcceptanceDisplayTitle, isFinalAcceptance, statusVariant } from "@/components/projects/project-acceptance-utils";
import { cn } from "@/lib/utils";

type AcceptancePanelState = ReturnType<typeof useProjectAcceptancesPanel>;

export function ProjectAcceptanceStageList({ panel }: { panel: AcceptancePanelState }) {
  return (
    <aside className="flex min-h-0 flex-col rounded-lg border bg-card">
      <div className="border-b p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">验收记录</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              共 {panel.summary.total} 个，进行中 {panel.summary.pending} 个，已完成 {panel.summary.completed} 个
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={panel.loadAcceptances}
            disabled={panel.loading}
            aria-label="刷新验收记录"
          >
            <RefreshCw className={panel.loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      <div className="border-b p-3">
        <div className="rounded-md border bg-background p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">竣工交付验收</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {panel.finalAcceptanceBlockedReason || "施工阶段全部完成后可发起"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                onClick={panel.createFinalAcceptance}
                disabled={panel.actionLoading || !panel.canCreateFinalAcceptance}
              >
                {panel.actionLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                发起
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={panel.openTemplateDialog}
                disabled={panel.templateLoading}
              >
                <FileText data-icon="inline-start" />
                模板
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">工序验收</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {panel.firstAvailableStage
                ? `当前可发起：${panel.firstAvailableStage.label}`
                : "当前无可发起的工序验收"}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={panel.createAcceptance}
            disabled={panel.actionLoading || !panel.canCreateAcceptance}
          >
            {panel.actionLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
            发起验收
          </Button>
        </div>
        {!panel.canCreateByProjectStatus ? (
          <p className="mt-2 text-xs text-muted-foreground">仅施工中或验收中的项目可发起工序验收</p>
        ) : panel.selectedStageBlockedReason ? (
          <p className="mt-2 text-xs text-muted-foreground">{panel.selectedStageBlockedReason}</p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-gutter:stable]">
        {panel.acceptances.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            暂无验收记录。{panel.firstAvailableStage ? `可先发起${panel.firstAvailableStage.label}。` : "请先完成前置工序或检查项目状态。"}
          </div>
        ) : (
          <div className="grid gap-1.5">
            {panel.acceptances.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item.id === panel.selectedId ? "border-primary bg-accent" : "bg-background",
                )}
                onClick={() => panel.setSelectedId(item.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {getAcceptanceDisplayTitle(item)}
                  </span>
                  <Badge variant={statusVariant(item.status)}>{item.status_label}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{isFinalAcceptance(item) ? "竣工" : "工序"} · {item.items.length} 项</span>
                  <span>{formatDateTime(item.updated_at || item.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Wire the workbench into the page client**

In `project-detail-page-client.tsx`, import:

```tsx
import { ProjectAcceptanceWorkbench } from "@/components/projects/project-acceptance-workbench";
```

In `project-acceptance-workbench.tsx`, import:

```tsx
import { ProjectAcceptanceStageList } from "@/components/projects/project-acceptance-stage-list";
```

Replace the temporary workbench sidebar:

```tsx
        <aside className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          验收记录加载中
        </aside>
```

with:

```tsx
        <ProjectAcceptanceStageList panel={panel} />
```

Then replace the acceptance placeholder in `project-detail-page-client.tsx` with:

```tsx
          {activeTab === "acceptances" ? (
            <ProjectAcceptanceWorkbench
              project={currentProject}
              active={activeTab === "acceptances"}
              acceptanceId={acceptanceId}
              onAcceptanceIdChange={(id) => {
                setAcceptanceId(id);
                router.replace(projectDetailHref(currentProject.id, "acceptances", id), { scroll: false });
              }}
            />
          ) : (
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --dir apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit the stage list and workbench wiring**

```bash
git add apps/admin/components/projects/project-acceptance-stage-list.tsx apps/admin/components/projects/project-detail-page-client.tsx
git commit -m "feat: wire project acceptance workbench"
```

## Task 6: Add Page Panels For Overview, Logs, And Members

**Files:**
- Create: `apps/admin/components/projects/project-members-panel.tsx`
- Modify: `apps/admin/components/projects/project-detail-page-client.tsx`

- [ ] **Step 1: Create the members panel**

Create `apps/admin/components/projects/project-members-panel.tsx`:

```tsx
"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AddProjectMemberDialog } from "@/components/projects/project-member-dialog";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import { getEmployeeMeta, personName } from "@/components/projects/project-mutation-utils";

export function ProjectMembersPanel({
  project,
  refreshing,
  onChanged,
}: {
  project: ProjectRecord;
  refreshing: boolean;
  onChanged: () => Promise<void>;
}) {
  const members = project.members || [];
  const existingEmployeeIds = members
    .map((member) => member.employee?.id || member.employee_id)
    .filter((item): item is string => Boolean(item));

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">项目成员</h3>
          <p className="mt-1 text-sm text-muted-foreground">设计、工程和客户归属成员。</p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing ? (
            <Badge variant="secondary">
              <Loader2 className="animate-spin" data-icon="inline-start" />
              正在刷新
            </Badge>
          ) : null}
          <AddProjectMemberDialog
            projectId={project.id}
            existingEmployeeIds={existingEmployeeIds}
            onAdded={onChanged}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {members.map((member) => (
          <article key={member.id} className="rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{personName(member.employee)}</div>
                <div className="mt-1 truncate text-sm text-muted-foreground">
                  {getEmployeeMeta(member.employee) || "暂无部门岗位信息"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {member.is_primary ? <Badge variant="success">主责</Badge> : null}
                {member.is_virtual ? <Badge variant="secondary">客户归属</Badge> : null}
              </div>
            </div>
          </article>
        ))}
        {members.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            暂无成员
          </div>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire secondary tabs into the page client**

In `project-detail-page-client.tsx`, import:

```tsx
import { ProjectConstructionStagesPanel } from "@/components/projects/project-construction-stages-panel";
import { ProjectLogsPanel } from "@/components/projects/project-logs-dialog";
import { ProjectMembersPanel } from "@/components/projects/project-members-panel";
import { ProjectStatusPanel } from "@/components/projects/project-status-panel";
import { PropertyLocationStatus } from "@/components/properties/property-location-status";
import { propertyLabel, relationOne } from "@/components/projects/project-mutation-utils";
```

Add before the return:

```tsx
  const property = relationOne(currentProject.property);
```

Replace the non-acceptance placeholder with:

```tsx
          ) : activeTab === "logs" ? (
            <div className="flex flex-col gap-5">
              <ProjectConstructionStagesPanel
                projectId={currentProject.id}
                active={activeTab === "logs"}
                compact
              />
              <ProjectLogsPanel project={currentProject} active={activeTab === "logs"} />
            </div>
          ) : activeTab === "members" ? (
            <div className="flex flex-col gap-5">
              <ProjectMembersPanel
                project={currentProject}
                refreshing={refreshing}
                onChanged={refreshProject}
              />
              <ProjectStatusPanel project={currentProject} onChanged={refreshProject} />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <section className="rounded-lg border bg-card p-4">
                <h3 className="text-base font-semibold">房产位置</h3>
                {property?.id ? (
                  <div className="mt-3 rounded-md border bg-background p-3">
                    <div className="font-medium">{propertyLabel(property)}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {[property.layout, property.area != null ? `${property.area}㎡` : null]
                        .filter(Boolean)
                        .join(" · ") || currentProject.address || "-"}
                    </div>
                    <div className="mt-3">
                      <PropertyLocationStatus
                        property={{ ...property, id: property.id }}
                        onConfirmed={refreshProject}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    当前项目未关联房产，位置待补全。
                  </div>
                )}
              </section>
              <ProjectConstructionStagesPanel
                projectId={currentProject.id}
                active={activeTab === "overview"}
              />
              <ProjectStatusPanel project={currentProject} onChanged={refreshProject} />
            </div>
          )}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --dir apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit secondary panels**

```bash
git add apps/admin/components/projects/project-members-panel.tsx apps/admin/components/projects/project-detail-page-client.tsx
git commit -m "feat: add project detail secondary panels"
```

## Task 7: Migrate Project List Row Actions

**Files:**
- Modify: `apps/admin/components/projects/project-mutations.tsx`
- Modify: `apps/admin/components/projects/projects-table.tsx`

- [ ] **Step 1: Replace detail dialog state with links**

In `project-mutations.tsx`, remove these imports:

```ts
import { Eye, Loader2 } from "lucide-react";
import { ProjectDetailDialog } from "@/components/projects/project-detail-dialog";
import type { ProjectDetailTab, ProjectRecord } from "@/components/projects/project-mutation-types";
```

Replace them with:

```ts
import Link from "next/link";
import { ClipboardCheck, Edit3, Plus, Trash2 } from "lucide-react";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import { projectDetailHref } from "@/components/projects/project-detail-page-tabs";
```

Remove `detail` state and `openDetail`.

Replace the detail button JSX with two links:

```tsx
      <Button asChild type="button" variant="outline" size="sm">
        <Link href={projectDetailHref(project.id, "acceptances")}>
          <ClipboardCheck />
          工序验收
        </Link>
      </Button>
      <Button asChild type="button" variant="outline" size="sm">
        <Link href={projectDetailHref(project.id, "overview")}>
          详情
        </Link>
      </Button>
```

Remove the conditional `ProjectDetailDialog` render.

- [ ] **Step 2: Adjust operation column width**

In `projects-table.tsx`, change the operation column width from:

```tsx
          <col className="w-[220px]" />
```

to:

```tsx
          <col className="w-[300px]" />
```

Change the row actions wrapper width in `project-mutations.tsx` from:

```tsx
    <div className="flex min-w-[220px] flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
```

to:

```tsx
    <div className="flex min-w-[300px] flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --dir apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit migrated row actions**

```bash
git add apps/admin/components/projects/project-mutations.tsx apps/admin/components/projects/projects-table.tsx
git commit -m "feat: link projects to standalone detail page"
```

## Task 8: Final Responsive Polish And Verification

**Files:**
- Modify: `apps/admin/e2e/admin-smoke.spec.ts`
- Verify and, only if inspection finds a concrete defect, modify one of:
  - `apps/admin/components/projects/project-detail-page-client.tsx`
  - `apps/admin/components/projects/project-detail-side-rail.tsx`
  - `apps/admin/components/projects/project-acceptance-workbench.tsx`
  - `apps/admin/components/projects/project-acceptance-stage-list.tsx`
  - `apps/admin/components/projects/project-members-panel.tsx`

- [ ] **Step 1: Run admin checks**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: PASS.

- [ ] **Step 2: Run the updated smoke test**

Run:

```bash
pnpm --dir apps/admin test:e2e -- admin-smoke.spec.ts -g "项目详情独立页默认展示工序验收工作区"
```

Expected: PASS. If no projects exist in the e2e seed, the test should pass through the empty list branch.

- [ ] **Step 3: Start or reuse the admin dev server**

Run:

```bash
pnpm --dir apps/admin dev
```

Expected: Next.js dev server listens on `http://localhost:3010`.

- [ ] **Step 4: Browser-check desktop layout**

Open:

```text
http://localhost:3010/projects
```

Then click `工序验收` on the first project row.

Expected:

- URL becomes `/projects/<id>?tab=acceptances`.
- Left project dossier is visible.
- Main heading is `工序验收`.
- Acceptance records area is visible.
- No button, badge, tab, or project name visibly overflows.

- [ ] **Step 5: Browser-check narrow layout**

Resize to roughly `390px` wide.

Expected:

- Left project dossier stacks above the main work area.
- Acceptance stage list stacks above selected detail.
- Primary actions remain readable.
- Page remains vertically scrollable without horizontal body overflow.

- [ ] **Step 6: Commit final polish**

```bash
git add apps/admin/e2e/admin-smoke.spec.ts apps/admin/app/(console)/projects/[id]/page.tsx apps/admin/components/projects
git commit -m "chore: verify project detail acceptance redesign"
```

## Self-Review Notes

- Spec coverage: route, URL tabs, `acceptanceId`, left dossier, acceptance-first workbench, stage/final separation, secondary tabs, migration, e2e, and visual rules are all mapped to tasks.
- Placeholder scan: no deferred placeholder steps remain.
- Type consistency: tab type is `ProjectDetailPageTab`; project type remains `ProjectRecord`; acceptance URL state is `acceptanceId`; the hook exposes `selectedId` and `setSelectedId` for existing call sites.
