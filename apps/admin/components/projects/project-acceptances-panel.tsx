"use client";

import { toast } from "sonner";
import { StatusAlert } from "@/components/admin/status-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AcceptanceActionDialog } from "@/components/projects/project-acceptance-action-dialog";
import { ProjectAcceptanceDetail } from "@/components/projects/project-acceptance-detail";
import { ProjectAcceptanceSidebar } from "@/components/projects/project-acceptance-sidebar";
import { useProjectAcceptancesPanel } from "@/components/projects/project-acceptances-panel-state";
import { FinalAcceptanceTemplateDialog } from "@/components/projects/project-final-acceptance-template-dialog";
import type { ProjectRecord } from "@/components/projects/project-mutations";

export function ProjectAcceptancesPanel({
  project,
  active = true,
}: {
  project: ProjectRecord;
  active?: boolean;
}) {
  const panel = useProjectAcceptancesPanel(project, active);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {panel.error ? <StatusAlert>{panel.error}</StatusAlert> : null}

      {panel.loading ? (
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[260px_1fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <ProjectAcceptanceSidebar
            loading={panel.loading}
            actionLoading={panel.actionLoading}
            templateLoading={panel.templateLoading}
            acceptances={panel.acceptances}
            selectedId={panel.selectedId}
            stageCode={panel.stageCode}
            selectableStageOptions={panel.selectableStageOptions}
            finalAcceptanceBlockedReason={panel.finalAcceptanceBlockedReason}
            canCreateFinalAcceptance={panel.canCreateFinalAcceptance}
            canCreateAcceptance={panel.canCreateAcceptance}
            canCreateByProjectStatus={panel.canCreateByProjectStatus}
            firstAvailableStage={panel.firstAvailableStage}
            selectedStageBlocked={panel.selectedStageBlocked}
            selectedStageBlockedReason={panel.selectedStageBlockedReason}
            onRefresh={panel.loadAcceptances}
            onCreateFinalAcceptance={panel.createFinalAcceptance}
            onOpenTemplateDialog={panel.openTemplateDialog}
            onStageCodeChange={panel.setStageCode}
            onCreateAcceptance={panel.createAcceptance}
            onSelectedIdChange={panel.setSelectedId}
          />
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
