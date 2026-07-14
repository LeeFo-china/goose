"use client";

import { Fragment } from "react";
import Link from "next/link";
import { Database, GitBranch, ShieldCheck } from "lucide-react";
import { OpsSection } from "@/components/ops/ops-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ReleaseOptionsData } from "@/components/ops/ops-types";

const MIGRATION_ASSIST_CHECKLIST = [
  {
    label: "刷新迁移对比",
    description: "动态迁移对比结果以左侧「迁移对比提示」为准，先确认是否存在 pending migration。",
  },
  {
    label: "确认待执行版本",
    description: "核对 pending_versions 的顺序和 SQL 内容，确认本次版本就是要发布的数据库变更。",
  },
  {
    label: "执行 apply 前二次确认",
    description: "只有需要迁移且 SQL 已评审时才切换 apply，并输入生产数据库迁移确认文本。",
  },
  {
    label: "保留备份和回滚依据",
    description: "apply 会先生成生产库备份；迁移后保留 GitHub Run、pending 列表和备份路径用于追溯。",
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
      description="固定安全说明。是否需要迁移、待执行版本和检查结果以左侧迁移对比提示为准。"
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
                <Database data-icon="inline-start" />
                <span className="truncate">执行边界</span>
              </div>
              <Badge variant="warning">生产高危</Badge>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              plan 只读取生产库迁移状态；apply 会修改生产数据库，必须先完成对比和 SQL 评审。
            </div>
          </div>
        </div>

        <Alert>
          <ShieldCheck data-icon="inline-start" />
          <AlertTitle>动态结果看左侧</AlertTitle>
          <AlertDescription>
            右侧只保留通用安全步骤。是否需要迁移、pending_versions 和检查时间，
            以左侧「迁移对比提示」区域最新结果为准。
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
            <Link href="/platform/audit-logs">
              <ShieldCheck data-icon="inline-start" />
              查看审计日志
            </Link>
          </Button>
        </div>
    </OpsSection>
  );
}
