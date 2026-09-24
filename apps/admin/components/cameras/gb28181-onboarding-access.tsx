import { CopyValueButton } from "@/components/admin/copy-value-button";
import type { TencentSipServerConfig } from "@/components/cameras/camera-types";
import type { TencentDeviceSecretResult } from "@/components/cameras/tencent-device-secret-dialog";

function AccessValue({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-1 break-all text-sm font-medium">{value || "-"}</div>
      </div>
      <CopyValueButton value={value} />
    </div>
  );
}

export function Gb28181AccessDetails({
  device,
  sipServer,
}: {
  device: TencentDeviceSecretResult;
  sipServer: TencentSipServerConfig | null;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md border bg-background px-4">
      <AccessValue label="SIP服务器地址" value={sipServer?.sip_host} />
      <AccessValue label="SIP服务器端口" value={sipServer?.sip_port} />
      <AccessValue label="SIP服务器ID" value={sipServer?.sip_server_id} />
      <AccessValue label="SIP服务器域" value={sipServer?.sip_domain} />
      <AccessValue
        label="设备ID / 用户名"
        value={device.sip_username || device.device_code || device.device_id}
      />
      <AccessValue label="视频通道编码" value={device.video_channel_code} />
      <AccessValue label="认证密码" value={device.sip_password} />
      <AccessValue
        label="传输协议"
        value={device.sip_transport_protocol || sipServer?.transport_protocol || "TCP"}
      />
    </div>
  );
}
