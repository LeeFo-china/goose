import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { WorkflowRuntimePanel } from "@/components/workflows/workflow-runtime-panel";
import { Button } from "@/components/ui/button";
import { getWorkflowDetail, type WorkflowDesignerPageParams } from "../workflow-detail-loader";

export default async function WorkflowRuntimePage({
  params,
}: {
  params: Promise<WorkflowDesignerPageParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const { id } = await params;
  const { detail, error } = await getWorkflowDetail(id);

  if (!detail && !error) {
    notFound();
  }

  if (!detail) {
    return <StatusAlert>{error || "流程不存在"}</StatusAlert>;
  }

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <Activity aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">运行实例</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              查看 {detail.definition.name} 最近发布流程运行记录。
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href={`/workflows/${id}`}>
            <ArrowLeft data-icon="inline-start" />
            返回设计器
          </Link>
        </Button>
      </div>

      <WorkflowRuntimePanel
        activeVersionId={detail.definition.active_version_id}
        className="min-h-0 flex-1 shadow-none"
        workflowId={id}
      />
    </div>
  );
}
