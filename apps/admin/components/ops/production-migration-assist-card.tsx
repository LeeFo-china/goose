"use client";

import { Fragment } from "react";
import Link from "next/link";
import { GitBranch, MapPinned, ShieldCheck } from "lucide-react";
import { OpsSection } from "@/components/ops/ops-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ReleaseOptionsData } from "@/components/ops/ops-types";

const MIGRATION_ASSIST_CHECKLIST = [
  {
    label: "先执行 plan",
    description: "确认待执行 migration 版本和顺序，再切换 apply。",
  },
  {
    label: "确认配置项",
    description: "生产库需先配置腾讯 LBS WebService Key/SK 与小程序 Key。",
  },
  {
    label: "主数据单独同步",
    description: "migration 只建表和配置项；行政区划数据需执行同步脚本写入生产库。",
  },
  {
    label: "迁移后验收",
    description: "检查 system_settings、administrative_areas、tenant_service_areas 相关数据。",
  },
] as const;

export function ProductionMigrationAssistCard({
  options,
}: {
  options: ReleaseOptionsData | null;
}) {
  const migrationOptions = options?.production_migration;
  const workflowUrl = migrationOptions?.workflow_url;

  return (
    <OpsSection
      title="迁移辅助信息"
      description="生产数据库迁移只负责 SQL 变更，外部主数据和系统配置需要单独确认。"
      icon={<ShieldCheck data-icon="inline-start" />}
    >
        <div className="flex flex-col">
          <div className="py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <GitBranch data-icon="inline-start" />
                <span className="truncate">推荐版本</span>
              </div>
              <Badge variant="outline">{migrationOptions?.default_ref || "main"}</Badge>
            </div>
            <div className="mt-2 break-all text-xs text-muted-foreground">
              {migrationOptions?.workflow_id || "production-migration.yml"}
            </div>
          </div>

          <Separator />

          <div className="py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <MapPinned data-icon="inline-start" />
                <span className="truncate">行政区划数据</span>
              </div>
              <Badge variant="warning">需同步</Badge>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              生产执行 migration 后，再运行{" "}
              <span className="font-mono">scripts/sync-tencent-districts.ts</span>{" "}
              写入完整省市区数据。
            </div>
          </div>
        </div>

        <Alert>
          <ShieldCheck data-icon="inline-start" />
          <AlertTitle>本轮定位相关迁移</AlertTitle>
          <AlertDescription>
            包含腾讯 LBS 系统配置、服务区域表、行政区划表。SQL 不会自动调用腾讯接口，也不会复制开发库主数据。
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-3">
          {MIGRATION_ASSIST_CHECKLIST.map((item, index) => (
            <Fragment key={item.label}>
              {index > 0 ? <Separator /> : null}
              <div className="flex gap-3 py-2">
                <div className="flex size-7 items-center justify-center rounded-full border bg-background text-xs font-medium">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</div>
                </div>
              </div>
            </Fragment>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {workflowUrl ? (
            <Button asChild variant="outline" size="sm">
              <Link href={workflowUrl} target="_blank" rel="noreferrer">
                <GitBranch data-icon="inline-start" />
                查看 Workflow
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              <GitBranch data-icon="inline-start" />
              查看 Workflow
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/settings?group=tencent_lbs">
              <MapPinned data-icon="inline-start" />
              腾讯位置配置
            </Link>
          </Button>
        </div>
    </OpsSection>
  );
}
