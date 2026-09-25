"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus, Settings2 } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { TencentSipServerConfig } from "@/components/cameras/camera-types";
import { DeviceSecretDialog, type TencentDeviceSecretResult } from "@/components/cameras/tencent-device-secret-dialog";
import { requestBackendJson } from "@/lib/backend-client";

type CreateTenantDeviceResult = {
  device: TencentDeviceSecretResult;
  sip_server: TencentSipServerConfig | null;
};

export function TenantDeviceCreateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [hardwareSerial, setHardwareSerial] = useState("");
  const [deviceType, setDeviceType] = useState("2");
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreateTenantDeviceResult | null>(null);

  function submit() {
    const serial = hardwareSerial.trim();
    if (!serial || pending) return;
    setError("");
    startTransition(async () => {
      try {
        const created = await requestBackendJson("/tenant-devices/tencent", {
          method: "POST",
          body: JSON.stringify({
            hardware_serial: hardwareSerial,
            device_type: Number(deviceType),
            password: null,
          }),
        }) as CreateTenantDeviceResult;
        setResult(created);
        setOpen(false);
        setHardwareSerial("");
        setDeviceType("2");
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "登记设备失败");
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        登记设备
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => !pending && setOpen(nextOpen)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>登记 GB28181 设备</DialogTitle>
            <DialogDescription>
              输入摄像机标签上的 SN。登记后先配置设备，联网后再分配到项目。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field>
              <FieldLabel htmlFor="tenant-device-hardware-serial">设备 SN</FieldLabel>
              <Input
                id="tenant-device-hardware-serial"
                value={hardwareSerial}
                autoFocus
                maxLength={160}
                disabled={pending}
                placeholder="例如：DS-2CD3T47-ABC123"
                onChange={(event) => setHardwareSerial(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && submit()}
              />
              <FieldDescription>请按机身或包装标签原样填写，用于唯一识别这台设备。</FieldDescription>
            </Field>
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Settings2 className="size-4" />
                    高级设置
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <Field>
                  <FieldLabel htmlFor="tenant-device-type">设备类型</FieldLabel>
                  <FormSelect
                    id="tenant-device-type"
                    value={deviceType}
                    disabled={pending}
                    options={[
                      { value: "2", label: "IPC 摄像机" },
                      { value: "3", label: "NVR 主设备" },
                    ]}
                    onChange={setDeviceType}
                  />
                </Field>
              </CollapsibleContent>
            </Collapsible>
            {error ? <StatusAlert>{error}</StatusAlert> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={pending || !hardwareSerial.trim()} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              生成接入信息
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {result ? (
        <DeviceSecretDialog
          title="设备登记完成"
          description="把以下参数填写到这台摄像机的 GB28181 配置页面并保存。"
          device={result.device}
          sipServer={result.sip_server}
          onClose={() => setResult(null)}
        />
      ) : null}
    </>
  );
}
