"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, KeyRound, Loader2, MoreHorizontal, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  PlatformDeviceRecord,
  PlatformDeviceSyncResult,
  PlatformTencentDeviceAccessInfo,
  PlatformTencentDevicePasswordResult,
} from "@/components/platform-devices/platform-device-types";

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

function SecretItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value || "-"}</div>
    </div>
  );
}

function DeviceInfoDialog({
  title,
  description,
  children,
  open,
  onOpenChange,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlatformDeviceActions({ device }: { device: PlatformDeviceRecord }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [accessInfo, setAccessInfo] = useState<PlatformTencentDeviceAccessInfo | null>(null);
  const [passwordInfo, setPasswordInfo] = useState<PlatformTencentDevicePasswordResult | null>(null);
  const isTencent = device.vendor === "tencent_iotvideo_industry";

  function syncDevice() {
    if (pending) return;
    startTransition(async () => {
      try {
        const result = await requestBackend<PlatformDeviceSyncResult>(
          `/platform/tenant-devices/${device.id}/sync`,
          { method: "POST" },
        );
        toast.success(`同步完成，新增 ${result.created_count}，更新 ${result.updated_count}`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "同步设备资产失败");
      }
    });
  }

  function openAccessInfo() {
    if (pending || !isTencent) return;
    startTransition(async () => {
      try {
        const result = await requestBackend<PlatformTencentDeviceAccessInfo>(
          `/platform/tenant-devices/${device.id}/tencent-access`,
        );
        setAccessInfo(result);
        setAccessOpen(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "获取接入信息失败");
      }
    });
  }

  function queryPassword() {
    if (pending || !isTencent) return;
    startTransition(async () => {
      try {
        const result = await requestBackend<PlatformTencentDevicePasswordResult>(
          `/platform/tenant-devices/${device.id}/tencent-password`,
        );
        setPasswordInfo(result);
        setPasswordOpen(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "查询设备密码失败");
      }
    });
  }

  function resetPassword() {
    if (pending || !isTencent) return;
    startTransition(async () => {
      try {
        const result = await requestBackend<PlatformTencentDevicePasswordResult>(
          `/platform/tenant-devices/${device.id}/tencent-password`,
          { method: "POST" },
        );
        setResetOpen(false);
        setPasswordInfo(result);
        setPasswordOpen(true);
        toast.success("设备密码已重置");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "重置设备密码失败");
      }
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <MoreHorizontal data-icon="inline-start" />
              )}
              操作
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="left" sideOffset={8} className="w-40">
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={pending} onSelect={syncDevice}>
                <RefreshCw />
                同步
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {isTencent ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled={pending} onSelect={openAccessInfo}>
                    <Eye />
                    接入信息
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={pending} onSelect={queryPassword}>
                    <KeyRound />
                    查密码
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={pending}
                    onSelect={(event) => {
                      event.preventDefault();
                      setResetOpen(true);
                    }}
                  >
                    <RefreshCw />
                    重置密码
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={(open) => !pending && setResetOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置设备密码</AlertDialogTitle>
            <AlertDialogDescription>
              将为「{device.vendor_device_name || device.vendor_device_serial}」生成新的 SIP 密码。现场设备需要同步更新后才能继续注册上线。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                resetPassword();
              }}
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              确认重置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeviceInfoDialog
        open={accessOpen}
        onOpenChange={setAccessOpen}
        title="设备接入信息"
        description="平台可查看当前腾讯云设备的接入参数和归属，用于排障。"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <SecretItem label="设备名称" value={accessInfo?.device.device_name} />
          <SecretItem label="设备类型" value={accessInfo?.device.device_type_label} />
          <SecretItem label="设备 ID" value={accessInfo?.device.device_id} />
          <SecretItem label="设备编码" value={accessInfo?.device.device_code} />
          <SecretItem label="通道 ID" value={accessInfo?.device.channel_id} />
          <SecretItem label="通道名称" value={accessInfo?.device.channel_name} />
          <SecretItem label="SIP 用户名" value={accessInfo?.device.sip_username} />
          <SecretItem label="SIP 协议" value={accessInfo?.device.sip_transport_protocol} />
          <SecretItem label="SIP 服务器 ID" value={accessInfo?.sip_server?.sip_server_id} />
          <SecretItem label="SIP 域" value={accessInfo?.sip_server?.sip_domain} />
          <SecretItem label="SIP 地址" value={accessInfo?.sip_server?.sip_host} />
          <SecretItem label="SIP 端口" value={accessInfo?.sip_server?.sip_port} />
        </div>
      </DeviceInfoDialog>

      <DeviceInfoDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        title="设备密码"
        description="以下密码仅用于现场设备本地注册配置，操作已记录平台审计日志。"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <SecretItem label="设备名称" value={passwordInfo?.device_name} />
          <SecretItem label="设备 ID" value={passwordInfo?.device_id} />
          <SecretItem label="SIP 用户名" value={passwordInfo?.sip_username} />
          <SecretItem label="SIP 密码" value={passwordInfo?.sip_password} />
          <SecretItem label="协议" value={passwordInfo?.sip_transport_protocol} />
          <SecretItem label="请求 ID" value={passwordInfo?.request_id} />
        </div>
      </DeviceInfoDialog>
    </>
  );
}
