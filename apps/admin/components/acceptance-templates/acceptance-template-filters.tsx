"use client";

import { FormSelect } from "@/components/admin/form-select";
import type { AcceptanceTemplateFilters } from "@/components/acceptance-templates/acceptance-template-types";
import {
  ACCEPTANCE_TEMPLATE_ALL_VALUE,
  acceptanceTemplateStageOptions,
  acceptanceTemplateStatusOptions,
  acceptanceTemplateTypeOptions,
} from "@/components/acceptance-templates/acceptance-template-options";

export function AcceptanceTemplateFiltersBar({
  filters,
  pending,
  onNavigate,
}: {
  filters: AcceptanceTemplateFilters;
  pending: boolean;
  onNavigate: (next: Partial<AcceptanceTemplateFilters>) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-[160px_180px_150px_minmax(0,1fr)]">
      <FormSelect
        id="acceptance-template-type-filter"
        value={filters.acceptanceType || ACCEPTANCE_TEMPLATE_ALL_VALUE}
        disabled={pending}
        options={acceptanceTemplateTypeOptions}
        triggerClassName="bg-card shadow-none"
        onChange={(value) =>
          onNavigate({
            acceptanceType: value === ACCEPTANCE_TEMPLATE_ALL_VALUE ? "" : value,
            templateId: "",
          })}
      />
      <FormSelect
        id="acceptance-template-stage-filter"
        value={filters.stageCode || ACCEPTANCE_TEMPLATE_ALL_VALUE}
        disabled={pending}
        options={acceptanceTemplateStageOptions}
        triggerClassName="bg-card shadow-none"
        onChange={(value) =>
          onNavigate({
            stageCode: value === ACCEPTANCE_TEMPLATE_ALL_VALUE ? "" : value,
            templateId: "",
          })}
      />
      <FormSelect
        id="acceptance-template-status-filter"
        value={filters.status || ACCEPTANCE_TEMPLATE_ALL_VALUE}
        disabled={pending}
        options={acceptanceTemplateStatusOptions}
        triggerClassName="bg-card shadow-none"
        onChange={(value) =>
          onNavigate({
            status: value === ACCEPTANCE_TEMPLATE_ALL_VALUE ? "" : value,
            templateId: "",
          })}
      />
      <div className="flex items-center text-sm text-muted-foreground">
        使用筛选定位模板，选择后在右侧维护验收项。
      </div>
    </div>
  );
}
