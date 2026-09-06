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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { requestBackendJson } from "@/lib/backend-client";

import type { TenantDouyinWorkspace } from "./workspace-types";

type Installation = NonNullable<TenantDouyinWorkspace["installation"]>;

const clueComponentIdSchema = z.string().trim().regex(
  /^[A-Za-z0-9_-]{1,128}$/,
  "线索组件 ID 格式无效",
);

const responseSchema = z.strictObject({
  installation_id: z.uuid(),
  authorizer_appid: z.string().min(1),
  enabled: z.boolean(),
  clue_component_id: clueComponentIdSchema.nullable(),
  updated_at: z.iso.datetime({ offset: true }),
}).superRefine((value, context) => {
  if (value.enabled && value.clue_component_id === null) {
    context.addIssue({
      code: "custom",
      path: ["clue_component_id"],
      message: "启用状态缺少线索组件 ID",
    });
  }
});

export type LeadCaptureConfigResponse = z.output<typeof responseSchema>;

export function buildLeadCaptureConfigRequest(
  installation: Installation,
  enabled: boolean,
  rawComponentId: string,
) {
  const componentId = rawComponentId.trim();
  if (enabled && !componentId) {
    return {
      data: null,
      error: "启用抖音官方手机号时必须填写线索组件 ID",
    } as const;
  }
  if (componentId && !clueComponentIdSchema.safeParse(componentId).success) {
    return { data: null, error: "线索组件 ID 格式无效" } as const;
  }
  return {
    data: {
      authorizer_appid: installation.authorizer_appid,
      enabled,
      clue_component_id: componentId || null,
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
  const errorId = useId();
  const initiallyEnabled =
    initialInstallation.runtime_config.features.phone_capture_mode ===
    "douyin_phone";
  const [installation, setInstallation] = useState(initialInstallation);
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [componentId, setComponentId] = useState(
    initialInstallation.clue_component_id ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const request = buildLeadCaptureConfigRequest(
      installation,
      enabled,
      componentId,
    );
    if (request.error) {
      setError(request.error);
      return;
    }
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
        clue_component_id: saved.clue_component_id,
        updated_at: saved.updated_at,
      }));
      setEnabled(saved.enabled);
      setComponentId(saved.clue_component_id ?? "");
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
              优先使用抖音官方组件快速获取手机号；关闭后继续使用短信验证码。
            </p>
          </div>
          <Badge variant={enabled ? "success" : "secondary"}>
            {enabled ? "官方组件已启用" : "短信验证码模式"}
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
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={inputId}>线索组件 ID</FieldLabel>
            <Input
              id={inputId}
              aria-describedby={error ? errorId : undefined}
              aria-invalid={Boolean(error)}
              autoComplete="off"
              disabled={controlsDisabled}
              maxLength={128}
              onChange={(event) => {
                setComponentId(event.target.value);
                setError(null);
              }}
              placeholder="请输入抖音开放平台生成的组件 ID"
              value={componentId}
            />
            <FieldDescription>
              当前授权 AppID：<span className="font-mono text-foreground">{installation.authorizer_appid}</span>。关闭功能不会删除已保存的组件 ID。
            </FieldDescription>
            <FieldError id={errorId}>{error}</FieldError>
          </Field>
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
          完成抖音小程序授权后，可为当前商家配置官方线索组件。
        </p>
    </section>
  );
}
