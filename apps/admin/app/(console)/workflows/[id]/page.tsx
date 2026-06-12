import { notFound } from "next/navigation";
import { WorkflowDesignerShell } from "@/components/workflows/workflow-designer-shell";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { getWorkflowDetail, type WorkflowDesignerPageParams } from "./workflow-detail-loader";

export default async function WorkflowDesignerPage({
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

  return (
    <div className="h-[calc(100dvh-6.5rem)] min-h-0 overflow-hidden">
      <WorkflowDesignerShell
        workflowId={id}
        initialDetail={detail}
        initialError={error}
      />
    </div>
  );
}
