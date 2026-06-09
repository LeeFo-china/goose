"use client";

import { useState } from "react";
import { FilePlus2, Loader2 } from "lucide-react";
import { createWorkflowFromTemplate } from "@/components/workflows/workflow-requests";
import type { WorkflowDefinition } from "@/components/workflows/workflow-types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function WorkflowTemplateActions({
  disabled,
  onCreated,
}: {
  disabled?: boolean;
  onCreated: (workflow: WorkflowDefinition) => void;
}) {
  const [creating, setCreating] = useState(false);

  async function createCustomerMainTemplate() {
    setCreating(true);
    try {
      const result = await createWorkflowFromTemplate({
        template_key: "customer_main",
      });
      toast.success("客户主流程已创建并发布");
      onCreated(result.definition);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建客户主流程失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={disabled || creating}
      title="创建并发布客户主流程模板"
      onClick={createCustomerMainTemplate}
    >
      {creating ? (
        <Loader2 className="animate-spin" data-icon="inline-start" />
      ) : (
        <FilePlus2 data-icon="inline-start" />
      )}
      客户主流程
    </Button>
  );
}
