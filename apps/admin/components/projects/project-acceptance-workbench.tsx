"use client";

import { toast } from "sonner";
import { StatusAlert } from "@/components/admin/status-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AcceptanceActionDialog } from "@/components/projects/project-acceptance-action-dialog";
import { ProjectAcceptanceDetail } from "@/components/projects/project-acceptance-detail";
import { useProjectAcceptancesPanel } from "@/components/projects/project-acceptances-panel-state";
import { FinalAcceptanceTemplateDialog } from "@/components/projects/project-final-acceptance-template-dialog";
import type { ProjectRecord } from "@/components/projects/project-mutations";

type ProjectAcceptanceWorkbenchProps = {
  project: ProjectRecord;
  active: boolean;
  acceptanceId: string;
  onAcceptanceIdChange: (id: string) => void;
};

export function ProjectAcceptanceWorkbench({
  project,
  active,
  acceptanceId,
  onAcceptanceIdChange,
}: ProjectAcceptanceWorkbenchProps) {
  const panel = useProjectAcceptancesPanel(project, active, {
    selectedAcceptanceId: acceptanceId,
    onSelectedAcceptanceIdChange: onAcceptanceIdChange,
  });

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {panel.loading ? (
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[260px_1fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          {panel.error ? <StatusAlert>{panel.error}</StatusAlert> : null}

          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              验收记录加载中
            </aside>
            <ProjectAcceptanceDetail
              selected={panel.selected}
              selectedStats={panel.selectedStats}
              selectedSections={panel.selectedSections}
              latestCustomerDispute={panel.latestCustomerDispute}
              latestRejectAction={panel.latestRejectAction}
              editable={panel.editable}
              actionLoading={panel.actionLoading}
              uploadingItemId={panel.uploadingItemId}
              setEditable={panel.setEditable}
              openActionDialog={panel.openActionDialog}
              saveAcceptance={panel.saveAcceptance}
              notifyCustomer={panel.notifyCustomer}
              updateEditableItem={panel.updateEditableItem}
              uploadImages={panel.uploadImages}
            />
          </div>
        </>
      )}

      <FinalAcceptanceTemplateDialog
        open={panel.templateDialogOpen}
        loading={panel.templateLoading}
        error={panel.templateError}
        template={panel.finalTemplate}
        onSaved={(template) => {
          panel.setFinalTemplate(template);
          toast.success("竣工模板已保存");
        }}
        onOpenChange={panel.setTemplateDialogOpen}
      />

      <AcceptanceActionDialog
        state={panel.actionDialog}
        error={panel.actionDialogError}
        loading={panel.actionLoading}
        onOpenChange={(open) => {
          if (!open) panel.closeActionDialog();
        }}
        onCommentChange={(comment) => {
          panel.setActionDialog((current) => current ? { ...current, comment } : current);
          panel.setActionDialogError("");
        }}
        onConfirm={() => {
          if (!panel.actionDialog) return;
          if (panel.actionDialog.type === "approve") {
            void panel.approveAcceptance(panel.actionDialog.acceptanceId, panel.actionDialog.comment);
            return;
          }
          if (panel.actionDialog.type === "reject") {
            void panel.rejectAcceptance(panel.actionDialog.acceptanceId, panel.actionDialog.comment);
            return;
          }
          void panel.deleteDraftAcceptance(panel.actionDialog.acceptanceId);
        }}
      />
    </div>
  );
}
