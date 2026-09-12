"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { AiModelRecord, AiRouteModelOptionPage, AiRouteModelOptionRecord, AiSceneRouteRecord, AiSystemSceneRecord } from "./ai-config-types";
import type { RouteModelOptionsState, RouteModelTarget } from "./ai-route-model-selector";
import { NONE_VALUE, requestBackend, routeModelOptionFromModel, type RouteFormState } from "./ai-model-routing-shared";
import { manualModelPayload, routeModality } from "./ai-route-editor-shared";
import { createModelRequestScope } from "./use-ai-provider-models";

const targets: RouteModelTarget[] = ["primary", "fallback"];
const emptyOptions = (): RouteModelOptionsState => ({
  data: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
  loading: false, error: null, selected: null,
});

function boundOption(model: AiModelRecord | null | undefined, id: string | null, modality: RouteFormState["modality"]) {
  if (model) return routeModelOptionFromModel(model);
  if (!id) return null;
  return { source: "internal" as const, value: id, model_id: id, provider_id: "", label: "原绑定模型（关联记录不可用）", description: null, modality, status: "unavailable" };
}

export function useAiRouteModelOptions(formRef: RefObject<RouteFormState>) {
  const [state, setState] = useState({ primary: emptyOptions(), fallback: emptyOptions() });
  const selectedRef = useRef<Record<RouteModelTarget, AiRouteModelOptionRecord | null>>({ primary: null, fallback: null });
  const scopes = useRef({ primary: createModelRequestScope(), fallback: createModelRequestScope() });

  useEffect(() => () => {
    scopes.current.primary.invalidate();
    scopes.current.fallback.invalidate();
  }, []);

  function update(target: RouteModelTarget, updater: (current: RouteModelOptionsState) => RouteModelOptionsState) {
    setState((current) => ({ ...current, [target]: updater(current[target]) }));
  }

  function invalidate(target?: RouteModelTarget, preserveSelection = false) {
    for (const item of target ? [target] : targets) {
      scopes.current[item].invalidate();
      if (!preserveSelection) selectedRef.current[item] = null;
      update(item, () => ({ ...emptyOptions(), selected: selectedRef.current[item] }));
    }
  }

  function select(target: RouteModelTarget, option: AiRouteModelOptionRecord | null) {
    selectedRef.current[target] = option;
    update(target, (current) => ({ ...current, selected: option }));
  }

  function bind(route: AiSceneRouteRecord, savedForm?: RouteFormState) {
    for (const target of targets) {
      const id = route[`${target}_model_id`];
      const model = route[`${target}_model`];
      const previous = selectedRef.current[target];
      const manual = savedForm?.[`${target}_manual`];
      const resolved = id && savedForm && (manual?.enabled || previous) ? {
        source: "internal" as const, value: id, model_id: id, provider_id: savedForm[`${target}_provider_id`],
        label: manual?.enabled ? manual.name.trim() || manual.model_name.trim() : previous?.label || id,
        description: manual?.enabled ? manual.model_name.trim() : previous?.description || null,
        modality: routeModality(savedForm), status: "active",
      } : null;
      select(target, model ? routeModelOptionFromModel(model) : resolved || boundOption(model, id, route.modality || "text"));
    }
  }

  async function load(target: RouteModelTarget, page = 1) {
    const form = formRef.current;
    const providerId = target === "primary" ? form.primary_provider_id : form.fallback_provider_id;
    const keyword = target === "primary" ? form.primary_keyword : form.fallback_keyword;
    if (!providerId) return;
    update(target, (current) => ({ ...current, loading: true, error: null,
      data: { ...current.data, pagination: { ...current.data.pagination, page } } }));
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    params.set("modality", routeModality(form)); params.set("status", "active");
    if (keyword.trim()) params.set("keyword", keyword.trim());
    await scopes.current[target].run(
      (signal) => requestBackend<AiRouteModelOptionPage>(`/platform/ai-config/providers/${providerId}/route-model-options?${params}`, { signal }),
      (response) => update(target, (current) => ({ ...current, data: response, loading: false, error: null })),
      () => update(target, (current) => ({ ...current, data: { ...current.data, discovery: { status: "failed" } }, loading: false, error: "模型候选加载失败，请重试或手动填写调用名称。" })),
    );
  }

  async function resolveOne(target: RouteModelTarget, form: RouteFormState, option: AiRouteModelOptionRecord | null, scene: AiSystemSceneRecord | null) {
    const manual = manualModelPayload(form, target, scene);
    const providerId = target === "primary" ? form.primary_provider_id : form.fallback_provider_id;
    if (manual) {
      const response = await requestBackend<{ model_id: string }>(`/platform/ai-config/providers/${providerId}/route-model-options:resolve`, {
        method: "POST", body: JSON.stringify(manual),
      });
      return response.model_id;
    }
    const currentId = target === "primary" ? form.primary_model_id : form.fallback_model_id;
    const value = target === "primary" ? form.primary_option_value : form.fallback_option_value;
    if (target === "fallback" && value === NONE_VALUE) return null;
    if (!option) return currentId && currentId !== NONE_VALUE ? currentId : null;
    if (option.source === "internal") return option.model_id || option.value;
    if (option.model_id) return option.model_id;
    const input = { source: "catalog", value: option.value };
    const response = await requestBackend<{ model_id: string }>(`/platform/ai-config/providers/${providerId}/route-model-options:resolve`, {
      method: "POST", body: JSON.stringify(input),
    });
    return response.model_id;
  }

  function resolve(form: RouteFormState, scene: AiSystemSceneRecord | null) {
    return Promise.all(targets.map((target) => resolveOne(target, form, selectedRef.current[target], scene)));
  }

  return { ...state, invalidate, select, bind, load, resolve };
}
