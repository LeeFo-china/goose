"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Info, Loader2, Plus, RefreshCw } from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { TencentSipServerConfig } from "@/components/cameras/camera-types";
import {
  DeviceSecretDialog,
  type TencentDeviceSecretResult,
  type TencentPasswordResult,
} from "@/components/cameras/tencent-device-secret-dialog";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

type TencentDeviceCreateResult = {
  device: TencentDeviceSecretResult;
  sip_server: TencentSipServerConfig | null;
};

async function requestBackend<T>(input: {
  path: string;
  method?: "GET" | "POST";
  payload?: unknown;
}) {
  return requestBackendJson<T>(input.path, {
    method: input.method || "GET",
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
}

export function TencentSipAccessButton({
  sipServer,
  device,
  size = "sm",
}: {
  sipServer: TencentSipServerConfig | null;
  device?: TencentDeviceSecretResult;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <Info data-icon="inline-start" />
        接入信息
      </Button>
      {open ? (
        <DeviceSecretDialog
          title={device ? "设备接入信息" : "腾讯云 SIP 接入信息"}
          description={device
            ? "请把以下服务器和设备信息配置到现场设备本地页面。"
            : "现场设备注册腾讯云行业版时使用这些 SIP 服务器参数。"}
          device={device || {
            device_name: "请选择或新增设备",
            device_type_label: "-",
            sip_username: "来自设备行的 SIP 用户",
            sip_password: "通过设备行查密码或重置获取",
            sip_transport_protocol: "TCP",
            device_id: "-",
          }}
          sipServer={sipServer}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function CreateTencentDeviceButton({
  projectId,
  sipServer,
}: {
  projectId: string;
  sipServer: TencentSipServerConfig | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [deviceType, setDeviceType] = useState("2");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<TencentDeviceCreateResult | null>(null);

  function submit() {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestBackend<TencentDeviceCreateResult>({
          path: `/projects/${projectId}/cameras/tencent-devices`,
          method: "POST",
          payload: {
            name: name.trim(),
            device_type: Number(deviceType),
            password: password.trim() || null,
          },
        });
        setResult({
          ...data,
          sip_server: data.sip_server || sipServer,
        });
        setOpen(false);
        setName("");
        setPassword("");
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "创建设备失败");
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        新增设备
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => !pending && setOpen(nextOpen)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>新增腾讯云设备</DialogTitle>
            <DialogDescription>
              创建设备后会返回 SIP 用户名和认证密码，用于现场摄像头或 NVR 注册。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="tencent-device-name">设备名称</FieldLabel>
              <Input
                id="tencent-device-name"
                value={name}
                disabled={pending}
                placeholder="例如：客厅IPC"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tencent-device-type">设备类型</FieldLabel>
              <FormSelect
                id="tencent-device-type"
                value={deviceType}
                disabled={pending}
                options={[
                  { value: "2", label: "IPC 摄像机" },
                  { value: "3", label: "NVR 主设备" },
                ]}
                onChange={setDeviceType}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tencent-device-password">SIP认证密码</FieldLabel>
              <Input
                id="tencent-device-password"
                value={password}
                disabled={pending}
                maxLength={16}
                placeholder="留空自动生成"
                onChange={(event) => setPassword(event.target.value)}
              />
              <FieldDescription>
                支持英文、数字和下划线，最多 16 个字符。留空时后端自动生成。
              </FieldDescription>
            </Field>
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={pending || !name.trim()} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {result ? (
        <DeviceSecretDialog
          title="腾讯云设备已创建"
          description="请把以下接入信息配置到现场设备本地页面。"
          device={result.device}
          sipServer={result.sip_server}
          onClose={() => setResult(null)}
        />
      ) : null}
    </>
  );
}

export function TencentDevicePasswordActions({
  projectId,
  deviceId,
  deviceName,
  deviceCode,
}: {
  projectId: string;
  deviceId: string;
  deviceName: string;
  deviceCode?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [result, setResult] = useState<TencentPasswordResult | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  function queryPassword() {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestBackend<TencentPasswordResult>({
          path: `/projects/${projectId}/cameras/tencent-devices/${encodeURIComponent(deviceId)}/password`,
        });
        setResult({
          ...data,
          device_id: deviceId,
          device_name: deviceName,
          sip_username: data.device_code || deviceCode || deviceId.split("_")[0],
          sip_transport_protocol: "TCP",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "查询密码失败");
      }
    });
  }

  function resetPassword() {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestBackend<TencentPasswordResult>({
          path: `/projects/${projectId}/cameras/tencent-devices/${encodeURIComponent(deviceId)}/password`,
          method: "POST",
          payload: {},
        });
        setResult({
          ...data,
          device_id: deviceId,
          device_name: deviceName,
          sip_username: data.device_code || deviceCode || deviceId.split("_")[0],
          sip_transport_protocol: "TCP",
        });
        setResetOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "重置密码失败");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={queryPassword}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
          查密码
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setResetOpen(true)}>
          <RefreshCw data-icon="inline-start" />
          重置
        </Button>
      </div>
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
      {result ? (
        <DeviceSecretDialog
          title="SIP认证密码"
          description="以下密码仅用于现场设备本地注册配置。"
          device={result}
          onClose={() => setResult(null)}
        />
      ) : null}
      <ConfirmActionDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="重置 SIP 认证密码"
        description="重置后现场设备必须同步更新 SIP 认证密码，否则可能离线。确认继续？"
        confirmLabel="确认重置"
        pending={pending}
        onConfirm={resetPassword}
      />
    </div>
  );
}
