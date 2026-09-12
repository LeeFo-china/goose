"use client";

import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusAlert } from "@/components/admin/status-alert";
import { loadAiSecretSettings, replaceAiSecret, type AiSecretSetting, type AiSecretSettings } from "./ai-provider-secret-state";
import { resolveAiFocusTarget, type ProviderFormState } from "./ai-model-routing-shared";

interface SecretSettingsState { settings: AiSecretSettings | null; loading: boolean; error: string }
type SecretSettingsAction = { type: "loading" } | { type: "loaded"; settings: AiSecretSettings } | { type: "failed"; error: unknown };
export function secretSettingsReducer(state: SecretSettingsState, action: SecretSettingsAction): SecretSettingsState {
  if (action.type === "loading") return { ...state, loading: true, error: "" };
  if (action.type === "loaded") return action.settings.can_manage
    ? { settings: action.settings, loading: false, error: "" }
    : { settings: null, loading: false, error: "没有密钥管理权限" };
  const error = action.error;
  const forbidden = typeof error === "object" && error !== null && "status" in error && error.status === 403;
  return { settings: null, loading: false, error: forbidden ? "没有密钥管理权限" : "密钥配置状态加载失败，请重试。" };
}

export function secretEditorAccess(form: ProviderFormState, settings: AiSecretSettings | null, disabled: boolean) {
  const selected = settings?.list.find((item) => item.key === form.api_key_setting_key);
  const canEdit = Boolean(!disabled && selected && selected.status !== "invalid" && settings?.can_manage);
  const statusText = !settings?.can_manage ? "没有密钥管理权限"
    : selected?.status === "configured" ? "已配置，模型调用未验证"
      : selected?.status === "empty" || !form.api_key_setting_key && !form.api_key_setting_invalid ? "未配置" : "配置引用异常";
  return { selected, canEdit, statusText };
}

function SecretValueDialog({ setting, onSaved, focusFallback }: { setting: AiSecretSetting; onSaved: () => void; focusFallback: RefObject<HTMLDivElement | null> }) {
  // Raw secrets belong only to this password dialog and never to supplier form state.
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const generation = useRef(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => () => { generation.current += 1; }, []);
  function changeOpen(next: boolean) {
    if (submitting.current) return;
    setOpen(next); setValue(""); setError("");
  }
  async function save() {
    if (!value.trim() || submitting.current) return;
    submitting.current = true;
    const request = generation.current;
    setPending(true); setError("");
    try {
      await replaceAiSecret(setting.key, value);
      if (request !== generation.current) return;
      setValue(""); setOpen(false); onSaved();
    } catch {
      if (request === generation.current) setError("密钥保存未确认，请刷新配置状态后检查；系统不会自动重试。");
    } finally {
      if (request === generation.current) { submitting.current = false; setPending(false); }
    }
  }
  const title = setting.status === "configured" ? "更换密钥" : "配置密钥";
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button ref={trigger} type="button" variant="outline" className="min-h-11 sm:min-h-9">{title}</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-auto [&>button]:size-11 sm:[&>button]:size-9 [&_button]:min-h-11 sm:[&_button]:min-h-9 [&_input]:min-h-11 sm:[&_input]:min-h-10" onCloseAutoFocus={(event) => {
      const target = resolveAiFocusTarget(trigger.current, focusFallback.current);
      if (target) { event.preventDefault(); target.focus(); }
    }}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{setting.name}的密钥配置</DialogDescription></DialogHeader>
      <StatusAlert tone="warning">此配置可能被多个供应商共用，更换会影响所有引用它的供应商。保存不会发起模型调用。</StatusAlert>
      <FieldGroup><Field data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor="ai-provider-secret-value">真实 API Key</FieldLabel>
        <Input id="ai-provider-secret-value" type="password" autoComplete="new-password" value={value}
          maxLength={8192} disabled={pending} aria-invalid={Boolean(error) || undefined}
          onChange={(event) => setValue(event.target.value)} placeholder="输入新密钥，留空不修改" />
        <FieldDescription>仅在服务端加密存储，不回显旧密钥。</FieldDescription>
        {error ? <StatusAlert>{error}</StatusAlert> : null}
      </Field></FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>取消</Button>
        <Button type="button" disabled={pending || !value.trim()} onClick={() => void save()}>{pending ? "正在保存…" : "保存密钥"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

interface SecretEditorProps {
  form: ProviderFormState; onChange: (value: ProviderFormState) => void;
  disabled?: boolean; onSecretSaved?: () => void;
}
export function AiProviderSecretEditor(props: SecretEditorProps) {
  return <SecretEditorContent key={`${props.form.id || "new"}:${props.form.provider_type}`} {...props} />;
}
function SecretEditorContent({ form, onChange, disabled = false, onSecretSaved }: SecretEditorProps) {
  const [{ settings, loading, error: loadError }, dispatch] = useReducer(secretSettingsReducer, { settings: null, loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);
  const [savedKey, setSavedKey] = useState("");
  const focusRegion = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let active = true;
    dispatch({ type: "loading" });
    loadAiSecretSettings().then((result) => {
      if (!active) return;
      dispatch({ type: "loaded", settings: result });
      if (!result.can_manage) setSavedKey("");
    }).catch((error: unknown) => {
      if (!active) return;
      dispatch({ type: "failed", error }); setSavedKey("");
    });
    return () => { active = false; };
  }, [attempt]);
  const { selected, canEdit, statusText } = secretEditorAccess(form, settings, disabled || loading);
  return <div ref={focusRegion} tabIndex={-1} aria-label="密钥配置区域"><FieldGroup>
    <Field>
      <FieldLabel htmlFor="ai-provider-key">密钥配置</FieldLabel>
      <Select value={form.api_key_setting_key || "__unselected"}
        disabled={disabled || loading || !settings || form.provider_type === "openrouter" && form.api_key_setting_key === "OPENROUTER_API_KEY"}
        onValueChange={(key) => { setSavedKey(""); onChange({ ...form, api_key_setting_key: key }); }}>
        <SelectTrigger id="ai-provider-key" className="min-h-11 sm:min-h-9"><SelectValue placeholder="选择 AI 密钥配置" /></SelectTrigger>
        <SelectContent><SelectGroup>
          <SelectItem value="__unselected" disabled>请选择密钥配置</SelectItem>
          {settings?.list.filter((item) => form.provider_type !== "openrouter" || item.key === "OPENROUTER_API_KEY").map((item) => (
            <SelectItem key={item.key} value={item.key} disabled={item.status === "invalid"}>{item.name}</SelectItem>
          ))}
        </SelectGroup></SelectContent>
      </Select>
      <FieldDescription>密钥独立加密保存。更改配置引用后，还需保存供应商。</FieldDescription>
      {loadError ? <><StatusAlert>{loadError}</StatusAlert><Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setAttempt((current) => current + 1)}>重新加载密钥状态</Button></>
        : loading ? <FieldDescription role="status">正在加载密钥状态…</FieldDescription> : <div className="flex flex-wrap items-center gap-2">
          <Badge variant={selected?.status === "configured" ? "outline" : "warning"}>{statusText}</Badge>
          {selected?.source === "env" ? <Badge variant="outline">环境变量</Badge> : selected?.source === "database" ? <Badge variant="outline">数据库</Badge> : null}
        </div>}
      {savedKey && savedKey === form.api_key_setting_key ? <StatusAlert tone="success">密钥已保存，尚未验证模型调用。</StatusAlert> : null}
    </Field>
    {canEdit && selected ? <SecretValueDialog key={`${form.id || "new"}:${form.provider_type}:${selected.key}`} setting={selected} focusFallback={focusRegion}
      onSaved={() => { setSavedKey(selected.key); setAttempt((current) => current + 1); onSecretSaved?.(); }} /> : null}
  </FieldGroup></div>;
}
