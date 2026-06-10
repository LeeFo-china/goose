"use client";

import { CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react";
import type { WorkflowValidationResult } from "@/components/workflows/workflow-designer-types";
import { Badge } from "@/components/ui/badge";

export function WorkflowValidationPanel({
  validation,
}: {
  validation: WorkflowValidationResult | null;
}) {
  const valid = validation?.valid ?? null;

  return (
    <div className="grid gap-3 border-t bg-background px-4 py-3 md:grid-cols-[240px_1fr]">
      <div className="flex items-start gap-3">
        <span className="flex size-9 items-center justify-center rounded-md border bg-muted/30">
          {valid === true ? (
            <CheckCircle2 className="size-4 text-success" />
          ) : valid === false ? (
            <CircleAlert className="size-4 text-warning" />
          ) : (
            <ShieldCheck className="size-4 text-muted-foreground" />
          )}
        </span>
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            发布检查
            {validation ? (
              <Badge variant={validation.valid ? "success" : "warning"}>
                {validation.valid ? "通过" : "需处理"}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            保存和发布前用它确认节点、连线和出边完整性。
          </p>
        </div>
      </div>
      <div className="space-y-1 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
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
