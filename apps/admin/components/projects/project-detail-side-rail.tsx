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

const navItems: Array<{
  value: ProjectDetailPageTab;
  label: string;
}> = [
  { value: "acceptances", label: "工序验收" },
  { value: "logs", label: "施工日志" },
  { value: "members", label: "成员/状态" },
  { value: "overview", label: "总览" },
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
  const propertyMeta = [
    property?.layout,
    property?.area != null ? `${property.area}㎡` : null,
  ].filter(Boolean).join(" · ");
  const propertySummary = propertyMeta || project.address || "位置待补全";
  const memberCount = project.members?.length ?? 0;

  return (
    <aside className="flex min-w-0 flex-col gap-4 border-b bg-card p-4 lg:min-h-[calc(100vh-6rem)] lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link href="/projects">
            <ArrowLeft data-icon="inline-start" />
            返回
          </Link>
        </Button>
        <Badge variant={projectDisplayStatusBadgeVariant(project)}>
          {projectDisplayStatusLabel(project)}
        </Badge>
      </div>

      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">项目档案</div>
        <h1 className="mt-2 truncate text-lg font-semibold tracking-normal">
          {project.name || "未命名项目"}
        </h1>
        <div className="mt-1 truncate text-sm text-muted-foreground">
          客户：{customerName(project.customer)}
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-md border bg-background p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MapPin className="size-4 text-muted-foreground" />
          房产
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {propertyLabel(project.property)}
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {propertySummary}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-md border bg-background p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UsersRound className="size-4 text-muted-foreground" />
          负责人
        </div>
        <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">设计师</dt>
          <dd className="truncate">{personName(project.designer)}</dd>
          <dt className="text-muted-foreground">工程</dt>
          <dd className="truncate">{personName(project.supervisor)}</dd>
          <dt className="text-muted-foreground">开工</dt>
          <dd className="truncate">{formatDate(project.start_date)}</dd>
          <dt className="text-muted-foreground">成员</dt>
          <dd className="truncate">{memberCount} 人</dd>
        </dl>
      </section>

      <nav className="flex flex-col gap-1" aria-label="项目详情导航">
        {navItems.map((item) => {
          const isActive = item.value === activeTab;

          return (
            <Button
              key={item.value}
              type="button"
              variant="ghost"
              className={cn(
                "justify-start border border-transparent px-3 text-left focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onNavigate(item.value)}
            >
              {item.label}
            </Button>
          );
        })}
      </nav>
    </aside>
  );
}
