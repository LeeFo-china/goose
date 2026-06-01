"use client";

import { useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { MarketingCampaignDetail, MarketingProjectOption } from "@/components/marketing/marketing-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import { CampaignFormFields } from "@/components/marketing/marketing-campaign-form-fields";
import { buildCampaignPayload, buildDefaults, CampaignFormSchema, defaultValues, normalizeProjectOption, PROJECT_SELECTOR_PAGE_SIZE, requestMarketing, type CampaignFormValues, type ProjectOptionsData } from "@/components/marketing/marketing-mutation-shared";

export function CampaignFormDialog({
  open,
  mode,
  campaign,
  projects,
  onOpenChange,
}: {
  open: boolean;
  mode: "create" | "edit";
  campaign?: MarketingCampaignDetail | null;
  projects: MarketingProjectOption[];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [projectKeyword, setProjectKeyword] = useState("");
  const [projectPage, setProjectPage] = useState(1);
  const [projectOptions, setProjectOptions] = useState<MarketingProjectOption[]>(projects);
  const [projectPagination, setProjectPagination] = useState({
    page: 1,
    pageSize: PROJECT_SELECTOR_PAGE_SIZE,
    total: projects.length,
    totalPages: projects.length ? 1 : 0,
  });
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [projectReloadKey, setProjectReloadKey] = useState(0);
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(CampaignFormSchema as never) as Resolver<CampaignFormValues>,
    defaultValues,
  });
  const title = mode === "create" ? "新建营销活动" : "编辑营销活动";

  useEffect(() => {
    if (!open) return;
    const defaults = buildDefaults(campaign);
    form.reset(defaults);
    setProjectIds(
      defaults.target_scope_type === "project_list"
        ? campaign?.include_project_ids || []
        : campaign?.exclude_project_ids || [],
    );
    setProjectKeyword("");
    setProjectPage(1);
    setProjectOptions(projects);
    setProjectPagination({
      page: 1,
      pageSize: PROJECT_SELECTOR_PAGE_SIZE,
      total: projects.length,
      totalPages: projects.length ? 1 : 0,
    });
    setProjectError("");
    setProjectReloadKey((value) => value + 1);
    setError("");
  }, [campaign, form, open, projects]);

  useEffect(() => {
    if (!open) return;

    let ignore = false;
    const timer = window.setTimeout(async () => {
      const query = new URLSearchParams({
        page: String(projectPage),
        pageSize: String(PROJECT_SELECTOR_PAGE_SIZE),
      });
      if (projectKeyword.trim()) {
        query.set("keyword", projectKeyword.trim());
      }

      setProjectLoading(true);
      setProjectError("");
      try {
        const data = await requestMarketing<ProjectOptionsData>({
          path: `/marketing-pages/project-options?${query.toString()}`,
        });
        if (ignore) return;
        setProjectOptions((data?.list || []).map(normalizeProjectOption));
        setProjectPagination(data?.pagination || {
          page: projectPage,
          pageSize: PROJECT_SELECTOR_PAGE_SIZE,
          total: 0,
          totalPages: 0,
        });
      } catch (err) {
        if (ignore) return;
        setProjectOptions([]);
        setProjectPagination({
          page: projectPage,
          pageSize: PROJECT_SELECTOR_PAGE_SIZE,
          total: 0,
          totalPages: 0,
        });
        setProjectError(err instanceof Error ? err.message : "项目加载失败");
      } finally {
        if (!ignore) {
          setProjectLoading(false);
        }
      }
    }, projectKeyword ? 300 : 0);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [open, projectKeyword, projectPage, projectReloadKey]);

  function toggleProject(projectId: string, checked: boolean) {
    setProjectIds((current) =>
      checked
        ? Array.from(new Set([...current, projectId]))
        : current.filter((id) => id !== projectId)
    );
  }

  function submit(values: CampaignFormValues) {
    if (values.target_scope_type === "project_list" && projectIds.length === 0) {
      setError("指定项目范围至少要选择 1 个项目");
      return;
    }

    const payload = buildCampaignPayload(values, projectIds);
    setError("");
    startTransition(async () => {
      try {
        if (mode === "create") {
          await requestMarketing({
            path: "/employee/marketing-center/campaigns",
            method: "POST",
            payload,
          });
        } else if (campaign?.id) {
          await requestMarketing({
            path: `/employee/marketing-center/campaigns/${campaign.id}`,
            method: "PUT",
            payload,
          });
        }
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    });
  }

  const canGoPrevProjectPage = projectPagination.page > 1 && !projectLoading;
  const canGoNextProjectPage = (
    projectPagination.totalPages > 0
    && projectPagination.page < projectPagination.totalPages
    && !projectLoading
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            配置营销活动的类型、有效期、奖励信息和可参与项目范围。
          </DialogDescription>
        </DialogHeader>
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
          <CampaignFormFields
            form={form}
            mode={mode}
            projectIds={projectIds}
            projectKeyword={projectKeyword}
            projectLoading={projectLoading}
            projectError={projectError}
            projectOptions={projectOptions}
            projectPagination={projectPagination}
            canGoPrevProjectPage={canGoPrevProjectPage}
            canGoNextProjectPage={canGoNextProjectPage}
            setProjectIds={setProjectIds}
            setProjectKeyword={setProjectKeyword}
            setProjectPage={setProjectPage}
            setProjectReloadKey={setProjectReloadKey}
            toggleProject={toggleProject}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
