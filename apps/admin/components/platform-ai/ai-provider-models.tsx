"use client";

import { useRef } from "react";
import { Plus, RefreshCw, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusAlert } from "@/components/admin/status-alert";
import { MODEL_MODALITIES, MODEL_MODALITY_LABELS, resolveAiFocusTarget, type ModelFormState } from "./ai-model-routing-shared";
import { useAiProviderModels } from "./use-ai-provider-models";

export function ModelFields({ form, onChange, disabled }: {
  form: ModelFormState; onChange: (form: ModelFormState) => void; disabled: boolean;
}) {
  return <FieldGroup className="grid gap-4 sm:grid-cols-2 [&_input]:min-h-11 sm:[&_input]:min-h-10">
    {form.id ? <Field className="sm:col-span-2">
      <FieldLabel htmlFor="ai-model-system-code">系统编码</FieldLabel>
      <Input id="ai-model-system-code" value={form.code || ""} readOnly aria-readonly="true" />
    </Field> : null}
    <Field>
      <FieldLabel htmlFor="ai-model-name">名称</FieldLabel>
      <Input id="ai-model-name" required maxLength={120} disabled={disabled} value={form.name}
        onChange={(event) => onChange({ ...form, name: event.target.value })} />
    </Field>
    <Field>
      <FieldLabel htmlFor="ai-model-call-name">供应商调用名</FieldLabel>
      <Input id="ai-model-call-name" required maxLength={200} disabled={disabled} value={form.model_name}
        onChange={(event) => onChange({ ...form, model_name: event.target.value })} />
    </Field>
    <Field>
      <FieldLabel htmlFor="ai-model-modality">模型模态</FieldLabel>
      <Select value={form.modality} disabled={disabled} onValueChange={(value) => {
        const modality = MODEL_MODALITIES.find((item) => item === value);
        if (modality) onChange({ ...form, modality });
      }}>
        <SelectTrigger id="ai-model-modality" className="min-h-11 sm:min-h-9"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>{MODEL_MODALITIES.map((item) => <SelectItem key={item} value={item}>{MODEL_MODALITY_LABELS[item]}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
    </Field>
    <Field>
      <FieldLabel htmlFor="ai-model-status">状态</FieldLabel>
      <Select value={form.status} disabled={disabled} onValueChange={(value) => onChange({ ...form, status: value === "active" ? "active" : "inactive" })}>
        <SelectTrigger id="ai-model-status" className="min-h-11 sm:min-h-9"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="active">启用</SelectItem><SelectItem value="inactive">停用</SelectItem></SelectGroup></SelectContent>
      </Select>
    </Field>
    <FieldSet className="sm:col-span-2" disabled={disabled}>
      <FieldLegend variant="label">输入模态</FieldLegend>
      <FieldGroup className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MODEL_MODALITIES.map((item) => <Field key={item} orientation="horizontal">
          <Checkbox id={`ai-model-input-${item}`} checked={form.input_modalities.includes(item)} disabled={disabled}
            onCheckedChange={(checked) => onChange({ ...form, input_modalities: checked === true
              ? [...form.input_modalities, item] : form.input_modalities.filter((value) => value !== item) })} />
          <FieldLabel className="flex min-h-11 flex-1 items-center" htmlFor={`ai-model-input-${item}`}>{MODEL_MODALITY_LABELS[item]}</FieldLabel>
        </Field>)}
      </FieldGroup>
      <FieldDescription>至少选择一种模型支持的输入类型。</FieldDescription>
    </FieldSet>
    <Field>
      <FieldLabel htmlFor="ai-model-sort">排序</FieldLabel>
      <Input id="ai-model-sort" type="number" min={0} max={100000} step={1} disabled={disabled} value={form.sort_order}
        onChange={(event) => onChange({ ...form, sort_order: event.target.value })} />
    </Field>
  </FieldGroup>;
}

export function AiProviderModels({ providerId, providerName, canManage }: {
  providerId: string; providerName: string; canManage: boolean;
}) {
  const models = useAiProviderModels(providerId, canManage);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const createButton = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  if (!providerId) return <p className="text-sm text-muted-foreground">保存供应商后可添加模型。</p>;
  const totalPages = Math.max(1, models.data.pagination.totalPages);
  return <section aria-labelledby="provider-models-title" className="flex min-w-0 flex-col gap-4 [&_input]:min-h-11 sm:[&_input]:min-h-10">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="provider-models-title" ref={heading} tabIndex={-1} className="text-base font-semibold">模型</h2>
      <div className="flex gap-2">
        {canManage ? <Button ref={createButton} className="min-h-11 sm:min-h-9" onClick={(event) => { trigger.current = event.currentTarget; models.open(); }}>
          <Plus data-icon="inline-start" />新增模型
        </Button> : null}
        <Button variant="outline" className="min-h-11 sm:min-h-9" disabled={models.loading} onClick={models.reload}><RefreshCw data-icon="inline-start" />刷新模型</Button>
      </div>
    </div>
    <FieldGroup className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_120px]">
      <Field><FieldLabel htmlFor="model-keyword">搜索模型</FieldLabel>
        <Input id="model-keyword" maxLength={120} placeholder="名称或供应商调用名" value={models.keyword} onChange={(event) => models.filter({ keyword: event.target.value })} />
      </Field>
      <Field><FieldLabel htmlFor="model-modality-filter">模型模态</FieldLabel>
        <Select value={models.modality || "all"} onValueChange={(value) => models.filter({ modality: MODEL_MODALITIES.find((item) => item === value) || "" })}>
          <SelectTrigger id="model-modality-filter" className="min-h-11 sm:min-h-10"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="all">全部模态</SelectItem>{MODEL_MODALITIES.map((item) => <SelectItem key={item} value={item}>{MODEL_MODALITY_LABELS[item]}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <Field><FieldLabel htmlFor="model-status-filter">状态</FieldLabel>
        <Select value={models.status || "all"} onValueChange={(value) => models.filter({ status: value === "active" || value === "inactive" ? value : "" })}>
          <SelectTrigger id="model-status-filter" className="min-h-11 sm:min-h-10"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="all">全部状态</SelectItem><SelectItem value="active">启用</SelectItem><SelectItem value="inactive">停用</SelectItem></SelectGroup></SelectContent>
        </Select>
      </Field>
    </FieldGroup>
    {models.saved ? <StatusAlert tone="success">模型已保存。</StatusAlert> : null}
    {models.error ? <StatusAlert>{models.error}<Button variant="outline" onClick={models.reload}>重试加载模型</Button></StatusAlert> : null}
    <Table containerClassName="max-h-[440px] rounded-md border" className="min-w-[680px]" aria-label={`${providerName}的模型`} aria-busy={models.loading}>
      <TableHeader className="sticky top-0 bg-card"><TableRow>
        <TableHead>名称 / 供应商调用名</TableHead><TableHead>模型模态</TableHead><TableHead>输入模态</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead>
      </TableRow></TableHeader>
      <TableBody>{models.loading ? <TableRow><TableCell colSpan={5}><Skeleton className="h-16 w-full motion-reduce:animate-none" /><span className="sr-only" role="status">模型列表加载中</span></TableCell></TableRow>
        : models.error ? <TableRow><TableCell colSpan={5}>列表未加载，请重试。</TableCell></TableRow>
          : !models.data.list.length ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">{models.keyword || models.modality || models.status ? "没有符合筛选条件的模型。" : "暂无模型，可添加此供应商支持的模型。"}</TableCell></TableRow>
            : models.data.list.map((model) => <TableRow key={model.id}>
              <TableCell className="max-w-[260px]"><div className="break-words font-medium" title={model.name}>{model.name}</div><div className="break-all text-xs text-muted-foreground" title={model.model_name}>{model.model_name}</div></TableCell>
              <TableCell>{MODEL_MODALITY_LABELS[model.modality || "text"]}</TableCell>
              <TableCell>{MODEL_MODALITIES.filter((item) => model.input_modalities?.includes(item)).map((item) => MODEL_MODALITY_LABELS[item]).join("、") || "未登记"}</TableCell>
              <TableCell><Badge variant={model.status === "active" ? "success" : "outline"}>{model.status === "active" ? "启用" : "停用"}</Badge></TableCell>
              <TableCell>{canManage ? <Button variant="outline" className="min-h-11 sm:min-h-9" aria-label={`编辑模型 ${model.name}`} onClick={(event) => { trigger.current = event.currentTarget; models.open(model); }}><Edit3 data-icon="inline-start" />编辑</Button> : "只读"}</TableCell>
            </TableRow>)}</TableBody>
    </Table>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">第 {models.page} / {totalPages} 页，共 {models.data.pagination.total} 条</span>
      <div className="flex gap-2"><Button className="min-h-11 sm:min-h-9" variant="outline" disabled={models.loading || models.page <= 1} onClick={() => models.changePage(models.page - 1)}>上一页</Button>
        <Button className="min-h-11 sm:min-h-9" variant="outline" disabled={models.loading || models.page >= totalPages} onClick={() => models.changePage(models.page + 1)}>下一页</Button></div>
    </div>
    <Dialog open={Boolean(models.form)} onOpenChange={(open) => { if (!open) models.close(); }}>
      <DialogContent className="max-h-[90dvh] overflow-auto sm:max-w-2xl [&>button]:size-11 sm:[&>button]:size-9" onCloseAutoFocus={(event) => {
        const target = resolveAiFocusTarget(trigger.current, resolveAiFocusTarget(createButton.current, heading.current));
        if (target) { event.preventDefault(); target.focus(); }
      }}>
        <DialogHeader><DialogTitle>{models.form?.id ? "编辑模型" : "新增模型"}</DialogTitle><DialogDescription>{providerName}的模型配置，系统编码自动生成。</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void models.save(); }}>
          {models.form ? <ModelFields form={models.form} onChange={models.changeForm} disabled={models.saving} /> : null}
          {models.saveError ? <StatusAlert>{models.saveError}{models.saveStale ? <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={models.reloadAfterConflict}>关闭并刷新列表</Button> : null}</StatusAlert> : null}
          <DialogFooter><Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={models.saving} onClick={models.close}>取消</Button>
            <Button type="submit" className="min-h-11 sm:min-h-9" disabled={models.saving || models.saveStale || !models.form?.input_modalities.length}>{models.saving ? "正在保存…" : "保存模型"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}
