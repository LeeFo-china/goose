"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { CopyValueButton } from "@/components/admin/copy-value-button";
import {
  TencentDevicePasswordActions,
  TencentSipAccessButton,
} from "@/components/cameras/tencent-device-actions";
import { ImportTenantDeviceButton } from "@/components/cameras/tenant-device-import-actions";
import type {
  TencentDeviceChannel,
  TencentDeviceRecord,
  TencentSipServerConfig,
} from "@/components/cameras/camera-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = {
  online: { label: "在线", variant: "success" },
  offline: { label: "离线", variant: "danger" },
  unknown: { label: "未知", variant: "secondary" },
};

function renderStatus(status: string) {
  const meta = statusMeta[status] || {
    label: status || "未知",
    variant: "outline" as const,
  };

  return <Badge className="whitespace-nowrap" variant={meta.variant}>{meta.label}</Badge>;
}

function compactIdentifier(value: string | null | undefined) {
  if (!value) return "-";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function tencentDeviceRecordName(device: TencentDeviceRecord) {
  return device.device_name || device.device_code || compactIdentifier(device.device_id);
}

function tencentChannelName(device: TencentDeviceChannel) {
  return device.channel_name || device.channel_code || compactIdentifier(device.channel_id);
}

function BindingState({ channel }: { channel: TencentDeviceChannel }) {
  if (!channel.is_bound) return <Badge variant="outline">可绑定</Badge>;

  return (
    <div className="flex flex-col gap-1">
      <Badge
        className="w-fit"
        variant={channel.is_bound_to_current_project ? "success" : "secondary"}
      >
        <Link2 />
        {channel.is_bound_to_current_project ? "当前项目" : "其他项目"}
      </Badge>
      <div className="text-xs text-muted-foreground">
        {channel.bound_project_name || channel.bound_camera_name || "-"}
      </div>
    </div>
  );
}

function ChannelAssetAction({
  projectId,
  channel,
}: {
  projectId: string;
  channel: TencentDeviceChannel;
}) {
  if (channel.is_bound) return <BindingState channel={channel} />;

  return (
    <div className="flex flex-col items-start gap-2">
      <Badge variant="outline">可纳入</Badge>
      <ImportTenantDeviceButton
        projectId={projectId}
        payload={{
          vendor: "tencent_iotvideo_industry",
          vendor_device_serial: channel.device_id,
          vendor_device_code: channel.device_code,
          vendor_device_name: channel.device_name,
          vendor_channel_id: channel.channel_id,
          vendor_channel_code: channel.channel_code,
          vendor_channel_name: channel.channel_name,
          device_type: channel.device_type_label || null,
          status: channel.status || "unknown",
          metadata: {
            raw_status: channel.raw_status,
            protocol: channel.protocol,
            group_id: channel.group_id,
            group_name: channel.group_name,
          },
        }}
      />
    </div>
  );
}

export function TencentDeviceChannelTree({
  projectId,
  devices,
  channels,
  sipServer,
}: {
  projectId: string;
  devices: TencentDeviceRecord[];
  channels: TencentDeviceChannel[];
  sipServer: TencentSipServerConfig | null;
}) {
  const [expandedDeviceIds, setExpandedDeviceIds] = useState<Set<string>>(new Set());
  const channelsByDevice = useMemo(() => {
    const map = new Map<string, TencentDeviceChannel[]>();
    for (const channel of channels) {
      const next = map.get(channel.device_id) || [];
      next.push(channel);
      map.set(channel.device_id, next);
    }
    return map;
  }, [channels]);

  function toggle(deviceId: string) {
    setExpandedDeviceIds((current) => {
      const next = new Set(current);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  }

  if (!devices.length) {
    return (
      <div className="h-28 px-4 py-6 text-center text-sm text-muted-foreground">
        暂无腾讯云设备。新增设备后如仍未出现，请稍后刷新腾讯云列表。
      </div>
    );
  }

  return (
    <div className="divide-y">
      {devices.map((device) => {
        const deviceChannels = channelsByDevice.get(device.device_id) || [];
        const expanded = expandedDeviceIds.has(device.device_id);

        return (
          <Collapsible
            key={device.device_id}
            open={expanded}
            onOpenChange={() => toggle(device.device_id)}
          >
            <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.7fr)_minmax(190px,0.85fr)_minmax(120px,0.5fr)_minmax(150px,0.65fr)_minmax(220px,0.9fr)] lg:items-center">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto justify-start px-0 text-left"
                >
                  {expanded ? <ChevronDown data-icon="inline-start" /> : <ChevronRight data-icon="inline-start" />}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {tencentDeviceRecordName(device)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {device.device_type_label || "未知设备"} · ID {compactIdentifier(device.device_id)}
                    </span>
                  </span>
                </Button>
              </CollapsibleTrigger>
              <div className="min-w-0">
                <div className="truncate font-medium" title={device.sip_username || device.device_code || ""}>
                  {device.sip_username || device.device_code || "-"}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline">{device.sip_transport_protocol || "TCP"}</Badge>
                  <CopyValueButton value={device.sip_username || device.device_code} />
                </div>
              </div>
              <TencentDevicePasswordActions
                projectId={projectId}
                deviceId={device.device_id}
                deviceName={tencentDeviceRecordName(device)}
                deviceCode={device.device_code}
              />
              <div>{renderStatus(device.status)}</div>
              <div className="min-w-0 text-sm">
                <div className="truncate text-muted-foreground">
                  {device.protocol || "-"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {device.group_name || device.group_id || "未分组"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">通道 {deviceChannels.length}</Badge>
                <TencentSipAccessButton
                  sipServer={sipServer}
                  device={{
                    device_id: device.device_id,
                    device_code: device.device_code,
                    device_name: tencentDeviceRecordName(device),
                    device_type_label: device.device_type_label,
                    sip_username: device.sip_username || device.device_code,
                    sip_password: "通过查密码或重置获取",
                    sip_transport_protocol: device.sip_transport_protocol || "TCP",
                  }}
                />
              </div>
            </div>
            <CollapsibleContent>
              <Separator />
              {deviceChannels.length ? (
                <div className="bg-muted/20">
                  {deviceChannels.map((channel) => (
                    <div
                      key={`${channel.device_id}-${channel.channel_id}`}
                      className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.7fr)_minmax(190px,0.85fr)_minmax(120px,0.5fr)_minmax(150px,0.65fr)_minmax(220px,0.9fr)] lg:items-center"
                    >
                      <div className="min-w-0 pl-8">
                        <div className="truncate font-medium">
                          {tencentChannelName(channel)}
                        </div>
                        <div
                          className="truncate text-xs text-muted-foreground"
                          title={channel.channel_id}
                        >
                          通道ID {compactIdentifier(channel.channel_id)}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">继承设备</div>
                      <div className="text-sm text-muted-foreground">-</div>
                      <div>{renderStatus(channel.status)}</div>
                      <div className="text-sm text-muted-foreground">
                        {channel.protocol || device.protocol || "-"}
                      </div>
                      <ChannelAssetAction projectId={projectId} channel={channel} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-muted/20 px-12 py-4 text-sm text-muted-foreground">
                  暂无通道。请在设备本地配置 SIP 信息，设备上线并上报通道后刷新列表。
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
