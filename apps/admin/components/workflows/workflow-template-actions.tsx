"use client";

import { useState } from "react";
import { FilePlus2, Loader2 } from "lucide-react";
import { createWorkflowFromTemplate } from "@/components/workflows/workflow-requests";
import type {
  WorkflowDefinition,
  WorkflowTemplateCreateInput,
} from "@/components/workflows/workflow-types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const TEMPLATE_OPTIONS = [
  {
    key: "customer_main",
    label: "客户设计流程",
    title: "创建并发布客户设计流程模板",
  },
  {
    key: "project_signing",
    label: "项目签约流程",
    title: "创建并发布项目签约流程模板",
  },
  {
    key: "construction_main",
    label: "施工流程",
    title: "创建并发布施工流程模板",
  },
] as const satisfies ReadonlyArray<{
  key: WorkflowTemplateCreateInput["template_key"];
  label: string;
  title: string;
}>;

export function WorkflowTemplateActions({
  disabled,
  onCreated,
}: {
  disabled?: boolean;
  onCreated: (workflow: WorkflowDefinition) => void;
}) {
  const [creatingTemplate, setCreatingTemplate] = useState<
    WorkflowTemplateCreateInput["template_key"] | null
  >(null);

  async function createTemplate(templateKey: WorkflowTemplateCreateInput["template_key"]) {
    setCreatingTemplate(templateKey);
    try {
      const result = await createWorkflowFromTemplate({
        template_key: templateKey,
      });
      toast.success("流程模板已创建并发布");
      onCreated(result.definition);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建流程模板失败");
    } finally {
      setCreatingTemplate(null);
    }
  }

  return (
    <>
      {TEMPLATE_OPTIONS.map((option) => {
        const creating = creatingTemplate === option.key;
        return (
          <Button
            key={option.key}
            type="button"
            variant="secondary"
            disabled={disabled || Boolean(creatingTemplate)}
            title={option.title}
            onClick={() => createTemplate(option.key)}
          >
            {creating ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <FilePlus2 data-icon="inline-start" />
            )}
            {option.label}
          </Button>
        );
      })}
    </>
  );
}
