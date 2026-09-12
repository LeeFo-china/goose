"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AiProviderRecord, AiSceneRouteRecord, AiSystemSceneRecord, PageData } from "./ai-config-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiModelRouteTab } from "./ai-model-route-tab";
import { AiProviderWorkspace } from "./ai-provider-workspace";
import { providerPageAfterDelete } from "./ai-provider-delete-state";
import { useAiRouteEditor } from "./use-ai-route-editor";
import {
  mergeProviderRecords, requestBackend,
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
  const [providerError, setProviderError] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const providerPageRequest = useRef(0);
  const providerOptionsRequest = useRef(0);
  const routePageRequest = useRef(0);
  useEffect(() => () => {
    providerPageRequest.current += 1; providerOptionsRequest.current += 1; routePageRequest.current += 1;
  }, []);
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
    setProviderError("");
    try {
      const response = await requestBackend<PageData<AiProviderRecord>>(
        `/platform/ai-config/providers?page=${page}&pageSize=20`,
      );
      if (requestId === providerPageRequest.current) {
        setProviderPage(response);
        setProviderOptions((current) => mergeProviderRecords(current, response.list));
      }
      return response.list;
    } catch (error) {
      if (propagateFailure) throw error;
      if (requestId === providerPageRequest.current) setProviderError("供应商列表加载失败，请重试。");
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
      if (requestId === providerOptionsRequest.current) setProviderOptions((current) => mergeProviderRecords(current, response.list));
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
    const [page, options] = await Promise.all([loadProviderPage(providerPage.pagination.page, true), loadProviderOptions(true)]);
    return mergeProviderRecords(options, page || []);
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
    editor.providerDeleted(provider.id);
    try { await Promise.all([loadProviderPage(nextPage, true), loadProviderOptions(true)]); }
    finally { refresh(); }
  }

  async function providerSaved(savedProvider: AiProviderRecord) {
    setProviderOptions((current) => [...current.filter((item) => item.id !== savedProvider.id), savedProvider]);
    setProviderPage((current) => ({ ...current, list: current.list.map((item) => item.id === savedProvider.id ? savedProvider : item) }));
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
          sceneKeyword={editor.sceneKeyword}
          saveError={editor.saveError}
          onSceneSearch={(page, keyword) => void editor.reloadScenes(page, keyword)}
          onSceneMutation={editor.mutateScene}
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
          onSceneRetry={() => void editor.refresh()}
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
        <AiProviderWorkspace
          page={providerPage}
          providers={providerOptions}
          pending={providerLoading}
          error={providerError}
          canManage={canManageProviders}
          onSaved={providerSaved}
          onReload={async (id) => (await reloadProviderState()).find((item) => item.id === id) || null}
          onDeleted={providerDeleted}
          deleteDisabled={editor.saving}
          onPageChange={(page) => void loadProviderPage(page)}
        />
      </TabsContent>
    </Tabs>
  );
}
