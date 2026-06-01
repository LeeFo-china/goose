"use client";

import type { UseFormReturn } from "react-hook-form";
import {
  CampaignBasicFields,
  CampaignRewardFields,
  CampaignRuleFields,
  CampaignScopeFields,
} from "@/components/marketing/marketing-campaign-form-sections";
import type { MarketingProjectOption } from "@/components/marketing/marketing-types";
import type { CampaignFormValues } from "@/components/marketing/marketing-mutation-shared";

export function CampaignFormFields({
  form,
  mode,
  projectIds,
  projectKeyword,
  projectLoading,
  projectError,
  projectOptions,
  projectPagination,
  canGoPrevProjectPage,
  canGoNextProjectPage,
  setProjectIds,
  setProjectKeyword,
  setProjectPage,
  setProjectReloadKey,
  toggleProject,
}: {
  form: UseFormReturn<CampaignFormValues>;
  mode: "create" | "edit";
  projectIds: string[];
  projectKeyword: string;
  projectLoading: boolean;
  projectError: string;
  projectOptions: MarketingProjectOption[];
  projectPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  canGoPrevProjectPage: boolean;
  canGoNextProjectPage: boolean;
  setProjectIds: (projectIds: string[]) => void;
  setProjectKeyword: (keyword: string) => void;
  setProjectPage: (updater: number | ((page: number) => number)) => void;
  setProjectReloadKey: (updater: number | ((value: number) => number)) => void;
  toggleProject: (projectId: string, checked: boolean) => void;
}) {
  const campaignType = form.watch("campaign_type");
  const targetScopeType = form.watch("target_scope_type");

  return (
    <>
      <CampaignBasicFields form={form} mode={mode} />
      <CampaignScopeFields
        form={form}
        projectIds={projectIds}
        projectKeyword={projectKeyword}
        projectLoading={projectLoading}
        projectError={projectError}
        projectOptions={projectOptions}
        projectPagination={projectPagination}
        targetScopeType={targetScopeType}
        canGoPrevProjectPage={canGoPrevProjectPage}
        canGoNextProjectPage={canGoNextProjectPage}
        setProjectIds={setProjectIds}
        setProjectKeyword={setProjectKeyword}
        setProjectPage={setProjectPage}
        setProjectReloadKey={setProjectReloadKey}
        toggleProject={toggleProject}
      />
      <CampaignRuleFields form={form} campaignType={campaignType} />
      <CampaignRewardFields form={form} />
    </>
  );
}
