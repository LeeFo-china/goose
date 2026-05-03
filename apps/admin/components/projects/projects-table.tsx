"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ProjectRowActions,
  type ProjectRecord,
} from "@/components/projects/project-mutations";

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = {
  lead: { label: "线索客户", variant: "outline" },
  measure: { label: "量房中", variant: "warning" },
  negotiating: { label: "谈单中", variant: "warning" },
  signed: { label: "已签约", variant: "success" },
  designing: { label: "设计中", variant: "default" },
  constructing: { label: "施工中", variant: "warning" },
  on_hold: { label: "已暂停", variant: "danger" },
  acceptance: { label: "验收中", variant: "warning" },
  completed: { label: "已完工", variant: "success" },
  after_sale: { label: "售后中", variant: "danger" },
  invalid: { label: "无效客户", variant: "secondary" },
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function customerName(value: ProjectRecord["customer"]) {
  const item = relationOne(value);
  return item?.name || item?.phone_masked || item?.phone || "-";
}

function personName(value: ProjectRecord["designer"] | ProjectRecord["supervisor"]) {
  const item = relationOne(value);
  return item?.name || item?.phone || "-";
}

function propertyLabel(value: ProjectRecord["property"]) {
  const item = relationOne(value);
  if (!item) return "-";
  return [item.community, item.building_info].filter(Boolean).join(" ") || "-";
}

function ProjectIdentityCell({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="min-w-0 cursor-default border-0 bg-transparent p-0 text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="w-[10em] truncate font-medium">
          {name}
        </div>
        <div className="w-[10em] truncate text-xs text-muted-foreground">
          {id}
        </div>
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-[280px]">
        <div className="flex flex-col gap-1">
          <div className="break-all font-medium">{name}</div>
          <div className="break-all text-xs opacity-90">{id}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function ProjectsTable({
  projects,
}: {
  projects: ProjectRecord[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1420px] table-fixed border-t text-sm">
        <colgroup>
          <col className="w-[170px]" />
          <col className="w-[140px]" />
          <col className="w-[260px]" />
          <col className="w-[110px]" />
          <col className="w-[140px]" />
          <col className="w-[130px]" />
          <col className="w-[150px]" />
          <col className="w-[120px]" />
          <col className="w-[220px]" />
        </colgroup>
        <thead className="bg-muted/60 text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th className="whitespace-nowrap px-4 py-3">项目</th>
            <th className="whitespace-nowrap px-4 py-3">客户</th>
            <th className="whitespace-nowrap px-4 py-3">房产</th>
            <th className="whitespace-nowrap px-4 py-3">状态</th>
            <th className="whitespace-nowrap px-4 py-3">预算</th>
            <th className="whitespace-nowrap px-4 py-3">设计师</th>
            <th className="whitespace-nowrap px-4 py-3">工程负责人</th>
            <th className="whitespace-nowrap px-4 py-3">开工日期</th>
            <th className="sticky right-0 whitespace-nowrap bg-muted px-4 py-3 text-right shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.length > 0 ? (
            projects.map((project) => {
              const meta = statusMeta[project.status || ""] || {
                label: project.status || "未知",
                variant: "outline" as const,
              };

              return (
                <tr key={project.id} className="group border-t transition-colors hover:bg-muted/40">
                  <td className="px-4 py-4">
                    <ProjectIdentityCell id={project.id} name={project.name || "未命名项目"} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">{customerName(project.customer)}</td>
                  <td className="px-4 py-4 text-muted-foreground">
                    <div className="truncate">{propertyLabel(project.property)}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <Badge className="whitespace-nowrap" variant={meta.variant}>{meta.label}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 font-medium">¥{formatMoney(project.budget)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{personName(project.designer)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{personName(project.supervisor)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDate(project.start_date)}</td>
                  <td className="sticky right-0 whitespace-nowrap bg-card px-4 py-4 text-right shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)] transition-colors group-hover:bg-muted">
                    <ProjectRowActions project={project} />
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td className="px-5 py-12 text-center text-muted-foreground" colSpan={9}>
                没有符合条件的项目
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
