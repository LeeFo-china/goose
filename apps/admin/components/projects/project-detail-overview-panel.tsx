"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Banknote,
  CalendarClock,
  ChevronDown,
  Home,
  ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ProjectConstructionStagesPanel } from "@/components/projects/project-construction-stages-panel";
import { ProjectCostBudgetPanel } from "@/components/projects/project-cost-budget-panel";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import {
  relationOne,
} from "@/components/projects/project-mutation-utils";
import { ProjectFinanceOperatingSummaryPanel } from "@/components/projects/project-finance-operating-summary-panel";
import {
  ProjectFinanceReconciliationSummaryPanel,
} from "@/components/projects/project-finance-reconciliation-summary-panel";
import { ProjectFinanceReceivableSummaryPanel } from "@/components/projects/project-finance-receivable-summary-panel";
import { ProjectWorkflowRuntimePanel } from "@/components/projects/project-workflow-runtime-panel";
import { PropertyLocationStatus } from "@/components/properties/property-location-status";
import { cn } from "@/lib/utils";

type OverviewDetailKey = "budget" | "receivables" | null;

export function ProjectDetailOverviewPanel({
  active = true,
  onChanged,
  project,
  refreshVersion,
}: {
  active?: boolean;
  onChanged: () => Promise<void>;
  project: ProjectRecord;
  refreshVersion: number;
}) {
  const [openDetail, setOpenDetail] = useState<OverviewDetailKey>(null);
  const property = relationOne(project.property);
  function toggleDetail(key: Exclude<OverviewDetailKey, null>) {
    setOpenDetail((value) => value === key ? null : key);
  }

  return (
    <div
      data-testid="project-detail-overview-workbench"
      className="flex min-w-0 flex-col gap-5"
    >
      <div className="min-w-0 border-b pb-5">
        <ProjectWorkflowRuntimePanel active={active} compact embedded
          refreshVersion={refreshVersion} onChanged={onChanged} project={project} />
        <ProjectConstructionStagesPanel active={active} compact embedded
          refreshVersion={refreshVersion} projectId={project.id} />
      </div>
      <ProjectFinanceOperatingSummaryPanel
        embedded
        projectId={project.id}
        refreshVersion={refreshVersion}
      />
      <ProjectFinanceReconciliationSummaryPanel
        embedded
        projectId={project.id}
        refreshVersion={refreshVersion}
      />
      <Collapsible
        open={openDetail !== null}
        onOpenChange={(open) => {
          if (!open) setOpenDetail(null);
        }}
      >
        <section
          data-testid="project-overview-secondary-actions"
          className="min-w-0 border-b pb-5"
        >
          <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">财务明细</h3>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                成本预算、应收计划与项目流水
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={openDetail === "budget" ? "default" : "outline"}
                size="sm"
                aria-expanded={openDetail === "budget"}
                aria-controls="project-finance-detail"
                onClick={() => toggleDetail("budget")}
              >
                <Banknote data-icon="inline-start" />
                成本预算
                <ChevronDown
                  className={cn(
                    "transition-transform",
                    openDetail === "budget" && "rotate-180",
                  )}
                  data-icon="inline-end"
                />
              </Button>
              <Button
                type="button"
                variant={openDetail === "receivables" ? "default" : "outline"}
                size="sm"
                aria-expanded={openDetail === "receivables"}
                aria-controls="project-finance-detail"
                onClick={() => toggleDetail("receivables")}
              >
                <CalendarClock data-icon="inline-start" />
                应收计划
                <ChevronDown
                  className={cn(
                    "transition-transform",
                    openDetail === "receivables" && "rotate-180",
                  )}
                  data-icon="inline-end"
                />
              </Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href={`/finance/ledger?project_id=${project.id}`}>
                  <ReceiptText data-icon="inline-start" />
                  流水
                </Link>
              </Button>
            </div>
          </div>
          <CollapsibleContent id="project-finance-detail" className="pt-4">
            {openDetail === "budget" ? (
              <div className="min-w-0">
                <ProjectCostBudgetPanel embedded projectId={project.id} />
              </div>
            ) : null}
            {openDetail === "receivables" ? (
              <div className="min-w-0">
                <ProjectFinanceReceivableSummaryPanel embedded projectId={project.id} />
              </div>
            ) : null}
          </CollapsibleContent>
        </section>
      </Collapsible>
      <section className="min-w-0 pb-3" aria-label="项目资料">
        <div className="mb-3 flex items-center gap-2">
          <Home className="size-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">项目资料</h3>
        </div>
        {property?.id ? (
          <PropertyLocationStatus embedded property={{ ...property, id: property.id }} onConfirmed={onChanged} />
        ) : (
          <p className="text-sm text-muted-foreground">当前项目未关联房产，位置待补全。</p>
        )}
      </section>
    </div>
  );
}
