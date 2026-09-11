"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AiProviderRecord, AiSceneRouteRecord, AiSystemSceneRecord, PageData } from "./ai-config-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiModelRouteTab } from "./ai-model-route-tab";
import { ProviderFormCard, ProviderTable } from "./ai-model-routing-sections";
import { providerPageAfterDelete } from "./ai-provider-delete-state";
import { useAiRouteEditor } from "./use-ai-route-editor";
import {
  emptyProviderForm, providerFormFromRecord, providerReferencePatch, requestBackend, type ProviderFormState,
} from "./ai-model-routing-shared";

export function AiModelRoutingPanel({
  providerPage: initialProviderPage,
  routePage: initialRoutePage,
  providerOptions: initialProviderOptions,
  systemScenePage,
  systemSceneError = null,
  canManageProviders = false,
  canManageRoutes = false,
}: {
  providerPage: PageData<AiProviderRecord>;
  routePage: PageData<AiSceneRouteRecord>;
  providerOptions: AiProviderRecord[];
  systemScenePage: PageData<AiSystemSceneRecord>;
  systemSceneError?: string | null;
  canManageProviders?: boolean;
  canManageRoutes?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [providerPage, setProviderPage] = useState(initialProviderPage);
  const [routePage, setRoutePage] = useState(initialRoutePage);
  const [providerOptions, setProviderOptions] = useState(initialProviderOptions);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(emptyProviderForm());
  const providerPageRequest = useRef(0);
  const providerOptionsRequest = useRef(0);
  const routePageRequest = useRef(0);
  const editor = useAiRouteEditor({
    providers: providerOptions,
    scenes: systemScenePage,
    sceneError: systemSceneError,
    canManage: canManageRoutes,
    onSaved: async () => { await loadRoutePage(routePage.pagination.page); refresh(); },
    onBoundProviders: (records) => setProviderOptions((current) => [
      ...current, ...records.filter((record) => !current.some((item) => item.id === record.id)),
    ]),
  });

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function loadProviderPage(page: number, propagateFailure = false) {
    const requestId = ++providerPageRequest.current;
    setProviderLoading(true);
    try {
      const response = await requestBackend<PageData<AiProviderRecord>>(
        `/platform/ai-config/providers?page=${page}&pageSize=20`,
      );
      if (requestId === providerPageRequest.current) setProviderPage(response);
    } catch (error) {
      if (propagateFailure) throw error;
      toast.error(error instanceof Error ? error.message : "供应商列表加载失败");
    } finally {
      if (requestId === providerPageRequest.current) setProviderLoading(false);
    }
  }

  async function loadProviderOptions(propagateFailure = false) {
    const requestId = ++providerOptionsRequest.current;
    try {
      const response = await requestBackend<PageData<AiProviderRecord>>(
        "/platform/ai-config/providers?page=1&pageSize=100",
      );
      if (requestId === providerOptionsRequest.current) setProviderOptions(response.list);
      return response.list;
    } catch (error) {
      if (propagateFailure) throw error;
      toast.error(error instanceof Error ? error.message : "供应商选项加载失败");
      return providerOptions;
    }
  }

  async function loadRoutePage(page: number) {
    const requestId = ++routePageRequest.current;
    setRouteLoading(true);
    try {
      const response = await requestBackend<PageData<AiSceneRouteRecord>>(
        `/platform/ai-config/routes?page=${page}&pageSize=20`,
      );
      if (requestId === routePageRequest.current) setRoutePage(response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "场景路由列表加载失败");
    } finally {
      if (requestId === routePageRequest.current) setRouteLoading(false);
    }
  }

  async function reloadProviderState() {
    await Promise.all([loadProviderPage(providerPage.pagination.page), loadProviderOptions()]);
  }

  async function providerDeleted(provider: AiProviderRecord) {
    ++providerPageRequest.current;
    ++providerOptionsRequest.current;
    const nextPage = providerPageAfterDelete(providerPage.pagination.page, providerPage.list.length);
    setProviderPage((current) => {
      const total = Math.max(0, current.pagination.total - 1);
      return {
        list: current.list.filter((item) => item.id !== provider.id),
        pagination: { ...current.pagination, page: nextPage, total, totalPages: Math.ceil(total / current.pagination.pageSize) },
      };
    });
    setProviderOptions((current) => current.filter((item) => item.id !== provider.id));
    setProviderForm((current) => current.id === provider.id ? emptyProviderForm() : current);
    editor.providerDeleted(provider.id);
    try { await Promise.all([loadProviderPage(nextPage, true), loadProviderOptions(true)]); }
    finally { refresh(); }
  }

  async function submitProvider() {
    setProviderSaving(true);
    try { await persistProvider(); }
    finally { setProviderSaving(false); }
  }

  async function persistProvider() {
    const payload = {
      name: providerForm.name,
      endpoint_url: providerForm.endpoint_url || null,
      ...providerReferencePatch(providerForm),
      status: providerForm.status,
      sort_order: Number(providerForm.sort_order || 0),
      ...(providerForm.id ? { expected_version: providerForm.version ?? 1 } : {}),
    };
    const savedProvider = await requestBackend<AiProviderRecord>(
      providerForm.id ? `/platform/ai-config/providers/${providerForm.id}` : "/platform/ai-config/providers",
      { method: providerForm.id ? "PATCH" : "POST", body: JSON.stringify(payload) },
    );
    toast.success(providerForm.id ? "供应商已更新" : "供应商已创建");
    setProviderForm(providerFormFromRecord(savedProvider));
    await reloadProviderState();
    refresh();
  }

  return (
    <Tabs defaultValue="routes" className="flex min-h-0 flex-1 flex-col gap-4">
      <TabsList className="w-fit shrink-0">
        <TabsTrigger value="routes">场景路由</TabsTrigger>
        <TabsTrigger value="providers">供应商</TabsTrigger>
      </TabsList>
      <TabsContent value="routes" className="m-0 min-h-0 flex-1 overflow-hidden">
        <AiModelRouteTab
          routePage={routePage}
          scenes={editor.scenes}
          sceneLoadError={editor.sceneLoadError}
          sceneLoading={editor.sceneLoading}
          providers={providerOptions}
          primaryOptions={editor.primaryOptions}
          fallbackOptions={editor.fallbackOptions}
          routeForm={editor.form}
          selectedScene={editor.scene}
          isPending={isPending}
          isRouteLoading={routeLoading}
          isRouteSaving={editor.saving}
          canManageRoutes={canManageRoutes}
          onRouteFormChange={editor.changeForm}
          onSceneChange={editor.changeScene}
          onSceneRetry={() => void editor.reloadScenes()}
          onRouteSubmit={editor.submit}
          onRouteReset={editor.reset}
          onRouteEdit={editor.edit}
          onRoutePageChange={(page) => void loadRoutePage(page)}
          onProviderChange={editor.changeProvider}
          onKeywordChange={editor.changeKeyword}
          onModelSearch={editor.searchModels}
          onModelSelect={editor.selectModel}
        />
      </TabsContent>
      <TabsContent value="providers" className="m-0 min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full min-h-0 auto-rows-max gap-4 overflow-auto xl:auto-rows-fr xl:grid-cols-[360px_minmax(0,1fr)] xl:overflow-hidden">
          <ProviderFormCard
            form={providerForm}
            isPending={isPending}
            onChange={setProviderForm}
            onSubmit={submitProvider}
            onReset={() => setProviderForm(emptyProviderForm())}
          />
          <ProviderTable
            page={providerPage}
            pending={providerLoading}
            onEdit={(item) => setProviderForm(providerFormFromRecord(item))}
            onDelete={canManageProviders ? providerDeleted : undefined}
            deleteDisabled={providerSaving || editor.saving}
            onPageChange={(page) => void loadProviderPage(page)}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
