"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { CreateTencentDeviceButton } from "@/components/cameras/tencent-device-actions";
import type { TenantDeviceAsset } from "@/components/cameras/camera-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = {
  online: { label: "在线", variant: "success" },
  offline: { label: "离线", variant: "danger" },
  unknown: { label: "未知", variant: "secondary" },
};

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestBackend<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api/backend${path}`, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }

  return payload.data as T;
}

function vendorLabel(vendor: string) {
  if (vendor === "tencent_iotvideo_industry") return "腾讯云";
  if (vendor === "ezviz") return "萤石";
  return vendor || "未知厂商";
}

function renderStatus(status: string) {
  const meta = statusMeta[status] || {
    label: status || "未知",
    variant: "outline" as const,
  };

  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function compactIdentifier(value: string | null | undefined) {
  if (!value) return "-";
  if (value.length <= 20) return value;
  return `${value.slice(0, 9)}...${value.slice(-7)}`;
}

function assetDisplayName(asset: TenantDeviceAsset) {
  return (
    asset.vendor_channel_name ||
    asset.vendor_device_name ||
    asset.vendor_channel_code ||
    asset.vendor_device_code ||
    compactIdentifier(asset.vendor_channel_id || asset.vendor_device_serial)
  );
}

function EditDeviceDialog({
  asset,
  open,
  onOpenChange,
}: {
  asset: TenantDeviceAsset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const defaults = useMemo(() => ({
    vendor_device_name: asset.vendor_device_name || "",
    vendor_channel_name: asset.vendor_channel_name || "",
    device_type: asset.device_type || "",
  }), [asset]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const vendorDeviceName = String(formData.get("vendor_device_name") || "").trim();
    const vendorChannelName = String(formData.get("vendor_channel_name") || "").trim();
    const deviceType = String(formData.get("device_type") || "").trim();

    setError("");
    startTransition(async () => {
      try {
        await requestBackend(`/tenant-devices/${asset.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            vendor_device_name: vendorDeviceName || null,
            vendor_channel_name: vendorChannelName || null,
            device_type: deviceType || null,
          }),
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存设备资产失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>编辑设备资产</DialogTitle>
          <DialogDescription>
            只修改本地展示信息，不会修改第三方平台设备。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`device-${asset.id}-name`}>设备名称</FieldLabel>
              <Input
                id={`device-${asset.id}-name`}
                name="vendor_device_name"
                defaultValue={defaults.vendor_device_name}
                placeholder="例如 工地入口 IPC"
                maxLength={100}
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`device-${asset.id}-channel-name`}>通道名称</FieldLabel>
              <Input
                id={`device-${asset.id}-channel-name`}
                name="vendor_channel_name"
                defaultValue={defaults.vendor_channel_name}
                placeholder="例如 入口通道"
                maxLength={100}
                disabled={pending}
              />
              <FieldDescription>腾讯云通道资产建议填写，设备级资产可留空。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`device-${asset.id}-type`}>设备类型</FieldLabel>
              <Input
                id={`device-${asset.id}-type`}
                name="device_type"
                defaultValue={defaults.device_type}
                placeholder="例如 IPC / NVR"
                maxLength={50}
                disabled={pending}
              />
            </Field>
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDeviceButton({ asset }: { asset: TenantDeviceAsset }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const bound = Boolean(asset.bound_camera_id || asset.bound_project_id);

  function deleteAsset() {
    if (bound || pending) return;
    setError("");
    startTransition(async () => {
      try {
        await requestBackend(`/tenant-devices/${asset.id}`, {
          method: "DELETE",
        });
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除设备资产失败");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={(nextOpen) => !pending && setOpen(nextOpen)}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={bound || pending}
            title={bound ? "已绑定项目，请先解绑项目摄像头" : "删除设备资产"}
          >
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Trash2 data-icon="inline-start" />
            )}
            删除
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除设备资产</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除「{assetDisplayName(asset)}」？删除后不会删除第三方云端设备，但需要重新纳入资产池后才能绑定项目。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                deleteAsset();
              }}
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {bound ? (
        <span className="text-xs text-muted-foreground">需先解绑</span>
      ) : null}
      {error ? <span className="max-w-[180px] text-right text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

function RowActions({ asset }: { asset: TenantDeviceAsset }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setEditOpen(true)}
      >
        <Pencil data-icon="inline-start" />
        编辑
      </Button>
      <DeleteDeviceButton asset={asset} />
      <EditDeviceDialog asset={asset} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

function SyncTenantDevicesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function syncDevices() {
    if (pending) return;
    setError("");
    startTransition(async () => {
      try {
        await requestBackend("/tenant-devices/sync", {
          method: "POST",
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "同步设备资产失败");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={syncDevices}>
        {pending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <RefreshCw data-icon="inline-start" />
        )}
        同步资产
      </Button>
      {error ? <span className="max-w-[220px] text-right text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

export function TenantDeviceAssetsPanel({
  assets,
  error,
  projectId,
}: {
  assets: TenantDeviceAsset[];
  error?: string | null;
  projectId?: string | null;
}) {
  const unboundCount = assets.filter((asset) => !asset.bound_camera_id).length;
  const onlineCount = assets.filter((asset) => asset.status === "online").length;

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex flex-col justify-between gap-3 border-b bg-muted/30 p-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-base font-semibold">设备资产池</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            统一管理当前租户设备资产，新增设备后同步通道，再绑定到项目摄像头。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">共 {assets.length} 个</Badge>
          <Badge variant="secondary">未绑定 {unboundCount}</Badge>
          <Badge variant="success">在线 {onlineCount}</Badge>
          {projectId ? (
            <CreateTencentDeviceButton
              projectId={projectId}
              sipServer={null}
            />
          ) : null}
          <SyncTenantDevicesButton />
        </div>
      </div>
      {error ? (
        <div className="p-4">
          <StatusAlert tone="warning">{error}</StatusAlert>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>设备资产</TableHead>
            <TableHead>厂商</TableHead>
            <TableHead>设备 / 通道 ID</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>绑定</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => (
            <TableRow key={asset.id}>
              <TableCell>
                <div className="min-w-0">
                  <div className="truncate font-medium">{assetDisplayName(asset)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {asset.device_type || "未标注类型"}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{vendorLabel(asset.vendor)}</Badge>
              </TableCell>
              <TableCell>
                <div className="min-w-0 text-xs text-muted-foreground">
                  <div className="truncate">设备 {compactIdentifier(asset.vendor_device_serial)}</div>
                  <div className="truncate">通道 {compactIdentifier(asset.vendor_channel_id)}</div>
                </div>
              </TableCell>
              <TableCell>{renderStatus(asset.status)}</TableCell>
              <TableCell>
                {asset.bound_camera_id ? (
                  <Badge variant="success">已绑定</Badge>
                ) : (
                  <Badge variant="secondary">未绑定</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <RowActions asset={asset} />
              </TableCell>
            </TableRow>
          ))}
          {!assets.length ? (
            <TableRow>
              <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                暂无租户设备资产
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
