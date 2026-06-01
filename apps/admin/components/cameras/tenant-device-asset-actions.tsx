"use client";

import { type FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { TenantDeviceAsset } from "@/components/cameras/camera-types";
import { assetDisplayName } from "@/components/cameras/tenant-device-asset-utils";
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
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

async function requestBackend<T>(path: string, init?: RequestInit) {
  return requestBackendJson<T>(path, init);
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
        refreshAfterDialogClose(router);
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
        refreshAfterDialogClose(router);
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

export function TenantDeviceRowActions({ asset }: { asset: TenantDeviceAsset }) {
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

export function SyncTenantDevicesButton() {
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
