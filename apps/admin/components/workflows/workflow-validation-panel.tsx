"use client";

import type { WorkflowValidationResult } from "@/components/workflows/workflow-designer-types";
import { Badge } from "@/components/ui/badge";

export function WorkflowValidationPanel({
  validation,
}: {
  validation: WorkflowValidationResult | null;
}) {
  return (
    <div className="grid gap-3 border-t bg-background p-3 md:grid-cols-[220px_1fr]">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">
          本地校验
          {validation ? (
            <Badge variant={validation.valid ? "success" : "danger"}>
              {validation.valid ? "通过" : "需处理"}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          发布时仍以后端校验为准。
        </p>
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        {validation?.issues.map((issue) => (
          <div key={`${issue.code}-${issue.nodeKey || issue.message}`}>
            {issue.nodeKey ? `${issue.nodeKey}：` : ""}
            {issue.message}
          </div>
        ))}
        {validation && validation.issues.length === 0 ? <div>暂无问题。</div> : null}
        {!validation ? <div>尚未运行校验。</div> : null}
      </div>
    </div>
  );
}
