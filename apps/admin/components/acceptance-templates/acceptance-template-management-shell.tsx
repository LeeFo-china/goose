"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AcceptanceTemplateEditor } from "@/components/acceptance-templates/acceptance-template-editor";
import { AcceptanceTemplateFiltersBar } from "@/components/acceptance-templates/acceptance-template-filters";
import { AcceptanceTemplateList } from "@/components/acceptance-templates/acceptance-template-list";
import {
  buildAcceptanceTemplateUpdatePayload,
  cloneAcceptanceTemplateForEdit,
  getAcceptanceTemplateValidationError,
} from "@/components/acceptance-templates/acceptance-template-editor-utils";
import { buildAcceptanceTemplatesHref } from "@/components/acceptance-templates/acceptance-template-options";
import type {
  AcceptanceTemplateFilters,
} from "@/components/acceptance-templates/acceptance-template-types";
import type {
  AcceptanceTemplate,
  AcceptanceTemplateSection,
} from "@/components/projects/project-acceptance-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requestBackendJson } from "@/lib/backend-client";

export function AcceptanceTemplateManagementShell({
  templates,
  filters,
  error,
}: {
  templates: AcceptanceTemplate[];
  filters: AcceptanceTemplateFilters;
  error: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [localTemplates, setLocalTemplates] = useState(templates);
  const [selectedId, setSelectedId] = useState(
    filters.templateId || templates[0]?.id || "",
  );
  const selectedTemplate = useMemo(
    () => localTemplates.find((template) => template.id === selectedId) ??
      localTemplates[0] ??
      null,
    [localTemplates, selectedId],
  );
  const [draft, setDraft] = useState<AcceptanceTemplate | null>(
    cloneAcceptanceTemplateForEdit(selectedTemplate),
  );
  const [saveError, setSaveError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalTemplates(templates);
    const nextSelectedId = filters.templateId || templates[0]?.id || "";
    const nextTemplate = templates.find((template) => template.id === nextSelectedId) ??
      templates[0] ??
      null;
    setSelectedId(nextSelectedId);
    setDraft(cloneAcceptanceTemplateForEdit(nextTemplate));
    setSaveError("");
    setSavedMessage("");
  }, [filters.templateId, templates]);

  function navigate(next: Partial<AcceptanceTemplateFilters>) {
    startTransition(() => {
      router.push(buildAcceptanceTemplatesHref({
        acceptanceType: next.acceptanceType ?? filters.acceptanceType,
        stageCode: next.stageCode ?? filters.stageCode,
        status: next.status ?? filters.status,
        templateId: next.templateId ?? "",
      }));
      router.refresh();
    });
  }

  function selectTemplate(templateId: string) {
    setSelectedId(templateId);
    setSaveError("");
    setSavedMessage("");
    const nextTemplate = localTemplates.find((template) => template.id === templateId) ?? null;
    setDraft(cloneAcceptanceTemplateForEdit(nextTemplate));
    navigate({ templateId });
  }

  function updateDraft(patch: Partial<AcceptanceTemplate>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  function updateSections(
    updater: (sections: AcceptanceTemplateSection[]) => AcceptanceTemplateSection[],
  ) {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, sections: updater(current.sections || []) };
    });
  }

  async function saveTemplate() {
    const validationError = getAcceptanceTemplateValidationError(draft);
    if (validationError) {
      setSaveError(validationError);
      setSavedMessage("");
      return;
    }
    if (!draft) return;

    setSaving(true);
    setSaveError("");
    setSavedMessage("");
    try {
      const saved = await requestBackendJson<AcceptanceTemplate>(
        `/project-acceptance-templates/${draft.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(buildAcceptanceTemplateUpdatePayload(draft)),
          fallbackMessage: "保存验收模板失败",
        },
      );
      setLocalTemplates((current) =>
        current.map((template) => template.id === saved.id ? saved : template)
      );
      setDraft(cloneAcceptanceTemplateForEdit(saved));
      setSavedMessage("验收模板已保存");
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存验收模板失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {saveError ? <StatusAlert>{saveError}</StatusAlert> : null}
      {savedMessage ? <StatusAlert tone="success">{savedMessage}</StatusAlert> : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-muted/20 p-3">
          <AcceptanceTemplateFiltersBar
            filters={filters}
            pending={pending || saving}
            onNavigate={navigate}
          />
        </CardHeader>
        <CardContent className="grid min-h-0 flex-1 grid-cols-1 p-0 lg:grid-cols-[320px_minmax(0,1fr)]">
          <AcceptanceTemplateList
            templates={localTemplates}
            selectedTemplateId={selectedTemplate?.id || ""}
            pending={pending}
            disabled={saving}
            onSelect={selectTemplate}
          />
          <AcceptanceTemplateEditor
            draft={draft}
            selectedTemplate={selectedTemplate}
            saving={saving}
            onDraftChange={updateDraft}
            onSectionsChange={updateSections}
            onReset={() => {
              setDraft(cloneAcceptanceTemplateForEdit(selectedTemplate));
              setSaveError("");
              setSavedMessage("");
            }}
            onSave={saveTemplate}
          />
        </CardContent>
      </Card>
    </div>
  );
}
