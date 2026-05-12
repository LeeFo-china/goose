import { redirect } from "next/navigation";
import { Cpu, GitBranch, ServerCog } from "lucide-react";
import { AiModelRoutingPanel } from "@/components/platform-ai/ai-model-routing-panel";
import type { AiConfigData } from "@/components/platform-ai/ai-config-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

async function getAiConfig() {
  const token = await getAdminToken();
  if (!token) {
    return {
      data: { providers: [], models: [], routes: [] } as AiConfigData,
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl("/platform/ai-config"), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<AiConfigData>(response);
    return {
      data: payload.data || { providers: [], models: [], routes: [] },
      error: null,
    };
  } catch (error) {
    return {
      data: { providers: [], models: [], routes: [] } as AiConfigData,
      error: error instanceof Error ? error.message : "AI 模型路由配置加载失败",
    };
  }
}

export default async function PlatformAiModelsPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  const hasPlatformAccess = session.roles.includes("platform_admin");
  const result = hasPlatformAccess
    ? await getAiConfig()
    : {
      data: { providers: [], models: [], routes: [] } as AiConfigData,
      error: "当前账号不是平台超管，无法维护 AI 模型路由",
    };

  const activeRoutes = result.data.routes.filter((item) => item.status === "active").length;
  const activeModels = result.data.models.filter((item) => item.status === "active").length;
  const activeProviders = result.data.providers.filter((item) => item.status === "active").length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">AI 模型路由</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          统一维护平台 AI 供应商、模型和业务场景路由。场景配置生效后，后端按主模型调用，失败时可切换备用模型。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GitBranch className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">启用场景</div>
              <div className="text-xl font-semibold">
                {activeRoutes} / {result.data.routes.length}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Cpu className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">启用模型</div>
              <div className="text-xl font-semibold">
                {activeModels} / {result.data.models.length}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ServerCog className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">启用供应商</div>
              <div className="text-xl font-semibold">
                {activeProviders} / {result.data.providers.length}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {result.error ? <StatusAlert>{result.error}</StatusAlert> : null}

      {hasPlatformAccess ? <AiModelRoutingPanel data={result.data} /> : null}
    </div>
  );
}
