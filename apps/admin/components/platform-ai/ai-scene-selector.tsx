"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AiSystemSceneRecord, PageData } from "./ai-config-types";
import { MODEL_MODALITIES, MODEL_MODALITY_LABELS, resolveAiFocusTarget, type RouteFormState } from "./ai-model-routing-shared";
import type { SceneMutation } from "./use-ai-route-editor";

export function AiSceneSelector({ form, selectedScene, scenes, keyword, loading, error, mutationError, disabled,
  onChange, onSceneChange, onSearch, onRetry, onMutation }: {
  form: RouteFormState; selectedScene: AiSystemSceneRecord | null; scenes: PageData<AiSystemSceneRecord>;
  keyword: string; loading: boolean; error: string | null; mutationError?: string; disabled: boolean;
  onChange: (form: RouteFormState) => void; onSceneChange: (code: string) => void;
  onSearch?: (page: number, keyword: string) => void; onRetry: () => void;
  onMutation?: (change: SceneMutation) => Promise<boolean>;
}) {
  const [action, setAction] = useState<"rename" | "status" | "delete" | null>(null);
  const [name, setName] = useState("");
  const [keywordDraft, setKeywordDraft] = useState(keyword);
  useEffect(() => setKeywordDraft(keyword), [keyword]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  function restoreFocus() {
    const fallback = document.getElementById("ai-route-scene-source") as HTMLButtonElement | null;
    resolveAiFocusTarget(triggerRef.current, fallback)?.focus();
  }
  const custom = form.scene_source === "custom";
  const sceneOptions = selectedScene && !scenes.list.some((item) => item.code === selectedScene.code)
    ? [selectedScene, ...scenes.list] : scenes.list;
  const actionLabel = action === "rename" ? "重命名场景" : action === "delete" ? "删除场景"
    : selectedScene?.status === "inactive" ? "启用场景" : "停用场景";
  return <FieldGroup>
    <Field>
      <FieldLabel htmlFor="ai-route-scene-source">场景来源</FieldLabel>
      <Select value={form.scene_source} disabled={disabled || Boolean(form.id)} onValueChange={(value) => onChange({ ...form, scene_source: value as RouteFormState["scene_source"] })}>
        <SelectTrigger id="ai-route-scene-source" className="min-h-11 sm:min-h-9"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="registered">已登记场景</SelectItem><SelectItem value="custom">新建自定义场景</SelectItem></SelectGroup></SelectContent>
      </Select>
    </Field>
    {custom ? <>
      <Field>
        <FieldLabel htmlFor="ai-custom-scene-name">自定义场景名称（必填）</FieldLabel>
        <Input id="ai-custom-scene-name" className="min-h-11 sm:min-h-9" required maxLength={120} value={form.custom_scene_name} disabled={disabled}
          onChange={(event) => onChange({ ...form, custom_scene_name: event.target.value })} />
      </Field>
      <Field>
        <FieldLabel htmlFor="ai-custom-scene-modality">模型模态（必填）</FieldLabel>
        <Select value={form.custom_scene_modality} disabled={disabled} onValueChange={(value) => onChange({ ...form, custom_scene_modality: value as RouteFormState["custom_scene_modality"] })}>
          <SelectTrigger id="ai-custom-scene-modality" className="min-h-11 sm:min-h-9" aria-required="true"><SelectValue placeholder="选择模型模态" /></SelectTrigger>
          <SelectContent><SelectGroup>{MODEL_MODALITIES.map((value) => <SelectItem key={value} value={value}>{MODEL_MODALITY_LABELS[value]}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
    </> : <>
      <Field>
        <FieldLabel htmlFor="ai-route-scene-keyword">搜索业务场景</FieldLabel>
        <div className="flex gap-2">
          <Input id="ai-route-scene-keyword" className="min-h-11 min-w-0 sm:min-h-9" value={keywordDraft} maxLength={120} disabled={disabled}
            placeholder="搜索场景名称或编码" onChange={(event) => setKeywordDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !disabled && !loading) { event.preventDefault(); onSearch?.(1, keywordDraft); } }} />
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={disabled || loading} onClick={() => onSearch?.(1, keywordDraft)}>
            <Search data-icon="inline-start" />搜索场景
          </Button>
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor="ai-route-scene">业务场景</FieldLabel>
        <div className="flex items-center gap-2">
          <Select value={form.scene_code} disabled={disabled || Boolean(form.id)} onValueChange={onSceneChange}>
            <SelectTrigger id="ai-route-scene" className="min-h-11 min-w-0 sm:min-h-9"><SelectValue placeholder="选择已登记场景" /></SelectTrigger>
            <SelectContent><SelectGroup>{sceneOptions.map((item) => <SelectItem key={item.code} value={item.code}
              disabled={!item.allow_new_configuration && item.source !== "custom" && item.code !== form.scene_code}>
              {item.name} · {item.source === "custom" ? "自定义" : item.source === "legacy" ? "历史" : "系统"}{item.status === "inactive" ? "（停用）" : ""}
            </SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {selectedScene?.source === "custom" ? <DropdownMenu>
            <DropdownMenuTrigger asChild><Button ref={triggerRef} type="button" variant="outline" size="icon" className="size-11 shrink-0 sm:size-9" disabled={disabled} aria-label="自定义场景操作"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => { setName(selectedScene.name); setAction("rename"); }}>重命名场景</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAction("status")}>{selectedScene.status === "inactive" ? "启用场景" : "停用场景"}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAction("delete")}>删除场景</DropdownMenuItem>
            </DropdownMenuGroup></DropdownMenuContent>
          </DropdownMenu> : null}
        </div>
        {loading ? <FieldDescription role="status">场景加载中</FieldDescription> : null}
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription><Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={loading} onClick={onRetry}>重试加载场景</Button></Alert> : null}
        {!loading && !error && scenes.list.length === 0 ? <FieldDescription role="status">没有符合搜索条件的场景，可调整关键词或新建自定义场景。</FieldDescription> : null}
        {scenes.pagination.page < scenes.pagination.totalPages ? <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={loading || disabled}
          onClick={() => onSearch?.(scenes.pagination.page + 1, keyword)}>加载更多场景</Button> : null}
      </Field>
    </>}
    <Field><FieldLabel htmlFor="ai-route-scene-code">场景编码</FieldLabel><Input id="ai-route-scene-code" value={custom ? "保存后生成" : form.scene_code} readOnly aria-readonly="true" /></Field>
    {!custom ? <>
      <Field><FieldLabel htmlFor="ai-route-name">路由名称</FieldLabel><Input id="ai-route-name" value={form.name} disabled={disabled} maxLength={120} onChange={(event) => onChange({ ...form, name: event.target.value })} /></Field>
      <Field><FieldLabel htmlFor="ai-route-modality">模型模态</FieldLabel><Input id="ai-route-modality" value={MODEL_MODALITY_LABELS[form.modality]} readOnly aria-readonly="true" /></Field>
    </> : null}
    <AlertDialog open={Boolean(action)} onOpenChange={(open) => { if (!open && !disabled) setAction(null); }}>
      <AlertDialogContent className="[&_button]:min-h-11 [&_input]:min-h-11 sm:[&_button]:min-h-9 sm:[&_input]:min-h-9" onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}>
        <AlertDialogHeader><AlertDialogTitle>{actionLabel}</AlertDialogTitle><AlertDialogDescription>
          {action === "delete" ? "删除后不可恢复；仍有路由引用时无法删除。" : action === "rename" ? "名称会更新到可复用的场景列表，场景编码保持不变。"
            : selectedScene?.status === "inactive" ? "启用后可新增或修改此场景的路由配置，实际调用能力仍需验证。" : "停用后不可新增或修改此场景的路由配置，可再次启用。"}
        </AlertDialogDescription></AlertDialogHeader>
        {action === "rename" ? <Field><FieldLabel htmlFor="ai-scene-rename">场景名称</FieldLabel><Input id="ai-scene-rename" value={name} required maxLength={120} disabled={disabled} onChange={(event) => setName(event.target.value)} /></Field> : null}
        {mutationError ? <Alert variant="destructive"><AlertDescription>{mutationError}</AlertDescription><Button type="button" variant="outline" disabled={disabled || loading} onClick={onRetry}>刷新场景</Button></Alert> : null}
        <AlertDialogFooter><AlertDialogCancel disabled={disabled}>取消</AlertDialogCancel><AlertDialogAction disabled={disabled || (action === "rename" && !name.trim())}
          onClick={async (event) => {
            event.preventDefault();
            const change: SceneMutation = action === "rename" ? { name: name.trim() } : action === "delete" ? { delete: true } : { status: selectedScene?.status === "inactive" ? "active" : "inactive" };
            if (await onMutation?.(change)) { setAction(null); requestAnimationFrame(restoreFocus); }
          }}>{actionLabel}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </FieldGroup>;
}
