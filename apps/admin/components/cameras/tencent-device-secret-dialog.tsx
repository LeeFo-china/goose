"use client";

import { CopyValueButton } from "@/components/admin/copy-value-button";
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
import type { TencentSipServerConfig } from "@/components/cameras/camera-types";

export type TencentDeviceSecretResult = {
  device_id?: string | null;
  device_code?: string | null;
  device_name?: string | null;
  original_device_name?: string | null;
  name_adjusted?: boolean | null;
  device_type_label?: string | null;
  sip_username?: string | null;
  sip_password?: string | null;
  sip_transport_protocol?: string | null;
  request_id?: string | null;
  virtual_group_id?: string | null;
};

export type TencentPasswordResult = TencentDeviceSecretResult & {
  status?: string | null;
};

function SecretItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{value || "-"}</div>
      </div>
      <CopyValueButton value={value} />
    </div>
  );
}

export function DeviceSecretDialog({
  title,
  description,
  device,
  sipServer,
  onClose,
}: {
  title: string;
  description: string;
  device: TencentDeviceSecretResult;
  sipServer?: TencentSipServerConfig | null;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <SecretItem label="设备名称" value={device.device_name} />
          {device.name_adjusted ? (
            <SecretItem label="原始名称" value={device.original_device_name} />
          ) : null}
          <SecretItem label="设备类型" value={device.device_type_label} />
          <SecretItem label="SIP用户名" value={device.sip_username || device.device_code} />
          <SecretItem label="SIP认证密码" value={device.sip_password} />
          <SecretItem label="SIP传输协议" value={device.sip_transport_protocol || "TCP"} />
          <SecretItem label="设备ID" value={device.device_id} />
          {sipServer ? (
            <>
              <SecretItem label="SIP服务器ID" value={sipServer.sip_server_id} />
              <SecretItem label="SIP服务器域" value={sipServer.sip_domain} />
              <SecretItem label="SIP服务器地址" value={sipServer.sip_host} />
              <SecretItem label="SIP服务器端口" value={sipServer.sip_port} />
            </>
          ) : null}
        </div>
        {device.name_adjusted ? (
          <StatusAlert tone="warning">
            云端已存在同名设备，系统已自动追加短后缀生成新设备名称。
          </StatusAlert>
        ) : null}
        <StatusAlert tone="warning">
          SIP认证密码属于敏感信息。复制后请只发给现场安装人员，并在设备本地配置同步后再验证上线状态。
        </StatusAlert>
        <DialogFooter>
          <Button type="button" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
