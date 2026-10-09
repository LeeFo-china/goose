"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import {
  customerName, formatDate, personName, projectDisplayStatusBadgeVariant,
  projectDisplayStatusLabel, propertyLabel, relationOne,
} from "@/components/projects/project-mutation-utils";
import type { ProjectDetailPageTab } from "@/components/projects/project-detail-page-tabs";
import { cn } from "@/lib/utils";

const navItems: Array<{ value: ProjectDetailPageTab; label: string }> = [
  { value: "overview", label: "总览" },
  { value: "acceptances", label: "工序验收" },
  { value: "logs", label: "施工日志" },
  { value: "members", label: "成员/状态" },
];

export function ProjectDetailHeader({ project, activeTab, onNavigate, refreshing, onRefresh }: {
  project: ProjectRecord;
  activeTab: ProjectDetailPageTab;
  onNavigate: (tab: ProjectDetailPageTab) => void;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
}) {
  const property = relationOne(project.property);
  const propertyMeta = [property?.layout, property?.area != null ? `${property.area}㎡` : null]
    .filter(Boolean).join(" · ");

  const propertyAddress = property?.community || property?.building_info
    ? propertyLabel(project.property)
    : project.address || "位置待补全";

  return (
    <header data-testid="project-detail-header" className="max-h-[45%] min-h-0 min-w-0 shrink-0 overflow-y-auto border-b px-4 pt-3 [scrollbar-gutter:stable] lg:px-5">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 shrink-0">
          <Link href="/projects"><ArrowLeft data-icon="inline-start" />返回项目列表</Link>
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw className={refreshing ? "animate-spin" : ""} data-icon="inline-start" />
          {refreshing ? "正在刷新" : "刷新"}
        </Button>
      </div>
      <div className="mt-3 flex min-w-0 items-start gap-3">
        <h1 className="min-w-0 flex-1 break-words text-lg font-semibold leading-7 tracking-normal">
          {project.name || "未命名项目"}
        </h1>
        <Badge className="mt-1 shrink-0 whitespace-nowrap" variant={projectDisplayStatusBadgeVariant(project)}>
          {projectDisplayStatusLabel(project)}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="break-words">客户：{customerName(project.customer)}</span>
        <span>设计师：{personName(project.designer)}</span>
        <span>工程负责人：{personName(project.supervisor)}</span>
        <span>开工：{formatDate(project.start_date)}</span>
        <span>成员：{project.members?.length ?? 0} 人</span>
      </div>
      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
        房产：{propertyAddress}{propertyMeta ? ` · ${propertyMeta}` : ""}
      </p>
      <nav className="mt-3 flex flex-wrap gap-x-4" aria-label="项目详情导航">
        {navItems.map(item => (
          <button key={item.value} type="button" aria-current={item.value === activeTab ? "page" : undefined}
            className={cn("min-h-11 border-b-2 px-1 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              item.value === activeTab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            onClick={() => onNavigate(item.value)}>{item.label}</button>
        ))}
      </nav>
    </header>
  );
}
