import { Badge } from "@/components/ui/badge";
import type { TenantDeviceAsset } from "@/components/cameras/camera-types";

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = {
  online: { label: "在线", variant: "success" },
  offline: { label: "离线", variant: "danger" },
  unknown: { label: "未知", variant: "secondary" },
};

export function vendorLabel(vendor: string) {
  if (vendor === "tencent_iotvideo_industry") return "腾讯云";
  if (vendor === "ezviz") return "萤石";
  return vendor || "未知厂商";
}

export function renderStatus(status: string) {
  const meta = statusMeta[status] || {
    label: status || "未知",
    variant: "outline" as const,
  };

  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function compactIdentifier(value: string | null | undefined) {
  if (!value) return "-";
  if (value.length <= 20) return value;
  return `${value.slice(0, 9)}...${value.slice(-7)}`;
}

export function assetDisplayName(asset: TenantDeviceAsset) {
  return (
    asset.vendor_channel_name ||
    asset.vendor_device_name ||
    asset.vendor_channel_code ||
    asset.vendor_device_code ||
    compactIdentifier(asset.vendor_channel_id || asset.vendor_device_serial)
  );
}
