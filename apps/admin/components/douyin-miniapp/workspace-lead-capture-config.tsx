"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { requestBackendJson } from "@/lib/backend-client";

import type { TenantDouyinWorkspace } from "./workspace-types";

type Installation = NonNullable<TenantDouyinWorkspace["installation"]>;

const responseSchema = z.strictObject({
  installation_id: z.uuid(),
  authorizer_appid: z.string().min(1),
  enabled: z.boolean(),
  updated_at: z.iso.datetime({ offset: true }),
});

export type LeadCaptureConfigResponse = z.output<typeof responseSchema>;

export function buildLeadCaptureConfigRequest(
  installation: Installation,
  enabled: boolean,
) {
  return {
    data: {
      authorizer_appid: installation.authorizer_appid,
      enabled,
      expected_updated_at: installation.updated_at,
    },
    error: null,
  } as const;
}

export function parseLeadCaptureConfigResponse(
  value: unknown,
): LeadCaptureConfigResponse {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) throw new Error("手机号留资配置响应格式无效");
  return parsed.data;
}

export function TenantDouyinLeadCaptureConfig({
  canManage,
  installation,
}: {
  canManage: boolean;
  installation: Installation | null;
}) {
  if (!installation) return <UnboundLeadCaptureConfig />;
  return (
    <BoundLeadCaptureConfig
      canManage={canManage}
      initialInstallation={installation}
    />
  );
}

function BoundLeadCaptureConfig({
  canManage,
  initialInstallation,
}: {
  canManage: boolean;
  initialInstallation: Installation;
}) {
  const inputId = useId();
  const initiallyEnabled =
    initialInstallation.runtime_config.features.phone_capture_mode ===
    "douyin_phone";
  const [installation, setInstallation] = useState(initialInstallation);
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const request = buildLeadCaptureConfigRequest(installation, enabled);
    setPending(true);
    setError(null);
    try {
      const raw = await requestBackendJson<unknown>(
        "/tenant/douyin-miniapp/lead-capture-config",
        {
          method: "PATCH",
          body: JSON.stringify(request.data),
          fallbackMessage: "手机号留资配置保存失败",
        },
      );
      const saved = parseLeadCaptureConfigResponse(raw);
      setInstallation((current) => ({
        ...current,
        updated_at: saved.updated_at,
      }));
      setEnabled(saved.enabled);
      toast.success("手机号留资配置已保存");
    } catch (saveError) {
      const code = (saveError as { code?: unknown }).code;
      if (code === "DOUYIN_LEAD_CAPTURE_CONFIG_STALE") {
        window.location.reload();
        return;
      }
      setError(saveError instanceof Error
        ? saveError.message
        : "手机号留资配置保存失败");
    } finally {
      setPending(false);
    }
  }

  const authorizationActive = installation.authorization_status === "active";
  const controlsDisabled = !canManage || !authorizationActive || pending;
  return (
    <section aria-labelledby="douyin-lead-capture-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="douyin-lead-capture-heading" className="text-sm font-semibold">手机号留资</h2>
        <Badge variant={enabled ? "success" : "secondary"}>
          {enabled ? "抖音手机号已启用" : "短信验证码模式"}
        </Badge>
      </div>
      <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <label htmlFor={`${inputId}-switch`} className="text-sm font-medium">抖音官方手机号快捷留资</label>
          <p className="mt-1 text-xs text-muted-foreground">开启后仍保留短信验证码兜底。</p>
        </div>
        <Switch
          id={`${inputId}-switch`}
          checked={enabled}
          disabled={controlsDisabled}
          onCheckedChange={(checked) => {
            setEnabled(checked);
            setError(null);
          }}
        />
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="break-all text-xs text-muted-foreground">
          当前授权小程序 AppID：<span className="font-mono text-foreground">{installation.authorizer_appid}</span>
        </p>
        <Button disabled={controlsDisabled} onClick={save} size="sm" variant="outline">
          {pending ? <Spinner data-icon="inline-start" /> : null}
          保存留资配置
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive" className="mt-3">
          <AlertTitle>保存失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {!canManage ? <p className="mt-3 text-xs text-muted-foreground">只读模式：当前账号缺少抖音小程序管理权限。</p> : null}
      {!authorizationActive ? <p className="mt-3 text-xs text-muted-foreground">小程序授权未启用，请先恢复授权再修改留资配置。</p> : null}
    </section>
  );
}

function UnboundLeadCaptureConfig() {
  return (
    <section>
      <h2 className="text-sm font-semibold">手机号留资</h2>
      <p className="mt-1 text-xs text-muted-foreground">完成小程序授权后，可启用抖音手机号快捷留资。</p>
    </section>
  );
}
