"use client";

import { TriangleAlert } from "lucide-react";
import type { AiProviderRecord, AiSceneRouteRecord, AiSystemSceneRecord, PageData } from "./ai-config-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AiRouteModelSelector, type RouteModelOptionsState, type RouteModelTarget } from "./ai-route-model-selector";
import { FormActions, RouteStatusSelect } from "./ai-model-routing-sections";
import { AiRouteTable } from "./ai-route-table";
import { AiSceneSelector } from "./ai-scene-selector";
import { AiManualModelFields } from "./ai-manual-model-fields";
import { routeModality } from "./ai-route-editor-shared";
import type { SceneMutation } from "./use-ai-route-editor";
import type { RouteFormState } from "./ai-model-routing-shared";

type Props = {
  routePage: PageData<AiSceneRouteRecord>; scenes: PageData<AiSystemSceneRecord>;
  sceneLoadError: string | null; sceneLoading: boolean; sceneKeyword?: string; saveError?: string;
  providers: AiProviderRecord[]; primaryOptions: RouteModelOptionsState; fallbackOptions: RouteModelOptionsState;
  routeForm: RouteFormState; selectedScene: AiSystemSceneRecord | null;
  isPending: boolean; isRouteLoading: boolean; isRouteSaving: boolean; canManageRoutes: boolean;
  onRouteFormChange: (form: RouteFormState) => void; onSceneChange: (code: string) => void; onSceneRetry: () => void;
  onSceneSearch?: (page: number, keyword: string) => void;
  onSceneMutation?: (change: SceneMutation) => Promise<boolean>;
  onRouteSubmit: () => Promise<void>; onRouteReset: () => void;
  onRouteEdit: (item: AiSceneRouteRecord) => void; onRoutePageChange: (page: number) => void;
  onProviderChange: (target: RouteModelTarget, providerId: string) => void;
  onKeywordChange: (target: RouteModelTarget, keyword: string) => void;
  onModelSearch: (target: RouteModelTarget, page?: number) => void;
  onModelSelect: (target: RouteModelTarget, value: RouteModelOptionsState["selected"]) => void;
};

export function AiModelRouteTab(props: Props) {
  const {
    routePage, scenes, sceneLoadError, sceneLoading, providers, primaryOptions, fallbackOptions,
    routeForm, selectedScene, isPending, isRouteLoading, isRouteSaving, canManageRoutes,
    onRouteFormChange, onSceneChange, onSceneRetry, onRouteSubmit, onRouteReset,
    onRouteEdit, onRoutePageChange, onProviderChange, onKeywordChange, onModelSearch, onModelSelect,
  } = props;
  const mutationLocked = isPending || isRouteSaving || !canManageRoutes;
  const modality = routeModality(routeForm);
  const canCreate = routeForm.scene_source === "custom" || Boolean(selectedScene?.allow_new_configuration && selectedScene.status !== "inactive");
  return (
    <div className="grid h-full min-h-0 auto-rows-max gap-4 overflow-auto xl:auto-rows-fr xl:grid-cols-[380px_minmax(0,1fr)] xl:overflow-hidden">
      <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0">
          <CardTitle>{routeForm.id ? "编辑场景路由" : "新增场景路由"}</CardTitle>
          <CardDescription>{canManageRoutes ? "选择已登记场景或新建自定义场景，再绑定主备模型。" : "当前账号仅可查看场景路由。"}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto">
          <FieldGroup className="[&_button]:min-h-11 [&_input]:min-h-11 sm:[&_button]:min-h-9 sm:[&_input]:min-h-9">
            {selectedScene?.runtime_status === "not_connected" || routeForm.scene_source === "custom" ? <Alert>
              <TriangleAlert /><AlertTitle>待业务接入</AlertTitle>
              <AlertDescription>可保存场景及主备模型配置。业务适配器接入后才能实际调用，保存配置不代表调用能力已验证。</AlertDescription>
            </Alert> : null}
            <AiSceneSelector key={selectedScene?.code || routeForm.scene_source} form={routeForm} selectedScene={selectedScene} scenes={scenes}
              keyword={props.sceneKeyword || ""} loading={sceneLoading} error={sceneLoadError} mutationError={props.saveError} disabled={mutationLocked}
              onChange={onRouteFormChange} onSceneChange={onSceneChange} onSearch={props.onSceneSearch} onRetry={onSceneRetry} onMutation={props.onSceneMutation} />
            {(["primary", "fallback"] as const).map((target) => <FieldGroup key={target}>
              <AiRouteModelSelector title={target === "primary" ? "主模型" : "备用模型"} target={target} providers={providers}
                providerId={routeForm[`${target}_provider_id`]} keyword={routeForm[`${target}_keyword`]}
                value={routeForm[`${target}_option_value`]} state={target === "primary" ? primaryOptions : fallbackOptions}
                allowNone={target === "fallback"} disabled={mutationLocked} sceneModality={modality}
                manualEnabled={routeForm[`${target}_manual`].enabled}
                onManual={() => onRouteFormChange({ ...routeForm, [`${target}_manual`]: { ...routeForm[`${target}_manual`], enabled: true } })}
                onProviderChange={onProviderChange} onKeywordChange={onKeywordChange} onSearch={onModelSearch} onSelect={onModelSelect} />
              <AiManualModelFields target={target} draft={routeForm[`${target}_manual`]} disabled={mutationLocked || providers.find((item) => item.id === routeForm[`${target}_provider_id`])?.status !== "active"}
                onChange={(draft) => onRouteFormChange({ ...routeForm, [`${target}_manual`]: draft })} />
            </FieldGroup>)}
            <details className="rounded-md border bg-muted/20 p-3">
              <summary className="min-h-8 cursor-pointer text-sm font-medium">高级参数</summary>
              <FieldGroup className="mt-3 sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="ai-route-temperature">温度</FieldLabel>
                  <Input id="ai-route-temperature" value={routeForm.temperature} disabled={mutationLocked}
                    onChange={(event) => onRouteFormChange({ ...routeForm, temperature: event.target.value })} inputMode="decimal" />
                </Field>
                {modality === "text" ? <Field>
                  <FieldLabel htmlFor="ai-route-format">响应格式</FieldLabel>
                  <Select value={routeForm.response_format || "__default"} disabled={mutationLocked}
                    onValueChange={(value) => onRouteFormChange({ ...routeForm, response_format: value === "__default" ? "" : value as "json_object" | "text" })}>
                    <SelectTrigger id="ai-route-format"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup><SelectItem value="__default">默认</SelectItem><SelectItem value="json_object">JSON</SelectItem><SelectItem value="text">文本</SelectItem></SelectGroup></SelectContent>
                  </Select>
                </Field> : null}
                <Field>
                  <FieldLabel htmlFor="ai-route-timeout">超时（毫秒）</FieldLabel>
                  <Input id="ai-route-timeout" value={routeForm.timeout_ms} disabled={mutationLocked}
                    onChange={(event) => onRouteFormChange({ ...routeForm, timeout_ms: event.target.value })} inputMode="numeric" />
                </Field>
              </FieldGroup>
            </details>
            <RouteStatusSelect id="ai-route-status" value={routeForm.status} disabled={mutationLocked} onChange={(status) => onRouteFormChange({ ...routeForm, status })} />
            {props.saveError ? <Alert variant="destructive"><AlertDescription>{props.saveError}</AlertDescription>
              <Button type="button" variant="outline" disabled={mutationLocked || sceneLoading} onClick={onSceneRetry}>刷新场景</Button>
            </Alert> : null}
            {canManageRoutes && (routeForm.id || canCreate) ? <FormActions isPending={mutationLocked} isEditing={Boolean(routeForm.id)} onReset={onRouteReset} onSubmit={onRouteSubmit} /> : null}
          </FieldGroup>
        </CardContent>
      </Card>
      <AiRouteTable page={routePage} loading={isRouteLoading} saving={isRouteSaving} canManage={canManageRoutes} onEdit={onRouteEdit} onPageChange={onRoutePageChange} />
    </div>
  );
}
