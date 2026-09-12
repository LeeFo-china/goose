"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AiProviderRecord, AiSceneRouteRecord, AiSystemSceneRecord, PageData } from "./ai-config-types";
import type { RouteModelTarget } from "./ai-route-model-selector";
import { aiConfigErrorFeedback, emptyRouteForm, NONE_VALUE, requestBackend, type RouteFormState } from "./ai-model-routing-shared";
import { useAiRouteModelOptions } from "./use-ai-route-model-options";
import { createModelRequestScope } from "./use-ai-provider-models";
import { mergeSceneOptions, routeFormFromRecord, routeIdentity, routeModality, routeMutablePayload, routeValidation, sceneDeleteConfirmed, sceneFromRoute, sceneQueryPath } from "./ai-route-editor-shared";

export type SceneMutation = { name: string } | { status: "active" | "inactive" } | { delete: true };

export function useAiRouteEditor({ providers, scenes: initialScenes, sceneError, canManage, onSaved, onBoundProviders }: {
  providers: AiProviderRecord[]; scenes: PageData<AiSystemSceneRecord>; sceneError: string | null;
  canManage: boolean; onSaved: () => Promise<void>; onBoundProviders: (providers: AiProviderRecord[]) => void;
}) {
  const firstProvider = () => providers.find((provider) => provider.status === "active")?.id || "";
  const [form, setForm] = useState(() => emptyRouteForm(firstProvider()));
  const formRef = useRef(form);
  const [scene, setScene] = useState<AiSystemSceneRecord | null>(null);
  const sceneRef = useRef(scene);
  const [scenes, setScenes] = useState(initialScenes);
  const scenesRef = useRef(scenes);
  const [sceneKeyword, setSceneKeyword] = useState("");
  const keywordRef = useRef("");
  const [sceneLoadError, setSceneLoadError] = useState(sceneError);
  const [sceneLoading, setSceneLoading] = useState(false);
  const sceneScope = useRef(createModelRequestScope());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState("");
  const candidates = useAiRouteModelOptions(formRef);

  useEffect(() => () => sceneScope.current.invalidate(), []);

  function updateForm(next: RouteFormState) { formRef.current = next; setForm(next); }
  function updateScene(next: AiSystemSceneRecord | null) { sceneRef.current = next; setScene(next); }
  function updateScenes(next: PageData<AiSystemSceneRecord>) { scenesRef.current = next; setScenes(next); }
  function loadCandidates(target: RouteModelTarget, page = 1) {
    if (!canManage || savingRef.current) return;
    void candidates.load(target, page);
  }
  function changeForm(next: RouteFormState) {
    if (!canManage || savingRef.current) return;
    const current = formRef.current;
    if (next.scene_source !== current.scene_source || routeModality(next) !== routeModality(current)) {
      if (current.id) return;
      candidates.invalidate(); updateScene(null);
      next = { ...next, scene_code: "", primary_model_id: "", primary_option_value: "",
        fallback_model_id: NONE_VALUE, fallback_option_value: NONE_VALUE, modality: routeModality(next) };
    }
    updateForm(next); setSaveError("");
    if (next.scene_source === "custom" && (current.scene_source !== next.scene_source || routeModality(current) !== routeModality(next))) {
      loadCandidates("primary"); loadCandidates("fallback");
    }
  }
  function reset() {
    if (savingRef.current) return;
    candidates.invalidate(); updateScene(null); updateForm(emptyRouteForm(firstProvider())); setSaveError("");
  }
  function changeScene(code: string) {
    if (!canManage || savingRef.current || formRef.current.id) return;
    const nextScene = scenesRef.current.list.find((item) => item.code === code) || (sceneRef.current?.code === code ? sceneRef.current : null);
    if (!nextScene || (!nextScene.allow_new_configuration && nextScene.source !== "custom")) return;
    candidates.invalidate(); updateScene(nextScene);
    updateForm({ ...emptyRouteForm(firstProvider()), scene_code: code, name: nextScene.name, modality: nextScene.modality });
    setSaveError(""); loadCandidates("primary"); loadCandidates("fallback");
  }
  function changeProvider(target: RouteModelTarget, providerId: string) {
    if (!canManage || savingRef.current) return;
    if (!providers.some((provider) => provider.id === providerId && provider.status === "active")) return;
    candidates.invalidate(target);
    updateForm({ ...formRef.current, [`${target}_provider_id`]: providerId, [`${target}_keyword`]: "",
      [`${target}_option_value`]: target === "primary" ? "" : NONE_VALUE,
      [`${target}_model_id`]: target === "primary" ? "" : NONE_VALUE,
      [`${target}_manual`]: { enabled: false, name: "", model_name: "" } });
    loadCandidates(target);
  }
  function changeKeyword(target: RouteModelTarget, keyword: string) {
    if (!canManage || savingRef.current) return;
    candidates.invalidate(target, true);
    updateForm({ ...formRef.current, [`${target}_keyword`]: keyword });
  }
  function selectModel(target: RouteModelTarget, option: typeof candidates.primary.selected) {
    if (!canManage || savingRef.current || option?.source === "manual") return;
    if (option?.status && option.status !== "active") return;
    const current = formRef.current;
    if (option && option.modality !== routeModality(current)) return;
    const providerId = current[`${target}_provider_id`];
    if (!providers.some((provider) => provider.id === providerId && provider.status === "active")) return;
    candidates.select(target, option);
    updateForm({ ...current, [`${target}_option_value`]: option?.value || (target === "primary" ? "" : NONE_VALUE),
      [`${target}_model_id`]: option?.model_id || (target === "primary" ? "" : NONE_VALUE),
      [`${target}_manual`]: { ...current[`${target}_manual`], enabled: false } });
  }
  function edit(item: AiSceneRouteRecord) {
    if (!canManage || savingRef.current) return;
    candidates.invalidate();
    updateScene(scenesRef.current.list.find((candidate) => candidate.code === item.scene_code) || sceneFromRoute(item));
    updateForm(routeFormFromRecord(item, firstProvider())); setSaveError("");
    onBoundProviders([item.primary_model?.provider, item.fallback_model?.provider].filter((provider): provider is AiProviderRecord => Boolean(provider)));
    candidates.bind(item); loadCandidates("primary"); loadCandidates("fallback");
    void reloadScenes(1, item.scene_code);
  }
  async function submit() {
    if (!canManage || savingRef.current) return;
    const snapshot = formRef.current;
    const selectedScene = sceneRef.current;
    const invalid = routeValidation(snapshot, selectedScene);
    if (invalid) { setSaveError(invalid); return; }
    for (const target of ["primary", "fallback"] as const) {
      const selected = candidates[target].selected;
      const manual = snapshot[`${target}_manual`].enabled;
      if ((manual || selected) && (!providers.some((provider) => provider.id === snapshot[`${target}_provider_id`] && provider.status === "active")
        || (!manual && selected?.status && selected.status !== "active"))) {
        setSaveError("请恢复或更换已停用的供应商、模型。"); return;
      }
    }
    savingRef.current = true; setSaving(true); setSaveError("");
    try {
      const modelIds = await candidates.resolve(snapshot, selectedScene);
      const mutable = routeMutablePayload(snapshot, modelIds);
      const payload = snapshot.id ? { ...mutable, expected_version: snapshot.version ?? 1 } : { ...mutable, ...routeIdentity(snapshot) };
      const saved = await requestBackend<AiSceneRouteRecord>(snapshot.id ? `/platform/ai-config/routes/${snapshot.id}` : "/platform/ai-config/routes", {
        method: snapshot.id ? "PATCH" : "POST", body: JSON.stringify(payload),
      });
      candidates.invalidate(undefined, true); updateForm({ ...routeFormFromRecord(saved, firstProvider()),
        primary_provider_id: snapshot.primary_provider_id, fallback_provider_id: snapshot.fallback_provider_id });
      updateScene(selectedScene || sceneFromRoute(saved)); candidates.bind(saved, snapshot);
      toast.success(snapshot.id ? "场景路由已更新" : "场景路由已创建");
      await reloadScenes(1, saved.scene_code); await onSaved();
    } catch (error) {
      setSaveError(aiConfigErrorFeedback(error, "场景路由保存未确认，请刷新列表检查后重试。").message);
    } finally { savingRef.current = false; setSaving(false); }
  }
  function providerDeleted(providerId: string) {
    const next = { ...formRef.current };
    for (const target of ["primary", "fallback"] as const) {
      if (next[`${target}_provider_id`] !== providerId) continue;
      candidates.invalidate(target);
      next[`${target}_provider_id`] = ""; next[`${target}_keyword`] = "";
      next[`${target}_model_id`] = next[`${target}_option_value`] = target === "primary" ? "" : NONE_VALUE;
      next[`${target}_manual`] = { enabled: false, name: "", model_name: "" };
    }
    updateForm(next);
  }
  async function reloadScenes(page = 1, keyword = keywordRef.current) {
    if (page > 1 && (sceneLoading || page !== scenesRef.current.pagination.page + 1)) return;
    keywordRef.current = keyword; setSceneKeyword(keyword); setSceneLoading(true);
    await sceneScope.current.run(
      (signal) => requestBackend<PageData<AiSystemSceneRecord>>(sceneQueryPath(page, keyword), { signal }),
      (response) => {
        updateScenes({ ...response, list: page === 1 ? response.list : mergeSceneOptions(scenesRef.current.list, response.list) });
        const selected = response.list.find((item) => item.code === formRef.current.scene_code);
        if (selected) updateScene(selected);
        setSceneLoadError(null); setSceneLoading(false);
      },
      () => { setSceneLoadError("场景列表加载失败，请重试。"); setSceneLoading(false); },
    );
  }
  async function refresh() {
    if (savingRef.current) return;
    const snapshot = formRef.current;
    savingRef.current = true; setSaving(true);
    try {
      await reloadScenes(1, snapshot.scene_code || keywordRef.current);
      if (snapshot.id) {
        const query = new URLSearchParams({ page: "1", pageSize: "20", sceneCode: snapshot.scene_code });
        if (snapshot.quality_tier) query.set("qualityTier", snapshot.quality_tier);
        const response = await requestBackend<PageData<AiSceneRouteRecord>>(`/platform/ai-config/routes?${query}`);
        const fresh = response.list.find((item) => item.id === snapshot.id);
        if (fresh) {
          candidates.invalidate();
          updateForm(routeFormFromRecord(fresh, snapshot.primary_provider_id)); candidates.bind(fresh);
        }
      }
      setSaveError(""); await onSaved();
    } catch { setSaveError("配置刷新失败，请重试。"); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function mutateScene(change: SceneMutation): Promise<boolean> {
    const selected = sceneRef.current;
    if (!canManage || savingRef.current || selected?.source !== "custom") return false;
    if (!selected.version) { setSaveError("场景版本缺失，请刷新场景后重试。"); return false; }
    savingRef.current = true; setSaving(true); setSaveError("");
    try {
      const deleting = "delete" in change;
      const path = `/platform/ai-config/scenes/${encodeURIComponent(selected.code)}`;
      if (deleting) {
        const acknowledgement = await requestBackend<unknown>(path, { method: "DELETE", body: JSON.stringify({ expected_version: selected.version }) });
        if (!sceneDeleteConfirmed(acknowledgement, selected.code)) { setSaveError("场景删除未确认，请刷新场景检查后重试。"); return false; }
        updateScenes({ ...scenesRef.current, list: scenesRef.current.list.filter((item) => item.code !== selected.code) });
        candidates.invalidate(); updateScene(null); updateForm(emptyRouteForm(firstProvider()));
      } else {
        const result = await requestBackend<AiSystemSceneRecord>(path, { method: "PATCH", body: JSON.stringify({ ...change, expected_version: selected.version }) });
        updateScene(result); updateScenes({ ...scenesRef.current, list: mergeSceneOptions(scenesRef.current.list, [result]) });
      }
      toast.success(deleting ? "场景已删除" : "场景已更新");
      await reloadScenes(); await onSaved(); return true;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : "";
      setSaveError(code === "AI_CUSTOM_SCENE_IN_USE" ? "场景仍被路由引用，无法删除。请先解除引用。"
        : aiConfigErrorFeedback(error, "场景操作未确认，请刷新场景检查后重试。").message);
      return false;
    } finally { savingRef.current = false; setSaving(false); }
  }
  return {
    form, scene, scenes, sceneKeyword, sceneLoadError, sceneLoading, saving, saveError,
    primaryOptions: candidates.primary, fallbackOptions: candidates.fallback,
    changeForm, changeScene, changeProvider, changeKeyword, selectModel, mutateScene,
    searchModels: loadCandidates, edit, reset, submit, providerDeleted, reloadScenes, refresh,
  };
}
