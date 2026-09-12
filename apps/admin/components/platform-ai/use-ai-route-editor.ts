"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import type { AiProviderRecord, AiSceneRouteRecord, AiSystemSceneRecord, PageData } from "./ai-config-types";
import type { RouteModelTarget } from "./ai-route-model-selector";
import { emptyRouteForm, NONE_VALUE, requestBackend, type RouteFormState } from "./ai-model-routing-shared";
import { useAiRouteModelOptions } from "./use-ai-route-model-options";
import { routeFormFromRecord, sceneFromRoute } from "./ai-route-editor-shared";

export function useAiRouteEditor({ providers, scenes: initialScenes, sceneError, canManage, onSaved, onBoundProviders }: {
  providers: AiProviderRecord[];
  scenes: PageData<AiSystemSceneRecord>;
  sceneError: string | null;
  canManage: boolean;
  onSaved: () => Promise<void>;
  onBoundProviders: (providers: AiProviderRecord[]) => void;
}) {
  const firstProvider = () => providers.find((provider) => provider.status === "active")?.id || "";
  const [form, setForm] = useState(() => emptyRouteForm(firstProvider()));
  const formRef = useRef(form);
  const [scene, setScene] = useState<AiSystemSceneRecord | null>(null);
  const sceneRef = useRef(scene);
  const [scenes, setScenes] = useState(initialScenes);
  const [sceneLoadError, setSceneLoadError] = useState(sceneError);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const candidates = useAiRouteModelOptions(formRef);

  function updateForm(next: RouteFormState) {
    formRef.current = next;
    setForm(next);
  }

  function updateScene(next: AiSystemSceneRecord | null) {
    sceneRef.current = next;
    setScene(next);
  }

  function changeForm(next: RouteFormState) {
    if (canManage && !savingRef.current) updateForm(next);
  }

  function loadCandidates(target: RouteModelTarget, page = 1) {
    if (!canManage || savingRef.current || !sceneRef.current) return;
    void candidates.load(target, page, sceneRef.current.runtime_status === "not_connected");
  }

  function reset() {
    if (savingRef.current) return;
    candidates.invalidate();
    updateScene(null);
    updateForm(emptyRouteForm(firstProvider()));
  }

  function changeScene(code: string) {
    if (!canManage || savingRef.current || formRef.current.id) return;
    const nextScene = scenes.list.find((item) => item.code === code);
    if (!nextScene || nextScene.source !== "system" || !nextScene.allow_new_configuration) return;
    candidates.invalidate();
    updateScene(nextScene);
    updateForm({ ...emptyRouteForm(firstProvider()), scene_code: code, name: nextScene.name, modality: nextScene.modality });
    loadCandidates("primary");
    loadCandidates("fallback");
  }

  function changeProvider(target: RouteModelTarget, providerId: string) {
    if (!canManage || savingRef.current || !sceneRef.current) return;
    if (!providers.some((provider) => provider.id === providerId && provider.status === "active")) return;
    const inspect = sceneRef.current.runtime_status === "not_connected";
    candidates.invalidate(target, inspect);
    const current = formRef.current;
    if (inspect) {
      updateForm(target === "primary"
        ? { ...current, primary_provider_id: providerId, primary_keyword: "" }
        : { ...current, fallback_provider_id: providerId, fallback_keyword: "" });
      loadCandidates(target);
      return;
    }
    updateForm(target === "primary"
      ? { ...current, primary_provider_id: providerId, primary_keyword: "", primary_option_value: "", primary_model_id: "" }
      : { ...current, fallback_provider_id: providerId, fallback_keyword: "", fallback_option_value: NONE_VALUE, fallback_model_id: NONE_VALUE });
    loadCandidates(target);
  }

  function changeKeyword(target: RouteModelTarget, keyword: string) {
    if (!canManage || savingRef.current) return;
    const current = formRef.current;
    updateForm(target === "primary" ? { ...current, primary_keyword: keyword } : { ...current, fallback_keyword: keyword });
  }

  function selectModel(target: RouteModelTarget, option: typeof candidates.primary.selected) {
    if (!canManage || savingRef.current || sceneRef.current?.runtime_status !== "connected") return;
    if (option?.status && option.status !== "active") return;
    const current = formRef.current;
    const providerId = target === "primary" ? current.primary_provider_id : current.fallback_provider_id;
    if (!providers.some((provider) => provider.id === providerId && provider.status === "active")) return;
    candidates.select(target, option);
    updateForm(target === "primary"
      ? { ...current, primary_option_value: option?.value || "", primary_model_id: option?.model_id || "" }
      : { ...current, fallback_option_value: option?.value || NONE_VALUE, fallback_model_id: option?.model_id || NONE_VALUE });
  }

  function edit(item: AiSceneRouteRecord) {
    if (!canManage || savingRef.current) return;
    candidates.invalidate();
    updateScene(scenes.list.find((candidate) => candidate.code === item.scene_code) || sceneFromRoute(item));
    updateForm(routeFormFromRecord(item, firstProvider()));
    onBoundProviders([item.primary_model?.provider, item.fallback_model?.provider]
      .filter((provider): provider is AiProviderRecord => Boolean(provider)));
    candidates.bind(item);
    loadCandidates("primary");
    loadCandidates("fallback");
  }

  async function submit() {
    const snapshot = formRef.current;
    const selectedScene = sceneRef.current;
    if (!canManage || savingRef.current) return;
    if (!snapshot.id && (!selectedScene || selectedScene.source !== "system"
      || !selectedScene.allow_new_configuration || selectedScene.runtime_status !== "connected" || sceneLoadError)) return;
    // Lock synchronously before resolution: no render or request can change this save's identity.
    savingRef.current = true;
    setSaving(true);
    try {
      const [primaryModelId, fallbackModelId] = selectedScene?.runtime_status === "not_connected"
        ? [snapshot.primary_model_id || null, snapshot.fallback_model_id === NONE_VALUE ? null : snapshot.fallback_model_id || null]
        : await candidates.resolve(snapshot);
      const mutable = {
        name: snapshot.name || undefined,
        primary_model_id: primaryModelId,
        fallback_model_id: fallbackModelId,
        temperature: snapshot.temperature ? Number(snapshot.temperature) : null,
        timeout_ms: snapshot.timeout_ms ? Number(snapshot.timeout_ms) : null,
        status: snapshot.status,
        ...(snapshot.quality_tier ? { quality_tier: snapshot.quality_tier } : {}),
        ...(snapshot.response_format ? { response_format: snapshot.response_format } : {}),
      };
      const payload = snapshot.id
        ? { ...mutable, expected_version: snapshot.version ?? 1 }
        : { ...mutable, scene_code: snapshot.scene_code };
      await requestBackend(snapshot.id ? `/platform/ai-config/routes/${snapshot.id}` : "/platform/ai-config/routes", {
        method: snapshot.id ? "PATCH" : "POST", body: JSON.stringify(payload),
      });
      toast.success(snapshot.id ? "场景路由已更新" : "场景路由已创建");
      candidates.invalidate();
      updateScene(null);
      updateForm(emptyRouteForm(firstProvider()));
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "场景路由保存失败");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function providerDeleted(providerId: string) {
    const current = formRef.current;
    const primaryDeleted = current.primary_provider_id === providerId;
    const fallbackDeleted = current.fallback_provider_id === providerId;
    if (sceneRef.current?.runtime_status === "not_connected") {
      if (primaryDeleted) candidates.invalidate("primary", true);
      if (fallbackDeleted) candidates.invalidate("fallback", true);
      updateForm({ ...current,
        ...(primaryDeleted ? { primary_provider_id: "", primary_keyword: "" } : {}),
        ...(fallbackDeleted ? { fallback_provider_id: "", fallback_keyword: "" } : {}),
      });
      return;
    }
    if (primaryDeleted) candidates.invalidate("primary");
    if (fallbackDeleted) candidates.invalidate("fallback");
    if (!primaryDeleted && !fallbackDeleted) return;
    updateForm({
      ...current,
      ...(primaryDeleted ? { primary_provider_id: "", primary_model_id: "", primary_keyword: "", primary_option_value: "" } : {}),
      ...(fallbackDeleted ? { fallback_provider_id: "", fallback_model_id: NONE_VALUE, fallback_keyword: "", fallback_option_value: NONE_VALUE } : {}),
    });
  }

  async function reloadScenes() {
    setSceneLoading(true);
    try {
      const response = await requestBackend<PageData<AiSystemSceneRecord>>("/platform/ai-config/system-scenes?page=1&pageSize=20");
      setScenes(response);
      setSceneLoadError(null);
    } catch (error) {
      setSceneLoadError(error instanceof Error ? error.message : "业务场景注册表加载失败");
    } finally {
      setSceneLoading(false);
    }
  }

  return {
    form, scene, scenes, sceneLoadError, sceneLoading, saving,
    primaryOptions: candidates.primary, fallbackOptions: candidates.fallback,
    changeForm, changeScene, changeProvider, changeKeyword, selectModel,
    searchModels: loadCandidates, edit, reset, submit, providerDeleted, reloadScenes,
  };
}
