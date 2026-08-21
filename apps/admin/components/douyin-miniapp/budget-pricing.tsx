"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calculator, ChevronLeft, ChevronRight, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DOUYIN_DECORATION_SCOPE_VALUES,
  DOUYIN_DECORATION_TIER_VALUES,
  DOUYIN_PROPERTY_CONDITION_VALUES,
  type DouyinDecorationScope,
  type DouyinDecorationTier,
  type DouyinPropertyCondition,
} from "@gooes/domain";

import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import {
  BUDGET_CATEGORY_LABELS, BUDGET_ITEM_CODES, BUDGET_ITEM_LABELS,
  BUDGET_PRICING_PAGE_SIZE, buildPricingDraftPayload, buildPricingItemsPayload,
  calculatePricingPreview, createBudgetPricingFailurePage,
  createBudgetPricingPageTarget, createBudgetPricingRequestAuthority,
  createEmptyPricingEditorItem, getBudgetPricingViewState,
  getPricingDraftWarnings, getPricingItemWarnings, isBudgetPricingAbortError,
  normalizePricingVersion, normalizePricingVersionPage, pricingItemToEditor,
  pricingStatusDisplay, toggleCanonicalCondition, type BudgetPricingDraftInput,
  type BudgetPricingEditorItem, type BudgetPricingPage,
  type BudgetPricingVersion,
} from "./budget-pricing-logic";

const API_PATH = "/tenant/douyin-miniapp/budget/pricing-versions";
const DEFAULT_DISCLAIMER = "初步估算，不构成最终报价，实际费用以现场量房和正式报价为准。";
const PROPERTY_OPTIONS = [{ value: "rough", label: "毛坯" }, { value: "old_house", label: "旧房翻新" }] as const;
const TIER_OPTIONS = [{ value: "economy", label: "经济" }, { value: "comfortable", label: "舒适" }, { value: "quality", label: "品质" }] as const;
const SCOPE_OPTIONS = [{ value: "whole_house", label: "全屋" }, { value: "partial", label: "局部" }] as const;

export function BudgetPricing({ initialData, initialError }: {
  initialData: BudgetPricingPage;
  initialError: string | null;
}) {
  const [data, setData] = useState(initialData);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialData.list.find((item) => item.status === "draft")?.id
      ?? initialData.list.find((item) => item.status === "active")?.id
      ?? initialData.list[0]?.id ?? null,
  );
  const [items, setItems] = useState<BudgetPricingEditorItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [newItemCode, setNewItemCode] = useState<string>(BUDGET_ITEM_CODES[0]);
  const [draft, setDraft] = useState<BudgetPricingDraftInput>({
    effective_from: "", effective_to: "", disclaimer: DEFAULT_DISCLAIMER,
  });
  const requestAuthority = useRef(createBudgetPricingRequestAuthority()).current;
  const pageTarget = useRef(createBudgetPricingPageTarget(initialData.pagination.page)).current;
  const selectedVersion = data.list.find((version) => version.id === selectedId) ?? null;
  const activeVersion = data.active_version;
  const viewState = getBudgetPricingViewState({ loading, error, count: data.list.length });

  useEffect(() => {
    setItems((selectedVersion?.items ?? []).map(pricingItemToEditor));
    setDirty(false);
  }, [selectedVersion?.id, selectedVersion?.updated_at]);
  useEffect(() => () => requestAuthority.invalidate(), [requestAuthority]);

  const loadPage = useCallback(async (page: number): Promise<boolean> => {
    pageTarget.update(page);
    const request = requestAuthority.begin();
    setLoading(true);
    setError(null);
    try {
      const raw = await requestBackendJson<unknown>(
        `${API_PATH}?page=${page}&pageSize=${BUDGET_PRICING_PAGE_SIZE}`,
        { cache: "no-store", signal: request.controller.signal, fallbackMessage: "报价版本加载失败" },
      );
      if (!requestAuthority.isCurrent(request)) return false;
      const parsed = normalizePricingVersionPage(raw, { page, pageSize: BUDGET_PRICING_PAGE_SIZE });
      if (!parsed) throw new Error("报价版本分页数据无效，请刷新后重试");
      setData(parsed);
      setSelectedId((current) => parsed.list.some((item) => item.id === current)
        ? current : parsed.list[0]?.id ?? null);
      return true;
    } catch (loadError) {
      if (isBudgetPricingAbortError(loadError) || !requestAuthority.isCurrent(request)) return false;
      setData(createBudgetPricingFailurePage({ page, pageSize: BUDGET_PRICING_PAGE_SIZE }));
      setSelectedId(null);
      setItems([]);
      setDirty(false);
      setError(loadError instanceof Error ? loadError.message : "报价版本加载失败");
      return false;
    } finally {
      if (requestAuthority.isCurrent(request)) setLoading(false);
    }
  }, [pageTarget, requestAuthority]);

  const runMutation = useCallback(async (
    path: string, body: unknown, successMessage: string, method: "POST" | "PUT" = "POST",
  ): Promise<BudgetPricingVersion | null> => {
    const mutationRequest = requestAuthority.begin();
    setLoading(false);
    setBusy(true);
    setError(null);
    try {
      const raw = await requestBackendJson<unknown>(path, {
        method, body: JSON.stringify(body), signal: mutationRequest.controller.signal,
        fallbackMessage: "报价配置操作失败",
      });
      if (!requestAuthority.isCurrent(mutationRequest)) return null;
      const version = normalizePricingVersion(raw);
      if (!version) throw new Error("报价版本响应无效，请刷新后重试");
      const refreshed = await loadPage(pageTarget.current());
      if (!refreshed) {
        const message = "操作已提交，但最新报价状态刷新失败，请重新加载后确认";
        setError(message);
        toast.error(message);
        return null;
      }
      toast.success(successMessage);
      return version;
    } catch (mutationError) {
      if (isBudgetPricingAbortError(mutationError) || !requestAuthority.isCurrent(mutationRequest)) {
        return null;
      }
      toast.error(mutationError instanceof Error ? mutationError.message : "报价配置操作失败");
      return null;
    } finally {
      setBusy(false);
    }
  }, [loadPage, pageTarget, requestAuthority]);

  const draftWarnings = getPricingDraftWarnings(draft);
  const saveWarnings = getPricingItemWarnings(items, { requireActivationCoverage: false });
  const activationWarnings = [
    ...getPricingItemWarnings(items, { requireActivationCoverage: true }),
    ...(dirty ? ["请先保存报价项目，再启用版本"] : []),
  ];
  const preview = useMemo(() => calculatePricingPreview(items), [items]);
  const availableCodes = BUDGET_ITEM_CODES.filter((code) => !items.some((item) => item.item_code === code));

  async function handleCreateDraft() {
    if (draftWarnings.length > 0 || dirty) return;
    const version = await runMutation(API_PATH, buildPricingDraftPayload(draft), "报价草稿已创建");
    if (version) {
      setDraft({ effective_from: "", effective_to: "", disclaimer: DEFAULT_DISCLAIMER });
    }
  }

  async function handleSaveItems() {
    if (!selectedVersion || saveWarnings.length > 0) return;
    const version = await runMutation(`${API_PATH}/${selectedVersion.id}/items`,
      buildPricingItemsPayload(selectedVersion.updated_at, items), "报价项目已保存", "PUT");
    if (version) {
      setDirty(false);
    }
  }

  async function handleStateChange(action: "activate" | "archive") {
    if (!selectedVersion) return;
    await runMutation(`${API_PATH}/${selectedVersion.id}/${action}`, {
      expected_updated_at: selectedVersion.updated_at,
    }, action === "activate" ? "报价版本已启用" : "报价版本已归档");
  }

  function updateItem(index: number, patch: Partial<BudgetPricingEditorItem>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
    setDirty(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground"><Calculator aria-hidden="true" /></span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-normal">预算报价配置</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">维护抖音小程序预算初算的租户报价版本。启用后版本不可原地修改。</p>
        </div>
      </header>

      <fieldset className="contents" disabled={busy} aria-busy={busy}>
      <div className="grid gap-4 xl:grid-cols-[minmax(18rem,0.7fr)_minmax(28rem,1.3fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="shadow-none">
            <CardHeader><CardTitle>当前生效版本</CardTitle><CardDescription>小程序预算只读取当前使用中的版本。</CardDescription></CardHeader>
            <CardContent>{error ? <StatusAlert>当前生效版本状态未知，请重新加载后确认。</StatusAlert> : activeVersion ? <VersionSummary version={activeVersion} /> : <StatusAlert tone="warning">暂无生效报价，预算初算不会开放。</StatusAlert>}</CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle>新建报价草稿</CardTitle><CardDescription>先设置有效期和对用户展示的免责声明，再录入公司审定价格。</CardDescription></CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={draftWarnings.includes("请填写报价生效时间")}><FieldLabel htmlFor="budget-effective-from">生效时间</FieldLabel><Input id="budget-effective-from" type="datetime-local" value={draft.effective_from} aria-invalid={draftWarnings.includes("请填写报价生效时间")} onChange={(event) => setDraft((current) => ({ ...current, effective_from: event.target.value }))} /><FieldError>{draftWarnings.find((item) => item.includes("生效时间"))}</FieldError></Field>
                <Field data-invalid={draftWarnings.some((item) => item.includes("失效时间"))}><FieldLabel htmlFor="budget-effective-to">失效时间（选填）</FieldLabel><Input id="budget-effective-to" type="datetime-local" value={draft.effective_to} aria-invalid={draftWarnings.some((item) => item.includes("失效时间"))} onChange={(event) => setDraft((current) => ({ ...current, effective_to: event.target.value }))} /><FieldError>{draftWarnings.find((item) => item.includes("失效时间"))}</FieldError></Field>
                <Field data-invalid={draftWarnings.some((item) => item.includes("免责声明"))}><FieldLabel htmlFor="budget-disclaimer">免责声明</FieldLabel><Textarea id="budget-disclaimer" value={draft.disclaimer} aria-invalid={draftWarnings.some((item) => item.includes("免责声明"))} maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, disclaimer: event.target.value }))} /><FieldDescription>将在小程序预算结果中完整展示。</FieldDescription><FieldError>{draftWarnings.find((item) => item.includes("免责声明"))}</FieldError></Field>
              </FieldGroup>
            </CardContent>
            <CardFooter><Button title={dirty ? "请先保存或撤销当前报价修改" : undefined} disabled={busy || dirty || draftWarnings.length > 0} onClick={() => void handleCreateDraft()}>{busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />}创建报价草稿</Button></CardFooter>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle>报价版本</CardTitle><CardDescription>共 {data.pagination.total} 个版本，列表每页 {data.pagination.pageSize} 条。</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {viewState === "loading" ? <VersionListSkeleton /> : null}
              {viewState === "error" ? <div className="flex flex-col gap-2"><StatusAlert>{error}</StatusAlert><Button variant="outline" onClick={() => loadPage(pageTarget.current())}>重新加载报价状态</Button></div> : null}
              {viewState === "empty" ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Calculator /></EmptyMedia><EmptyTitle>还没有报价版本</EmptyTitle><EmptyDescription>填写上方信息创建首个草稿。</EmptyDescription></EmptyHeader></Empty> : null}
              {viewState === "ready" ? data.list.map((version) => <VersionButton key={version.id} version={version} selected={version.id === selectedId} disabled={busy || (dirty && version.id !== selectedId)} onSelect={() => setSelectedId(version.id)} />) : null}
            </CardContent>
            <CardFooter className="flex flex-wrap justify-between gap-2 border-t">
              <span className="text-sm tabular-nums text-muted-foreground">第 {data.pagination.page} / {Math.max(data.pagination.totalPages, 1)} 页</span>
              <div className="flex gap-2"><Button variant="outline" disabled={busy || loading || dirty || data.pagination.page <= 1} onClick={() => loadPage(data.pagination.page - 1)}><ChevronLeft data-icon="inline-start" />上一页</Button><Button variant="outline" disabled={busy || loading || dirty || data.pagination.page >= data.pagination.totalPages} onClick={() => loadPage(data.pagination.page + 1)}>下一页<ChevronRight data-icon="inline-end" /></Button></div>
            </CardFooter>
          </Card>
        </div>

        <Card className="min-w-0 shadow-none">
          <CardHeader><CardTitle>{selectedVersion ? `版本 ${selectedVersion.version_no} 报价项目` : "报价项目"}</CardTitle><CardDescription>{selectedVersion ? `${formatDateTime(selectedVersion.effective_from)} 起生效，${selectedVersion.disclaimer}` : "选择或创建草稿后维护报价项目。"}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!selectedVersion ? <StatusAlert tone="warning">当前没有可编辑版本。</StatusAlert> : null}
            {selectedVersion?.status !== "draft" ? <StatusAlert tone="warning">使用中或已归档版本不可修改。价格调整请创建新草稿。</StatusAlert> : null}
            {selectedVersion ? <PreviewPanel preview={preview} /> : null}
            {selectedVersion?.status === "draft" ? <>
              <ValidationSummary id="budget-pricing-save-validation-summary" warnings={saveWarnings} />
              <div className="flex flex-wrap items-end gap-2"><Field className="min-w-64 flex-1"><FieldLabel htmlFor="budget-item-code">添加报价项目</FieldLabel><FormSelect id="budget-item-code" value={availableCodes.includes(newItemCode as typeof availableCodes[number]) ? newItemCode : availableCodes[0] ?? ""} disabled={availableCodes.length === 0 || busy} options={availableCodes.map((code) => ({ value: code, label: BUDGET_ITEM_LABELS[code] }))} onChange={setNewItemCode} /></Field><Button variant="outline" disabled={availableCodes.length === 0 || busy} onClick={() => { const code = (availableCodes.includes(newItemCode as typeof availableCodes[number]) ? newItemCode : availableCodes[0]) as typeof BUDGET_ITEM_CODES[number] | undefined; if (!code) return; setItems((current) => [...current, createEmptyPricingEditorItem(code, current.length)]); setDirty(true); }}><Plus data-icon="inline-start" />添加项目</Button></div>
              <div className="flex flex-col gap-3">{items.map((item, index) => <PricingItemEditor key={item.item_code} item={item} index={index} onChange={(patch) => updateItem(index, patch)} onRemove={() => { setItems((current) => current.filter((_, itemIndex) => itemIndex !== index).map((entry, itemIndex) => ({ ...entry, sort_order: itemIndex }))); setDirty(true); }} />)}</div>
            </> : null}
          </CardContent>
          {selectedVersion?.status === "draft" ? <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t">
            <div className="flex flex-wrap gap-2"><Button aria-describedby={saveWarnings.length > 0 ? "budget-pricing-save-validation-summary" : undefined} disabled={busy || !dirty || saveWarnings.length > 0} onClick={() => void handleSaveItems()}>{busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}保存报价项目</Button><Button variant="ghost" disabled={busy || !dirty} onClick={() => { setItems(selectedVersion.items.map(pricingItemToEditor)); setDirty(false); }}>撤销未保存修改</Button></div>
            <div className="flex flex-wrap gap-2"><AlertDialog><AlertDialogTrigger asChild><Button aria-describedby={activationWarnings.length > 0 ? "budget-pricing-activation-validation-summary" : undefined} variant="outline" disabled={busy || activationWarnings.length > 0}>启用报价版本</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>启用报价版本 {selectedVersion.version_no}？</AlertDialogTitle><AlertDialogDescription>启用后将归档当前生效版本，且本版本价格和有效期不可原地修改。请确认已录入公司审定价格。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>返回检查</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => void handleStateChange("activate")}>确认启用报价</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><ValidationSummary id="budget-pricing-activation-validation-summary" warnings={activationWarnings} compact /></div>
          </CardFooter> : selectedVersion?.status === "active" ? <CardFooter className="justify-end border-t"><AlertDialog><AlertDialogTrigger asChild><Button variant="outline" disabled={busy}>归档当前版本</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>归档报价版本 {selectedVersion.version_no}？</AlertDialogTitle><AlertDialogDescription>归档后预算初算将暂停，直到启用另一个报价版本。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>取消</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => void handleStateChange("archive")}>确认归档版本</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></CardFooter> : null}
        </Card>
      </div>
      </fieldset>
    </div>
  );
}

function PricingItemEditor({ item, index, onChange, onRemove }: { item: BudgetPricingEditorItem; index: number; onChange: (patch: Partial<BudgetPricingEditorItem>) => void; onRemove: () => void }) {
  const minimumInvalid = !/^\d+(?:\.\d{1,2})?$/.test(item.minimum_amount_yuan);
  const maximumInvalid = !/^\d+(?:\.\d{1,2})?$/.test(item.maximum_amount_yuan);
  return <section className="flex flex-col gap-4 rounded-md border p-4" aria-labelledby={`budget-item-${index}`}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge variant="outline">{BUDGET_ITEM_LABELS[item.item_code]}</Badge><Badge variant="secondary">{BUDGET_CATEGORY_LABELS[item.category_code]}</Badge></div><Button type="button" variant="ghost" size="sm" onClick={onRemove}><Trash2 data-icon="inline-start" />移除项目</Button></div><FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Field><FieldLabel id={`budget-item-${index}`} htmlFor={`budget-label-${index}`}>展示名称</FieldLabel><Input id={`budget-label-${index}`} value={item.label} maxLength={40} onChange={(event) => onChange({ label: event.target.value })} /></Field><Field data-invalid={minimumInvalid}><FieldLabel htmlFor={`budget-min-${index}`}>最低价（元/{item.unit === "sqm" ? "㎡" : "项"}）</FieldLabel><Input id={`budget-min-${index}`} inputMode="decimal" value={item.minimum_amount_yuan} aria-invalid={minimumInvalid} onChange={(event) => onChange({ minimum_amount_yuan: event.target.value })} /></Field><Field data-invalid={maximumInvalid}><FieldLabel htmlFor={`budget-max-${index}`}>最高价（元/{item.unit === "sqm" ? "㎡" : "项"}）</FieldLabel><Input id={`budget-max-${index}`} inputMode="decimal" value={item.maximum_amount_yuan} aria-invalid={maximumInvalid} onChange={(event) => onChange({ maximum_amount_yuan: event.target.value })} /></Field><Field><FieldLabel htmlFor={`budget-status-${index}`}>项目状态</FieldLabel><FormSelect id={`budget-status-${index}`} value={item.status} options={[{ value: "active", label: "参与计算" }, { value: "inactive", label: "暂不参与" }]} onChange={(value) => onChange({ status: value as BudgetPricingEditorItem["status"] })} /></Field>{item.item_code.startsWith("base.") ? <><CoefficientField id={`budget-property-coefficient-${index}`} label="房屋现状系数（%）" value={item.property_condition_coefficient_bps ?? 10_000} onChange={(value) => onChange({ property_condition_coefficient_bps: value })} /><CoefficientField id={`budget-whole-coefficient-${index}`} label="全屋系数（%）" value={item.whole_house_coefficient_bps ?? 10_000} onChange={(value) => onChange({ whole_house_coefficient_bps: value })} /><CoefficientField id={`budget-partial-coefficient-${index}`} label="局部系数（%）" value={item.partial_coefficient_bps ?? 10_000} onChange={(value) => onChange({ partial_coefficient_bps: value })} /></> : <><Field><FieldLabel htmlFor={`budget-category-${index}`}>预算分类</FieldLabel><FormSelect id={`budget-category-${index}`} value={item.category_code} options={Object.entries(BUDGET_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} onChange={(value) => onChange({ category_code: value as BudgetPricingEditorItem["category_code"] })} /></Field><Field><FieldLabel htmlFor={`budget-unit-${index}`}>计价单位</FieldLabel><FormSelect id={`budget-unit-${index}`} value={item.unit} options={[{ value: "sqm", label: "按平方米" }, { value: "fixed", label: "按项目" }]} onChange={(value) => onChange({ unit: value as "sqm" | "fixed" })} /></Field><OptionApplicability item={item} index={index} onChange={onChange} /></>}</FieldGroup></section>;
}

function OptionApplicability({ item, index, onChange }: { item: BudgetPricingEditorItem; index: number; onChange: (patch: Partial<BudgetPricingEditorItem>) => void }) { return <FieldSet className="md:col-span-2 xl:col-span-3"><FieldLegend>适用条件（不选表示不限）</FieldLegend><div className="grid gap-4 md:grid-cols-3"><ConditionCheckboxGroup id={`budget-property-${index}`} label="适用房屋现状" options={PROPERTY_OPTIONS} values={item.property_conditions ?? []} onChange={(value, checked) => onChange({ property_conditions: toggleCanonicalCondition(item.property_conditions ?? [], value, checked, DOUYIN_PROPERTY_CONDITION_VALUES) })} /><ConditionCheckboxGroup id={`budget-tier-${index}`} label="适用装修档次" options={TIER_OPTIONS} values={item.decoration_tiers ?? []} onChange={(value, checked) => onChange({ decoration_tiers: toggleCanonicalCondition(item.decoration_tiers ?? [], value, checked, DOUYIN_DECORATION_TIER_VALUES) })} /><ConditionCheckboxGroup id={`budget-scope-${index}`} label="适用装修范围" options={SCOPE_OPTIONS} values={item.decoration_scopes ?? []} onChange={(value, checked) => onChange({ decoration_scopes: toggleCanonicalCondition(item.decoration_scopes ?? [], value, checked, DOUYIN_DECORATION_SCOPE_VALUES) })} /></div></FieldSet>; }
function ConditionCheckboxGroup<Value extends DouyinPropertyCondition | DouyinDecorationTier | DouyinDecorationScope>({ id, label, options, values, onChange }: { id: string; label: string; options: readonly { value: Value; label: string }[]; values: readonly Value[]; onChange: (value: Value, checked: boolean) => void }) { return <FieldSet><FieldLegend variant="label">{label}</FieldLegend><FieldGroup>{options.map((option) => <Field key={option.value} orientation="horizontal"><Checkbox id={`${id}-${option.value}`} checked={values.includes(option.value)} onCheckedChange={(checked) => onChange(option.value, checked === true)} /><FieldLabel htmlFor={`${id}-${option.value}`}>{option.label}</FieldLabel></Field>)}</FieldGroup></FieldSet>; }
function CoefficientField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) { return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type="number" min="0.01" max="1000" step="0.01" value={value / 100} onChange={(event) => onChange(Math.round(Number(event.target.value) * 100))} /></Field>; }
function PreviewPanel({ preview }: { preview: ReturnType<typeof calculatePricingPreview> }) { return <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/25 p-4"><div><p className="text-sm font-medium">100㎡舒适档毛坯全屋预览</p><p className="mt-1 text-xs text-muted-foreground">使用与公开预算接口相同的确定性计算器，不包含选配项目。</p></div><p className="text-lg font-semibold tabular-nums">{preview.ok ? `${formatYuan(preview.minimumTotalYuan)} 至 ${formatYuan(preview.maximumTotalYuan)}` : preview.message}</p></div>; }
function ValidationSummary({ id, warnings, compact = false }: { id: string; warnings: string[]; compact?: boolean }) { if (warnings.length === 0) return null; return <div id={id} className={compact ? "max-w-md" : undefined}><StatusAlert tone="warning" title="请先完成以下检查"><ul className="mt-1 list-disc pl-5">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></StatusAlert></div>; }
function VersionSummary({ version }: { version: BudgetPricingVersion }) { const display = pricingStatusDisplay(version.status); return <div className="flex flex-col gap-2"><div className="flex items-center gap-2"><Badge variant={display.variant}>{display.label}</Badge><span className="font-medium tabular-nums">版本 {version.version_no}</span></div><p className="text-sm text-muted-foreground">{formatDateTime(version.effective_from)} 至 {version.effective_to ? formatDateTime(version.effective_to) : "长期有效"}</p><p className="text-sm">{version.disclaimer}</p></div>; }
function VersionButton({ version, selected, disabled, onSelect }: { version: BudgetPricingVersion; selected: boolean; disabled: boolean; onSelect: () => void }) { const display = pricingStatusDisplay(version.status); return <button type="button" aria-pressed={selected} disabled={disabled} title={disabled ? "请先保存或撤销当前报价修改" : undefined} className="flex w-full items-center justify-between gap-3 rounded-md border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-primary aria-pressed:bg-secondary" onClick={onSelect}><span className="min-w-0"><span className="block text-sm font-medium tabular-nums">版本 {version.version_no}</span><span className="mt-1 block text-xs text-muted-foreground">{formatDateTime(version.effective_from)} · {version.items.length} 项</span></span><Badge variant={display.variant}>{display.label}</Badge></button>; }
function VersionListSkeleton() { return <div className="flex flex-col gap-2" aria-label="正在加载报价版本"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatYuan(value: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value); }
