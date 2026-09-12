"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { AiModelRecord, AiRouteModelOptionRecord, AiSceneRouteRecord, PageData } from "./ai-config-types";
import type { RouteModelOptionsState, RouteModelTarget } from "./ai-route-model-selector";
import { NONE_VALUE, requestBackend, routeModelOptionFromModel, type RouteFormState } from "./ai-model-routing-shared";

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
  const generation = useRef({ primary: 0, fallback: 0 });

  useEffect(() => () => {
    generation.current.primary += 1;
    generation.current.fallback += 1;
  }, []);

  function update(target: RouteModelTarget, updater: (current: RouteModelOptionsState) => RouteModelOptionsState) {
    setState((current) => ({ ...current, [target]: updater(current[target]) }));
  }

  function invalidate(target?: RouteModelTarget, preserveSelection = false) {
    for (const item of target ? [target] : targets) {
      generation.current[item] += 1;
      if (!preserveSelection) selectedRef.current[item] = null;
      update(item, () => ({ ...emptyOptions(), selected: selectedRef.current[item] }));
    }
  }

  function select(target: RouteModelTarget, option: AiRouteModelOptionRecord | null) {
    selectedRef.current[target] = option;
    update(target, (current) => ({ ...current, selected: option }));
  }

  function bind(route: AiSceneRouteRecord) {
    select("primary", boundOption(route.primary_model, route.primary_model_id, route.modality || "text"));
    select("fallback", boundOption(route.fallback_model, route.fallback_model_id, route.modality || "text"));
  }

  async function load(target: RouteModelTarget, page = 1, inspect = false) {
    const form = formRef.current;
    const providerId = target === "primary" ? form.primary_provider_id : form.fallback_provider_id;
    const keyword = target === "primary" ? form.primary_keyword : form.fallback_keyword;
    if (!providerId) return;
    const request = ++generation.current[target];
    update(target, (current) => ({ ...current, loading: true, error: null,
      data: { ...current.data, pagination: { ...current.data.pagination, page } } }));
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (inspect) params.set("view", "inspect");
    else { params.set("modality", form.modality); params.set("status", "active"); }
    if (keyword.trim()) params.set("keyword", keyword.trim());
    try {
      const response = await requestBackend<PageData<AiRouteModelOptionRecord>>(`/platform/ai-config/providers/${providerId}/route-model-options?${params}`);
      if (request !== generation.current[target]) return;
      update(target, (current) => ({ ...current, data: response, loading: false, error: null }));
    } catch (error) {
      if (request !== generation.current[target]) return;
      update(target, (current) => ({ ...current, data: { ...current.data, list: [] }, loading: false, error: error instanceof Error ? error.message : "模型候选加载失败" }));
    }
  }

  async function resolveOne(target: RouteModelTarget, form: RouteFormState, option: AiRouteModelOptionRecord | null) {
    const currentId = target === "primary" ? form.primary_model_id : form.fallback_model_id;
    const value = target === "primary" ? form.primary_option_value : form.fallback_option_value;
    if (target === "fallback" && value === NONE_VALUE) return null;
    if (!option) return currentId && currentId !== NONE_VALUE ? currentId : null;
    if (option.source === "internal") return option.model_id || option.value;
    if (option.model_id) return option.model_id;
    const providerId = target === "primary" ? form.primary_provider_id : form.fallback_provider_id;
    const input = option.source === "manual"
      ? { source: "manual", model_name: option.label, modality: option.modality }
      : { source: "catalog", value: option.value };
    const response = await requestBackend<{ model_id: string }>(`/platform/ai-config/providers/${providerId}/route-model-options:resolve`, {
      method: "POST", body: JSON.stringify(input),
    });
    return response.model_id;
  }

  function resolve(form: RouteFormState) {
    return Promise.all(targets.map((target) => resolveOne(target, form, selectedRef.current[target])));
  }

  return { ...state, invalidate, select, bind, load, resolve };
}
