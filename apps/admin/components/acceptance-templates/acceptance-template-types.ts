import type { AcceptanceTemplate } from "@/components/projects/project-acceptance-types";

export type AcceptanceTemplateListData = {
  list?: AcceptanceTemplate[];
};

export type AcceptanceTemplateFilters = {
  acceptanceType: string;
  stageCode: string;
  status: string;
  templateId: string;
};
