"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusAlert } from "@/components/admin/status-alert";
import type { AiProviderRecord } from "./ai-config-types";
import { AiProviderSecretEditor } from "./ai-provider-secret-editor";
import { aiConfigErrorFeedback, emptyProviderForm, normalizeProviderFormForType, providerFormFromRecord, providerReferencePatch, requestBackend, type ProviderFormState } from "./ai-model-routing-shared";
import { createModelRequestScope } from "./use-ai-provider-models";

type Validation = "idle" | "pending" | "verified" | "unsupported" | "error";
interface ProviderEditorState {
  form: ProviderFormState; baseline: ProviderFormState; latest: ProviderFormState;
  validation: Validation; validatedVersion: number | null; validatedProviderId: string | null;
  serverUpdated: boolean; requiresReload: boolean;
}
type ProviderEditorAction =
  | { type: "refresh" | "saved"; provider: AiProviderRecord | null }
  | { type: "change"; form: ProviderFormState }
  | { type: "load-latest" }
  | { type: "stale" }
  | { type: "validation"; validation: Validation; providerId?: string; version?: number | null };
const sameForm = (left: ProviderFormState, right: ProviderFormState) => JSON.stringify(left) === JSON.stringify(right);
export function initialProviderEditorState(provider: AiProviderRecord | null): ProviderEditorState {
  const form = provider ? providerFormFromRecord(provider) : emptyProviderForm();
  return { form, baseline: form, latest: form, validation: "idle", validatedVersion: null, validatedProviderId: null, serverUpdated: false, requiresReload: false };
}
export function canValidateProvider(state: ProviderEditorState): boolean {
  return Boolean(state.form.id && !state.serverUpdated && !state.requiresReload && sameForm(state.form, state.baseline)
    && typeof state.form.version === "number" && state.form.version === state.baseline.version);
}
export function providerValidationVisible(state: ProviderEditorState): boolean {
  return canValidateProvider(state) && state.validatedProviderId === state.form.id && state.validatedVersion === state.form.version
    && (state.validation === "verified" || state.validation === "unsupported");
}
export function providerEditorReducer(state: ProviderEditorState, action: ProviderEditorAction): ProviderEditorState {
  const unvalidated = { validation: "idle" as const, validatedVersion: null, validatedProviderId: null };
  if (action.type === "validation") {
    if (action.validation === "verified" || action.validation === "unsupported") {
      if (!canValidateProvider(state) || action.providerId !== state.form.id || action.version !== state.form.version) return state;
      return { ...state, validation: action.validation, validatedVersion: action.version ?? null, validatedProviderId: action.providerId ?? null };
    }
    return { ...state, ...unvalidated, validation: action.validation };
  }
  if (action.type === "stale") return { ...state, ...unvalidated, serverUpdated: true, requiresReload: true };
  if (action.type === "change") return { ...state, ...unvalidated, form: action.form };
  if (action.type === "load-latest") return state.requiresReload ? state : { ...state, ...unvalidated, form: state.latest, baseline: state.latest, serverUpdated: false };
  const incoming = initialProviderEditorState(action.provider);
  if (action.type === "saved") return incoming;
  if (sameForm(state.latest, incoming.latest)) return state;
  if (state.form.id !== incoming.form.id || sameForm(state.form, state.baseline)) return incoming;
  return { ...state, ...unvalidated, latest: incoming.form, requiresReload: false, serverUpdated: !sameForm(state.baseline, incoming.form) };
}

export function AiProviderEditor({ provider, canManage, onSaved, onReload }: {
  provider: AiProviderRecord | null; canManage: boolean;
  onSaved: (provider: AiProviderRecord) => Promise<void>;
  onReload?: () => Promise<AiProviderRecord | null>;
}) {
  const [editorState, dispatch] = useReducer(providerEditorReducer, provider, initialProviderEditorState);
  const { form, baseline, validation, serverUpdated } = editorState;
  const stateRef = useRef(editorState);
  stateRef.current = editorState;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [validationError, setValidationError] = useState("");
  const saveScope = useRef(createModelRequestScope());
  const validationScope = useRef(createModelRequestScope());
  const reloadScope = useRef(createModelRequestScope());
  const submitting = useRef(false);
  useEffect(() => () => { saveScope.current.invalidate(); validationScope.current.invalidate(); reloadScope.current.invalidate(); }, []);
  useEffect(() => {
    const current = stateRef.current;
    if (sameForm(current.latest, initialProviderEditorState(provider).latest)) return;
    validationScope.current.invalidate();
    if (current.form.id !== provider?.id) { saveScope.current.invalidate(); reloadScope.current.invalidate(); submitting.current = false; setSaving(false); setReloading(false); }
    dispatch({ type: "refresh", provider }); setSaved(false); setSaveError(""); setValidationError("");
  }, [provider]);
  const dirty = !sameForm(form, baseline);
  const canValidate = canValidateProvider(editorState);
  const showValidation = providerValidationVisible(editorState);
  const editingDisabled = !canManage || saving || reloading;
  function setValidation(validation: Validation) { dispatch({ type: "validation", validation, providerId: form.id, version: form.version }); }

  function changeForm(next: ProviderFormState) {
    validationScope.current.invalidate(); setSaved(false); setSaveError(""); setValidationError(""); dispatch({ type: "change", form: next });
  }
  async function loadLatest() {
    if (saving || reloading) return;
    validationScope.current.invalidate(); setValidation("idle"); setSaved(false); setSaveError(""); setValidationError("");
    if (!editorState.requiresReload) { dispatch({ type: "load-latest" }); return; }
    setReloading(true);
    await reloadScope.current.run(() => onReload?.() ?? Promise.resolve(null), (record) => {
      setReloading(false);
      if (!record || record.id !== form.id || (record.version ?? 0) <= (baseline.version ?? 0)) {
        setSaveError("暂未读到新版本，请在供应商列表中重新选择后重试。"); return;
      }
      dispatch({ type: "saved", provider: record });
    }, (error) => { setReloading(false); setSaveError(aiConfigErrorFeedback(error, "最新配置加载未确认，请重试。").message); });
  }
  async function submitProvider() {
    if (!canManage || submitting.current || serverUpdated || reloading) return;
    if (!form.name.trim() || !Number.isInteger(Number(form.sort_order)) || Number(form.sort_order) < 0 || Number(form.sort_order) > 100000) {
      setSaveError("请填写供应商名称，并将排序设为 0 到 100000 的整数。"); return;
    }
    submitting.current = true; setSaving(true); setSaveError(""); setSaved(false);
    validationScope.current.invalidate(); setValidation("idle");
    const payload = {
      name: form.name.trim(), endpoint_url: form.endpoint_url.trim() || null,
      ...providerReferencePatch(form), status: form.status, sort_order: Number(form.sort_order),
      ...(form.id ? { expected_version: form.version ?? 1 } : {}),
    };
    await saveScope.current.run(
      (signal) => requestBackend<AiProviderRecord>(form.id ? `/platform/ai-config/providers/${form.id}` : "/platform/ai-config/providers", {
        signal, method: form.id ? "PATCH" : "POST", body: JSON.stringify(payload),
      }),
      (record) => {
        submitting.current = false; setSaving(false); setSaved(true); dispatch({ type: "saved", provider: record });
        toast.success("供应商配置已保存");
        void onSaved(record).catch(() => toast.error("供应商已保存，但列表刷新失败，请刷新页面。"));
      },
      (error) => {
        const feedback = aiConfigErrorFeedback(error, "供应商保存未确认，请刷新列表检查后重试。");
        submitting.current = false; setSaving(false); setSaveError(feedback.message);
        if (feedback.stale) dispatch({ type: "stale" });
      },
    );
  }
  async function validate() {
    if (!canValidate || saving || reloading || !canManage || validation === "pending") return;
    setValidation("pending"); setValidationError("");
    await validationScope.current.run(
      (signal) => requestBackend<{ status: "verified" | "unsupported" }>(`/platform/ai-config/providers/${form.id}/validate`, { signal, method: "POST" }),
      (result) => setValidation(result.status === "verified" ? "verified" : result.status === "unsupported" ? "unsupported" : "error"),
      (error) => { const feedback = aiConfigErrorFeedback(error, "连接验证结果未确认，请检查网络后重试。"); setValidationError(feedback.message); setValidation("error"); if (feedback.stale) dispatch({ type: "stale" }); },
    );
  }
  return <section aria-labelledby="provider-connection-title" className="flex flex-col gap-4 [&_input]:min-h-11 sm:[&_input]:min-h-10">
    <h2 id="provider-connection-title" className="text-base font-semibold">{form.id ? "连接设置" : "新增供应商"}</h2>
    {serverUpdated ? <StatusAlert tone="warning">服务器配置已更新，本地草稿已保留。
      <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={saving || reloading} onClick={() => void loadLatest()}>{reloading ? "正在加载…" : "加载最新配置"}</Button>
    </StatusAlert> : null}
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void submitProvider(); }}>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        {form.id ? <Field className="md:col-span-2">
          <FieldLabel htmlFor="ai-provider-code-readonly">系统编码</FieldLabel>
          <Input id="ai-provider-code-readonly" value={form.code} readOnly aria-readonly="true" />
        </Field> : null}
        <Field>
          <FieldLabel htmlFor="ai-provider-name">名称</FieldLabel>
          <Input id="ai-provider-name" required maxLength={120} disabled={editingDisabled} value={form.name} onChange={(event) => changeForm({ ...form, name: event.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ai-provider-protocol">接入协议</FieldLabel>
          <Select value={form.provider_type} disabled={editingDisabled} onValueChange={(value) => changeForm(normalizeProviderFormForType(form, value === "openrouter" ? "openrouter" : "openai_compatible"))}>
            <SelectTrigger id="ai-provider-protocol" className="min-h-11 sm:min-h-10"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="openai_compatible">OpenAI Compatible</SelectItem><SelectItem value="openrouter">OpenRouter</SelectItem></SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="ai-provider-endpoint">Endpoint Base URL</FieldLabel>
          <Input id="ai-provider-endpoint" type="url" maxLength={300} disabled={editingDisabled} value={form.endpoint_url} onChange={(event) => changeForm({ ...form, endpoint_url: event.target.value })} />
          <FieldDescription>填写供应商 API 基础地址，保留版本路径。</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="ai-provider-status">状态</FieldLabel>
          <Select value={form.status} disabled={editingDisabled} onValueChange={(value) => changeForm({ ...form, status: value === "active" ? "active" : "inactive" })}>
            <SelectTrigger id="ai-provider-status" className="min-h-11 sm:min-h-10"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="active">启用</SelectItem><SelectItem value="inactive">停用</SelectItem></SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="ai-provider-sort">排序</FieldLabel>
          <Input id="ai-provider-sort" type="number" min={0} max={100000} step={1} disabled={editingDisabled} value={form.sort_order} onChange={(event) => changeForm({ ...form, sort_order: event.target.value })} />
        </Field>
      </FieldGroup>
      <AiProviderSecretEditor key={`${form.id || "new"}:${form.provider_type}`} form={form} onChange={changeForm} disabled={editingDisabled}
        onSecretSaved={() => { validationScope.current.invalidate(); setValidation("idle"); }} />
      {saveError ? <StatusAlert>{saveError}</StatusAlert> : null}
      {saved ? <StatusAlert tone="success">供应商配置已保存。</StatusAlert> : null}
      {!canManage ? <FieldDescription>当前账号仅可查看供应商配置。</FieldDescription> : <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11 sm:min-h-9" disabled={saving || reloading || serverUpdated}><Save data-icon="inline-start" />{saving ? "正在保存…" : "保存供应商"}</Button>
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={!canValidate || saving || reloading || validation === "pending"} onClick={() => void validate()}>
          <ShieldCheck data-icon="inline-start" />{validation === "pending" ? "正在验证…" : validation === "error" ? "重试验证连接" : "验证连接"}
        </Button>
      </div>}
      {serverUpdated ? <FieldDescription>请先加载最新配置，再验证连接。</FieldDescription> : dirty || !form.id ? <FieldDescription>保存供应商配置后可验证连接。</FieldDescription> : null}
    </form>
    {showValidation && validation === "verified" ? <StatusAlert tone="success">连接验证通过，尚未验证模型调用。</StatusAlert> : null}
    {showValidation && validation === "unsupported" ? <StatusAlert tone="warning">配置已保存，当前协议没有无损验证方式</StatusAlert> : null}
    {validation === "error" ? <StatusAlert>{validationError || "连接验证结果未确认，请重试。"}</StatusAlert> : null}
  </section>;
}
