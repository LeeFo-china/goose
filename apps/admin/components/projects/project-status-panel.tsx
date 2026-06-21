"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import {
  customerName,
  formatDate,
  formatMoney,
  personName,
  projectDisplayStatusBadgeVariant,
  projectDisplayStatusLabel,
  propertyLabel,
} from "@/components/projects/project-mutation-utils";

export function ProjectStatusPanel({
  project,
}: {
  project: ProjectRecord;
}) {
  const amountSummary = project.signed_amount
    ? `签约 ¥${formatMoney(project.signed_amount)}`
    : project.budget
      ? `预算 ¥${formatMoney(project.budget)}`
      : "-";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate">{project.name || "项目概览"}</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={projectDisplayStatusBadgeVariant(project)}>
              {projectDisplayStatusLabel(project)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <InfoItem label="客户" value={customerName(project.customer)} />
        <InfoItem label="房产" value={propertyLabel(project.property)} />
        <InfoItem label="设计负责人" value={personName(project.designer)} />
        <InfoItem label="工程负责人" value={personName(project.supervisor)} />
        <InfoItem label="开工日期" value={formatDate(project.start_date)} />
        <InfoItem label="金额" value={amountSummary} />
        <InfoItem
          className="sm:col-span-2"
          label="地址"
          value={project.address || "-"}
        />
      </CardContent>
    </Card>
  );
}

function InfoItem({
  className = "",
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 truncate font-medium">{value}</div>
    </div>
  );
}
