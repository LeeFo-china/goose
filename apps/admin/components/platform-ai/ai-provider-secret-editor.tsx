"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusAlert } from "@/components/admin/status-alert";
import { loadAiSecretSettings, replaceAiSecret, type AiSecretSettings } from "./ai-provider-secret-state";
import type { ProviderFormState } from "./ai-model-routing-shared";

export function AiProviderSecretEditor({ form, onChange }: {
  form: ProviderFormState; onChange: (value: ProviderFormState) => void;
}) {
  const [settings, setSettings] = useState<AiSecretSettings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    setSettings(null);
    setLoadError("");
    loadAiSecretSettings().then((result) => { if (active) setSettings(result); }).catch((error: unknown) => {
      if (!active) return;
      const forbidden = typeof error === "object" && error !== null && "status" in error && error.status === 403;
      setLoadError(forbidden ? "没有查看密钥配置的权限。供应商列表仍可正常使用。" : "密钥配置状态加载失败，请重试。");
    });
    return () => { active = false; };
  }, [attempt]);

  const selected = settings?.list.find((item) => item.key === form.api_key_setting_key);
  const unchanged = form.api_key_setting_key === form.initial_api_key_setting_key;
  const canEdit = Boolean(form.id && unchanged && selected && selected.status !== "invalid" && settings?.can_manage);
  const statusText = selected?.status === "configured" ? "已配置（未验证）"
    : selected?.status === "empty" ? "未配置" : "配置引用异常，请重新选择";

  function changeOpen(next: boolean) {
    if (submitting.current) return;
    setOpen(next);
    setValue("");
    setSaveError("");
  }

  async function save() {
    if (!canEdit || !value.trim() || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setSaveError("");
    try {
      await replaceAiSecret(form.api_key_setting_key, value);
      setValue("");
      setOpen(false);
      setSaved(true);
      setAttempt((current) => current + 1);
    } catch {
      setSaveError("密钥保存未确认，请刷新配置状态后检查；系统不会自动重试。");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="ai-provider-key">密钥配置</FieldLabel>
        <Select value={form.api_key_setting_key || "__unselected"}
          disabled={!settings || form.provider_type === "openrouter" && form.api_key_setting_key === "OPENROUTER_API_KEY"}
          onValueChange={(key) => onChange({ ...form, api_key_setting_key: key })}>
          <SelectTrigger id="ai-provider-key"><SelectValue placeholder="选择 AI 密钥配置" /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="__unselected" disabled>请选择密钥配置</SelectItem>
            {settings?.list.filter((item) => form.provider_type !== "openrouter" || item.key === "OPENROUTER_API_KEY").map((item) => (
              <SelectItem key={item.key} value={item.key} disabled={item.status === "invalid"}>{item.name}</SelectItem>
            ))}
          </SelectGroup></SelectContent>
        </Select>
        <FieldDescription>
          {form.api_key_setting_key || "请选择已登记的配置，不要在供应商字段填写真实密钥。"}
          {!form.id ? " 保存供应商后可配置真实密钥。" : !unchanged ? " 请先保存供应商的配置引用，再更换密钥。" : " 真实密钥单独加密保存。"}
        </FieldDescription>
        {loadError ? <><StatusAlert>{loadError}</StatusAlert><Button type="button" variant="outline" onClick={() => setAttempt((current) => current + 1)}>重新加载密钥状态</Button></> : !settings ? <FieldDescription role="status">正在加载密钥状态…</FieldDescription> : (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={selected?.status === "configured" ? "outline" : "warning"}>{statusText}</Badge>
            {selected?.source === "env" ? <Badge variant="outline">环境变量</Badge> : selected?.source === "database" ? <Badge variant="outline">数据库</Badge> : null}
          </div>
        )}
        {settings && !settings.can_manage ? <FieldDescription>当前账号没有更换密钥的权限。</FieldDescription> : null}
        {saved ? <StatusAlert tone="success">密钥已保存，尚未验证模型调用。</StatusAlert> : null}
      </Field>
      {canEdit ? <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger asChild><Button type="button" variant="outline">{selected?.status === "configured" ? "更换密钥" : "配置密钥"}</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.status === "configured" ? "更换密钥" : "配置密钥"}</DialogTitle>
            <DialogDescription>{form.name} · {selected?.name}（{selected?.key}）</DialogDescription>
          </DialogHeader>
          <StatusAlert tone="warning">此配置可能被多个供应商共用，更换会影响所有引用它的供应商。保存不会发起模型调用。</StatusAlert>
          <FieldGroup><Field data-invalid={Boolean(saveError) || undefined}>
            <FieldLabel htmlFor="ai-provider-secret-value">真实 API Key</FieldLabel>
            <Input id="ai-provider-secret-value" type="password" autoComplete="new-password" value={value}
              maxLength={8192} disabled={pending} aria-invalid={Boolean(saveError) || undefined}
              onChange={(event) => setValue(event.target.value)} placeholder="输入新密钥，留空不修改" />
            <FieldDescription>仅在服务端加密存储，不回显旧密钥。</FieldDescription>
            {saveError ? <StatusAlert>{saveError}</StatusAlert> : null}
          </Field></FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>取消</Button>
            <Button type="button" disabled={pending || !value.trim()} onClick={() => void save()}>{pending ? "正在保存…" : "保存密钥"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog> : null}
    </FieldGroup>
  );
}
