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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ProjectConstructionStagesPanel } from "@/components/projects/project-construction-stages-panel";
import { ProjectCostBudgetPanel } from "@/components/projects/project-cost-budget-panel";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import {
  customerName,
  formatDate,
  formatMoney,
  personName,
  projectDisplayStatusBadgeVariant,
  projectDisplayStatusLabel,
  propertyLabel,
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
  const propertyMeta = [
    property?.layout,
    property?.area != null ? `${property.area}㎡` : null,
  ].filter(Boolean).join(" · ");
  const amountSummary = project.signed_amount
    ? `签约 ¥${formatMoney(project.signed_amount)}`
    : project.budget
      ? `预算 ¥${formatMoney(project.budget)}`
      : "-";

  function toggleDetail(key: Exclude<OverviewDetailKey, null>) {
    setOpenDetail((value) => value === key ? null : key);
  }

  return (
    <div
      data-testid="project-detail-overview-workbench"
      className="flex min-w-0 flex-col gap-4"
    >
      <section
        data-testid="project-overview-identity-strip"
        className="rounded-md border bg-card px-4 py-3"
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold tracking-normal">
                {project.name || "未命名项目"}
              </h3>
              <Badge variant={projectDisplayStatusBadgeVariant(project)}>
                {projectDisplayStatusLabel(project)}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>客户：{customerName(project.customer)}</span>
              <span>金额：{amountSummary}</span>
              <span>开工：{formatDate(project.start_date)}</span>
            </div>
          </div>
          <dl className="grid shrink-0 gap-x-5 gap-y-2 text-sm sm:grid-cols-3">
            <OverviewFact label="设计师" value={personName(project.designer)} />
            <OverviewFact label="工程负责人" value={personName(project.supervisor)} />
            <OverviewFact label="房产" value={propertyLabel(project.property)} />
          </dl>
        </div>
      </section>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.9fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ProjectConstructionStagesPanel
            active={active}
            compact
            projectId={project.id}
          />
          <ProjectFinanceOperatingSummaryPanel
            projectId={project.id}
            refreshVersion={refreshVersion}
          />
          <ProjectFinanceReconciliationSummaryPanel
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
              className="rounded-md border bg-card"
            >
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
              <CollapsibleContent className="border-t">
                {openDetail === "budget" ? (
                  <div className="p-3">
                    <ProjectCostBudgetPanel projectId={project.id} />
                  </div>
                ) : null}
                {openDetail === "receivables" ? (
                  <div className="p-3">
                    <ProjectFinanceReceivableSummaryPanel projectId={project.id} />
                  </div>
                ) : null}
              </CollapsibleContent>
            </section>
          </Collapsible>
        </div>

        <aside className="min-w-0 overflow-hidden rounded-md border bg-card">
          <ProjectWorkflowRuntimePanel
            active={active}
            compact
            onChanged={onChanged}
            project={project}
          />
          <section className="border-t px-4 py-3">
            <div className="flex items-center gap-2">
              <Home className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">房产位置</h3>
            </div>
            {property?.id ? (
              <div className="mt-3 space-y-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {propertyLabel(property)}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {propertyMeta || project.address || "-"}
                  </div>
                </div>
                <PropertyLocationStatus
                  property={{ ...property, id: property.id }}
                  onConfirmed={onChanged}
                />
              </div>
            ) : (
              <div className="mt-3 border border-dashed px-3 py-4 text-sm text-muted-foreground">
                当前项目未关联房产，位置待补全。
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function OverviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate font-medium">{value}</dd>
    </div>
  );
}
