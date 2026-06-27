"use client";

import { Badge } from "@/components/ui/badge";
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
  const items = [
    { label: "客户", value: customerName(project.customer) },
    { label: "房产", value: propertyLabel(project.property) },
    { label: "设计负责人", value: personName(project.designer) },
    { label: "工程负责人", value: personName(project.supervisor) },
    { label: "开工日期", value: formatDate(project.start_date) },
    { label: "金额", value: amountSummary },
    { label: "地址", value: project.address || "-", className: "sm:basis-full" },
  ];

  return (
    <section data-testid="project-status-summary-panel" className="border-y bg-card">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{project.name || "项目概览"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            客户、房产、负责人和资金摘要
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant={projectDisplayStatusBadgeVariant(project)}>
            {projectDisplayStatusLabel(project)}
          </Badge>
        </div>
      </div>
      <dl className="flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:flex-wrap">
        {items.map((item) => (
          <InfoItem
            key={item.label}
            className={item.className}
            label={item.label}
            value={item.value}
          />
        ))}
      </dl>
    </section>
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
    <div className={`min-w-0 sm:min-w-48 sm:flex-1 ${className}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 truncate font-medium">{value}</dd>
    </div>
  );
}
