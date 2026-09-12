import type { AiProviderRecord, AiRouteModelOptionRecord } from "./ai-config-types";
import type { RouteModelOptionsState } from "./ai-route-model-selector";
import { Badge } from "@/components/ui/badge";
import { FieldDescription } from "@/components/ui/field";

const probeLabels = {
  unverified: "能力待核实",
  eligible: "能力记录可用（不代表调用已验证）",
  ineligible: "能力记录不符合要求",
  stale: "能力记录需重新核实",
};

const modalityLabels = { text: "文本", image: "图片", video: "视频", speech: "语音" };

function ModelDetails({ model, sceneModality }: { model: AiRouteModelOptionRecord; sceneModality: AiRouteModelOptionRecord["modality"] }) {
  return <>
    <p className="break-words text-sm font-medium">{model.name || model.label}</p>
    <p className="break-all text-xs text-muted-foreground">调用 ID：{model.model_name || model.description || "未登记"}</p>
    <p className="text-xs text-muted-foreground">已登记输出模态：{model.modality} · 已登记输入模态：{model.input_modalities?.join("、") || "未登记"}</p>
    <div className="flex flex-wrap gap-1">
      <Badge variant="outline">{probeLabels[model.probe_status || "unverified"]}</Badge>
      {model.status === "inactive" ? <Badge variant="outline">模型已停用</Badge> : null}
    </div>
    {model.modality !== sceneModality ? <p className="text-xs text-muted-foreground">{modalityLabels[model.modality]}模型不匹配{modalityLabels[sceneModality]}场景</p> : null}
  </>;
}

export function AiRouteModelInspection({ title, state, providers, providerId, sceneModality }: {
  title: string; state: RouteModelOptionsState; providers: AiProviderRecord[]; providerId: string; sceneModality: AiRouteModelOptionRecord["modality"];
}) {
  const boundProvider = providers.find((provider) => provider.id === state.selected?.provider_id);
  return <div className="min-w-0 space-y-3">
    <div aria-label={`当前${title}绑定`} className="space-y-1 border-b pb-3">
      {state.selected ? <>
        <p className="text-sm font-medium">当前{title}绑定 · {boundProvider?.name || "原供应商（记录不可用）"}</p>
        <p className="break-words text-sm">{state.selected.label}</p>
        <p className="break-all text-xs text-muted-foreground">调用 ID：{state.selected.model_name || state.selected.description || "未登记"}</p>
        {state.selected.status && state.selected.status !== "active" ? <Badge variant="outline">当前绑定模型不可用</Badge> : null}
        <FieldDescription>原绑定已保留，浏览供应商和模型不会修改绑定。</FieldDescription>
      </> : <p className="text-sm text-muted-foreground">尚未绑定{title}</p>}
    </div>
    <p className="text-xs text-muted-foreground">以下仅为平台已登记模型，非厂商完整目录。运行时尚未接通，暂不能绑定模型；登记信息不表示已满足生图或多图输入能力。</p>
    {!state.loading && !state.error && providerId ? (
      state.data.list.length ? <ul aria-label={`${title}已登记模型`} className="divide-y">
        {state.data.list.map((model) => <li key={model.value} className="space-y-2 py-3 first:pt-0"><ModelDetails model={model} sceneModality={sceneModality} /></li>)}
      </ul> : <FieldDescription role="status">暂无已登记模型。</FieldDescription>
    ) : null}
  </div>;
}
