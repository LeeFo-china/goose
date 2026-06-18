import { StatusAlert } from "@/components/admin/status-alert";
import type { WorkflowRuntimeIntegrationHint } from "@/components/workflows/workflow-business-track";
import { Badge } from "@/components/ui/badge";
import { WORKFLOW_VERSION_EFFECT_COPY } from "./workflow-version-semantics";

export function WorkflowVersionEffectNotice({
  integrationHint,
}: {
  integrationHint: WorkflowRuntimeIntegrationHint | null;
}) {
  return (
    <div className="shrink-0 border-b bg-secondary/35 px-3 py-2 md:px-4">
      <StatusAlert tone="warning" title={WORKFLOW_VERSION_EFFECT_COPY.noticeTitle}>
        <div className="space-y-2 text-xs">
          <p>{WORKFLOW_VERSION_EFFECT_COPY.noticeDescription}</p>
          {integrationHint ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-card">
                {integrationHint.badge}
              </Badge>
              <span className="font-medium text-secondary-foreground">
                {integrationHint.headline}
              </span>
              <span className="text-muted-foreground">
                {integrationHint.detail}
              </span>
            </div>
          ) : null}
        </div>
      </StatusAlert>
    </div>
  );
}
