"use client";

import { useState, useTransition } from "react";
import { Eye, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CameraRecord, TenantDeviceAsset, TencentSipServerConfig } from "@/components/cameras/camera-types";
import type { PlayParams } from "@/components/cameras/camera-mutation-types";
import { PlayPreviewDialog } from "@/components/cameras/camera-play-preview-dialog";
import { assetDisplayName, getDevicePreviewDisabledReason } from "@/components/cameras/tenant-device-asset-utils";
import { DeviceSecretDialog, type TencentDeviceSecretResult } from "@/components/cameras/tencent-device-secret-dialog";
import { Button } from "@/components/ui/button";
import { requestBackendJson } from "@/lib/backend-client";

type AccessInfo = {
  device: TencentDeviceSecretResult;
  sip_server: TencentSipServerConfig | null;
};

function cameraFromAsset(asset: TenantDeviceAsset): CameraRecord {
  return {
    id: asset.id,
    vendor: asset.vendor,
    name: asset.hardware_serial || assetDisplayName(asset),
    position: null,
    status: asset.status,
    can_view: true,
    can_control: false,
    capabilities: ["live"],
    cover_url: null,
    sort_order: 0,
    video_encrypted: false,
    play_protocol: "hls",
  };
}

export function TenantDevicePreviewAction({ asset }: { asset: TenantDeviceAsset }) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<PlayParams | null>(null);
  const disabledReason = getDevicePreviewDisabledReason(asset);

  function preview() {
    if (pending || disabledReason) return;
    startTransition(async () => {
      try {
        setData(await requestBackendJson<PlayParams>(`/tenant-devices/${asset.id}/play-params`, {
          method: "POST",
        }));
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : "设备预览失败");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || Boolean(disabledReason)}
        title={disabledReason || "预览实时画面"}
        onClick={preview}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
        预览
      </Button>
      {data ? (
        <PlayPreviewDialog
          camera={cameraFromAsset(asset)}
          data={data}
          pending={pending}
          onClose={() => setData(null)}
          onRefresh={preview}
        />
      ) : null}
    </>
  );
}

export function TenantDeviceAccessAction({ asset }: { asset: TenantDeviceAsset }) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<AccessInfo | null>(null);

  function load() {
    if (pending) return;
    startTransition(async () => {
      try {
        setData(await requestBackendJson<AccessInfo>(`/tenant-devices/${asset.id}/tencent-access`));
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : "接入信息读取失败");
      }
    });
  }

  if (asset.vendor !== "tencent_iotvideo_industry") return null;

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={load}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Info data-icon="inline-start" />}
        接入信息
      </Button>
      {data ? (
        <DeviceSecretDialog
          title={`${asset.hardware_serial || assetDisplayName(asset)} 接入信息`}
          description="现场设备重新配置 GB28181 时使用。"
          device={data.device}
          sipServer={data.sip_server}
          onClose={() => setData(null)}
        />
      ) : null}
    </>
  );
}
