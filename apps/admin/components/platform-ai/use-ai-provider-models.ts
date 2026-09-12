"use client";

import { useEffect, useReducer, useRef } from "react";
import { z } from "zod";
import type { AiModelRecord, PageData } from "./ai-config-types";
import { aiConfigErrorFeedback, emptyModelForm, modelFormFromRecord, modelPayload, requestBackend, type ModelFormState } from "./ai-model-routing-shared";

interface ModelState {
  providerId: string; page: number; pageSize: number; keyword: string;
  modality: "" | ModelFormState["modality"]; status: "" | ModelFormState["status"];
  data: PageData<AiModelRecord>; loading: boolean; error: string;
  form: ModelFormState | null; saving: boolean; saveError: string; saveStale: boolean; saved: boolean; revision: number;
}
type ModelAction =
  | { type: "provider"; providerId: string }
  | { type: "saved" }
  | { type: "filter"; keyword?: string; modality?: ModelState["modality"]; status?: ModelState["status"] }
  | { type: "patch"; patch: Partial<ModelState> };

export function initialModelState(providerId: string): ModelState {
  return {
    providerId, page: 1, pageSize: 20, keyword: "", modality: "", status: "",
    data: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
    loading: Boolean(providerId), error: "", form: null, saving: false, saveError: "", saveStale: false, saved: false, revision: 0,
  };
}
export function modelStateReducer(state: ModelState, action: ModelAction): ModelState {
  if (action.type === "provider") return initialModelState(action.providerId);
  if (action.type === "saved") return { ...state, page: 1, form: null, saving: false, saveError: "", saveStale: false, saved: true, revision: state.revision + 1 };
  if (action.type === "filter") {
    const { type: _type, ...filters } = action;
    const next = { ...state, ...filters };
    const changed = next.keyword.trim() !== state.keyword.trim() || next.modality !== state.modality || next.status !== state.status;
    return changed ? { ...next, page: 1, error: "", revision: state.revision + 1 } : next;
  }
  return { ...state, ...action.patch };
}
export function modelQueryPath(state: ModelState): string {
  const params = new URLSearchParams({ providerId: state.providerId, page: String(state.page), pageSize: String(Math.min(100, state.pageSize)) });
  if (state.keyword.trim()) params.set("keyword", state.keyword.trim());
  if (state.modality) params.set("modality", state.modality);
  if (state.status) params.set("status", state.status);
  return `/platform/ai-config/models?${params}`;
}

// Abort reduces wasted work; generation also rejects responses from transports that ignore AbortSignal.
export function createModelRequestScope() {
  let generation = 0;
  let controller: AbortController | null = null;
  function invalidate() { generation += 1; controller?.abort(); }
  async function run<T>(load: (signal: AbortSignal) => Promise<T>, success: (value: T) => void, failure: (error: unknown) => void): Promise<void> {
    invalidate();
    const request = generation;
    controller = new AbortController();
    try {
      const value = await load(controller.signal);
      if (request === generation) success(value);
    } catch (error) { if (request === generation) failure(error); }
  }
  return { invalidate, run };
}

export function useAiProviderModels(providerId: string, canManage: boolean) {
  const [state, dispatch] = useReducer(modelStateReducer, providerId, initialModelState);
  const queryScope = useRef(createModelRequestScope());
  const saveScope = useRef(createModelRequestScope());
  const submitting = useRef(false);
  // Keyed consumers reset immediately. This also makes direct hook reuse safe across provider changes.
  useEffect(() => {
    queryScope.current.invalidate(); saveScope.current.invalidate(); submitting.current = false;
    dispatch({ type: "provider", providerId });
    return () => { queryScope.current.invalidate(); saveScope.current.invalidate(); };
  }, [providerId]);
  const path = modelQueryPath(state);
  useEffect(() => {
    if (!providerId || state.providerId !== providerId) return;
    dispatch({ type: "patch", patch: { loading: true, error: "" } });
    void queryScope.current.run(
      (signal) => requestBackend<PageData<AiModelRecord>>(path, { signal, cache: "no-store" }),
      (data) => dispatch({ type: "patch", patch: { data, loading: false } }),
      () => dispatch({ type: "patch", patch: { loading: false, error: "模型列表加载失败，请重试。" } }),
    );
    return () => queryScope.current.invalidate();
  }, [providerId, state.providerId, path, state.revision]);

  function patch(patch: Partial<ModelState>) { dispatch({ type: "patch", patch }); }
  function filter(filters: Omit<Extract<ModelAction, { type: "filter" }>, "type">) {
    const action = { type: "filter" as const, ...filters };
    if (modelStateReducer(state, action).revision !== state.revision) queryScope.current.invalidate();
    dispatch(action);
  }
  function open(model?: AiModelRecord) {
    if (!canManage || !providerId || model && model.provider_id !== providerId) return;
    patch({ form: model ? modelFormFromRecord(model) : emptyModelForm(providerId), saveError: "", saveStale: false, saved: false });
  }
  async function save() {
    if (!canManage || !state.form || submitting.current || state.saveStale || state.form.provider_id !== providerId) return;
    const form = state.form;
    let payload: ReturnType<typeof modelPayload>;
    try { payload = modelPayload(form); }
    catch (error) {
      patch({ saveError: error instanceof z.ZodError ? "请填写名称、调用名，至少选择一种输入模态，并检查排序。" : "模型配置无效，请检查后重试。" });
      return;
    }
    submitting.current = true; patch({ saving: true, saveError: "" });
    await saveScope.current.run(
      (signal) => requestBackend<AiModelRecord>(form.id ? `/platform/ai-config/models/${form.id}` : "/platform/ai-config/models", {
        signal, method: form.id ? "PATCH" : "POST", body: JSON.stringify(payload),
      }),
      () => { submitting.current = false; dispatch({ type: "saved" }); },
      (error) => { const feedback = aiConfigErrorFeedback(error, "模型保存未确认，请刷新列表检查后重试。"); submitting.current = false; patch({ saving: false, saveError: feedback.message, saveStale: feedback.stale }); },
    );
  }
  return {
    ...state, filter, open, save, reload: () => patch({ revision: state.revision + 1 }),
    reloadAfterConflict: () => { if (!submitting.current) patch({ form: null, page: 1, saveError: "", saveStale: false, revision: state.revision + 1 }); },
    changePage: (page: number) => { queryScope.current.invalidate(); patch({ page }); },
    changeForm: (form: ModelFormState) => patch({ form, saveError: state.saveStale ? state.saveError : "" }),
    close: () => { if (!submitting.current) patch({ form: null, saveError: "" }); },
  };
}
