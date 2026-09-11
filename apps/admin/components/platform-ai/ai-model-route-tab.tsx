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
import type { RouteFormState } from "./ai-model-routing-shared";

type Props = {
  routePage: PageData<AiSceneRouteRecord>;
  scenes: PageData<AiSystemSceneRecord>;
  sceneLoadError: string | null;
  sceneLoading: boolean;
  providers: AiProviderRecord[];
  primaryOptions: RouteModelOptionsState;
  fallbackOptions: RouteModelOptionsState;
  routeForm: RouteFormState;
  selectedScene: AiSystemSceneRecord | null;
  isPending: boolean;
  isRouteLoading: boolean;
  isRouteSaving: boolean;
  canManageRoutes: boolean;
  onRouteFormChange: (form: RouteFormState) => void;
  onSceneChange: (code: string) => void;
  onSceneRetry: () => void;
  onRouteSubmit: () => Promise<void>;
  onRouteReset: () => void;
  onRouteEdit: (item: AiSceneRouteRecord) => void;
  onRoutePageChange: (page: number) => void;
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
  const isNotConnected = selectedScene?.runtime_status === "not_connected";
  const mutationLocked = isPending || isRouteSaving || !canManageRoutes;
  const canCreate = !routeForm.id && selectedScene?.source === "system"
    && selectedScene.allow_new_configuration && !sceneLoadError && !isNotConnected;
  const bindingDisabled = mutationLocked || isNotConnected;
  const sceneOptions = selectedScene && !scenes.list.some((item) => item.code === selectedScene.code)
    ? [selectedScene, ...scenes.list] : scenes.list;

  return (
    <div className="grid h-full min-h-0 auto-rows-max gap-4 overflow-auto xl:auto-rows-fr xl:grid-cols-[380px_minmax(0,1fr)] xl:overflow-hidden">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0">
          <CardTitle>{routeForm.id ? "编辑场景路由" : "新增场景路由"}</CardTitle>
          <CardDescription>
            {canManageRoutes ? "从业务场景注册表选择，再绑定符合模态的主备模型。" : "当前账号仅可查看场景路由。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto">
          <FieldGroup>
            {isNotConnected ? (
              <Alert>
                <TriangleAlert />
                <AlertTitle>尚未接通</AlertTitle>
                <AlertDescription>
                  生图适配器尚未启用。保留现有绑定，暂不能新增或更换模型。此配置不表示可以生成图片或方舟目录已就绪。
                </AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel htmlFor="ai-route-scene">业务场景</FieldLabel>
              <Select value={routeForm.scene_code} onValueChange={onSceneChange}
                disabled={mutationLocked || Boolean(routeForm.id) || Boolean(sceneLoadError) || sceneLoading}>
                <SelectTrigger id="ai-route-scene">
                  <SelectValue placeholder={sceneLoadError ? "场景注册表加载失败" : "选择业务场景"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {sceneOptions.filter((item) => routeForm.id || (item.source === "system" && item.allow_new_configuration)).map((item) => (
                      <SelectItem key={item.code} value={item.code}>{item.name} · {item.code}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {sceneLoadError ? (
                <Alert variant="destructive">
                  <AlertDescription>场景注册表加载失败，暂不能新增配置。</AlertDescription>
                  <Button type="button" size="sm" variant="outline" disabled={sceneLoading} onClick={onSceneRetry}>
                    重试加载场景
                  </Button>
                </Alert>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="ai-route-scene-code">场景编码</FieldLabel>
              <Input id="ai-route-scene-code" value={routeForm.scene_code} readOnly aria-readonly="true" />
            </Field>
            <Field>
              <FieldLabel htmlFor="ai-route-name">场景名称</FieldLabel>
              <Input id="ai-route-name" value={routeForm.name} disabled={mutationLocked}
                onChange={(event) => onRouteFormChange({ ...routeForm, name: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ai-route-modality">模型模态</FieldLabel>
              <Input id="ai-route-modality" value={routeForm.modality} readOnly aria-readonly="true" />
            </Field>
            <AiRouteModelSelector
              title="主模型" target="primary" providers={providers}
              providerId={routeForm.primary_provider_id} keyword={routeForm.primary_keyword}
              value={routeForm.primary_option_value} state={primaryOptions} disabled={bindingDisabled}
              onProviderChange={onProviderChange} onKeywordChange={onKeywordChange}
              onSearch={onModelSearch} onSelect={onModelSelect}
            />
            <AiRouteModelSelector
              title="备用模型" target="fallback" providers={providers}
              providerId={routeForm.fallback_provider_id} keyword={routeForm.fallback_keyword}
              value={routeForm.fallback_option_value} state={fallbackOptions} allowNone disabled={bindingDisabled}
              onProviderChange={onProviderChange} onKeywordChange={onKeywordChange}
              onSearch={onModelSearch} onSelect={onModelSelect}
            />
            <details className="rounded-md border bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium">高级参数</summary>
              <FieldGroup className="mt-3 sm:grid sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="ai-route-temperature">温度</FieldLabel>
                  <Input id="ai-route-temperature" value={routeForm.temperature} disabled={mutationLocked}
                    onChange={(event) => onRouteFormChange({ ...routeForm, temperature: event.target.value })} inputMode="decimal" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ai-route-format">格式</FieldLabel>
                  <Select value={routeForm.response_format || "__default"} disabled={mutationLocked}
                    onValueChange={(value) => onRouteFormChange({ ...routeForm, response_format: value === "__default" ? "" : value as "json_object" | "text" })}>
                    <SelectTrigger id="ai-route-format"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="__default" disabled>默认</SelectItem>
                        <SelectItem value="json_object">JSON</SelectItem>
                        <SelectItem value="text">文本</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ai-route-timeout">超时</FieldLabel>
                  <Input id="ai-route-timeout" value={routeForm.timeout_ms} disabled={mutationLocked}
                    onChange={(event) => onRouteFormChange({ ...routeForm, timeout_ms: event.target.value })} inputMode="numeric" />
                </Field>
              </FieldGroup>
            </details>
            <RouteStatusSelect id="ai-route-status" value={routeForm.status} disabled={mutationLocked}
              onChange={(status) => onRouteFormChange({ ...routeForm, status })} />
            {canManageRoutes && (routeForm.id || canCreate) ? (
              <FormActions isPending={mutationLocked} isEditing={Boolean(routeForm.id)} onReset={onRouteReset} onSubmit={onRouteSubmit} />
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>
      <AiRouteTable page={routePage} loading={isRouteLoading} saving={isRouteSaving}
        canManage={canManageRoutes} onEdit={onRouteEdit} onPageChange={onRoutePageChange} />
    </div>
  );
}
