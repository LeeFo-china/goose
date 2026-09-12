"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ManualModelDraft } from "./ai-model-routing-shared";
import type { RouteModelTarget } from "./ai-route-model-selector";

export function AiManualModelFields({ target, draft, disabled, onChange }: {
  target: RouteModelTarget; draft: ManualModelDraft; disabled: boolean; onChange: (draft: ManualModelDraft) => void;
}) {
  if (!draft.enabled) return null;
  const title = target === "primary" ? "主模型" : "备用模型";
  return <FieldGroup role="group" aria-label={`手动填写${title}`}>
    <Field>
      <FieldLabel htmlFor={`ai-route-${target}-manual-name`}>{title}显示名称</FieldLabel>
      <Input id={`ai-route-${target}-manual-name`} className="min-h-11 sm:min-h-9" value={draft.name} maxLength={120} disabled={disabled}
        onChange={(event) => onChange({ ...draft, name: event.target.value })} />
      <FieldDescription>选填，留空时使用调用名称。</FieldDescription>
    </Field>
    <Field>
      <FieldLabel htmlFor={`ai-route-${target}-manual-model`}>{title}调用名称（必填）</FieldLabel>
      <Input id={`ai-route-${target}-manual-model`} className="min-h-11 sm:min-h-9" value={draft.model_name} required maxLength={200} disabled={disabled}
        onChange={(event) => onChange({ ...draft, model_name: event.target.value })} />
      <FieldDescription>填写供应商提供的模型调用名或 endpoint ID。登记后仍需验证实际调用能力。</FieldDescription>
    </Field>
    <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={disabled}
      onClick={() => onChange({ ...draft, enabled: false })}>取消手动填写{title}</Button>
  </FieldGroup>;
}
