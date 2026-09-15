"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
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
    <section
      aria-labelledby="douyin-lead-capture-heading"
      className="overflow-hidden rounded-md border"
    >
      <div className="flex flex-col gap-3 border-b bg-muted/20 p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <h2 id="douyin-lead-capture-heading" className="text-sm font-semibold">
              手机号留资
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              优先使用抖音手机号授权快速提交；关闭后继续使用短信验证码。
            </p>
          </div>
          <Badge variant={enabled ? "success" : "secondary"}>
            {enabled ? "抖音手机号已启用" : "短信验证码模式"}
          </Badge>
        </div>
      </div>
      <div className="p-4">
        <FieldGroup>
          <Field orientation="horizontal" className="justify-between rounded-md border px-4 py-3">
            <div className="min-w-0 pr-4">
              <FieldLabel htmlFor={`${inputId}-switch`}>
                抖音官方手机号快捷留资
              </FieldLabel>
              <FieldDescription>
                开启后免费量房页展示官方手机号按钮，同时保留短信验证码兜底。
              </FieldDescription>
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
          </Field>
          <Field>
            <FieldLabel>当前授权小程序</FieldLabel>
            <FieldDescription>
              AppID：<span className="font-mono text-foreground">{installation.authorizer_appid}</span>
            </FieldDescription>
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>保存失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {!canManage ? (
            <Alert>
              <Info aria-hidden="true" />
              <AlertTitle>只读模式</AlertTitle>
              <AlertDescription>
                当前账号缺少抖音小程序管理权限，可查看但不能修改。
              </AlertDescription>
            </Alert>
          ) : null}
          {!authorizationActive ? (
            <Alert>
              <Info aria-hidden="true" />
              <AlertTitle>小程序授权未启用</AlertTitle>
              <AlertDescription>
                请先恢复当前小程序授权，再修改手机号留资配置。
              </AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
      </div>
      <div className="flex justify-end border-t p-4">
        <Button disabled={controlsDisabled} onClick={save}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          保存留资配置
        </Button>
      </div>
    </section>
  );
}

function UnboundLeadCaptureConfig() {
  return (
    <section className="rounded-md border p-4">
        <h2 className="text-sm font-semibold">手机号留资</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          完成抖音小程序授权后，可为当前商家启用抖音手机号快捷留资。
        </p>
    </section>
  );
}
