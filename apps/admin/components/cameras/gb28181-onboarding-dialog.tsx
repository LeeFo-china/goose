"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plus, RadioTower } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Gb28181AccessDetails } from "@/components/cameras/gb28181-onboarding-access";
import { Gb28181ProjectPicker } from "@/components/cameras/gb28181-project-picker";
import {
  buildGb28181CameraPayload,
  decideGb28181Assets,
  getNextTenantDevicePage,
  type Gb28181ChannelAsset,
} from "@/components/cameras/gb28181-onboarding-rules";
import type {
  CameraProjectOption,
  Pagination,
  TenantDeviceAsset,
  TencentSipServerConfig,
} from "@/components/cameras/camera-types";
import type { TencentDeviceSecretResult } from "@/components/cameras/tencent-device-secret-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestBackendJson } from "@/lib/backend-client";

type OnboardingStep =
  | "project"
  | "name"
  | "resume-loading"
  | "configure"
  | "choose-channel"
  | "success";

type TencentDeviceCreateResult = {
  device: TencentDeviceSecretResult;
  sip_server: TencentSipServerConfig | null;
};

type TenantDevicePage = {
  list: TenantDeviceAsset[];
  pagination?: Pagination;
};

function channelLabel(channel: Gb28181ChannelAsset) {
  return channel.vendor_channel_name
    || channel.vendor_channel_code
    || channel.vendor_channel_id;
}

async function loadDeviceAssets(deviceId: string) {
  const assets: TenantDeviceAsset[] = [];
  let page = 1;

  while (page) {
    const result = await requestBackendJson<TenantDevicePage>(
      `/tenant-devices?page=${page}&pageSize=100`,
    );
    assets.push(...(result.list || []).filter(
      (asset) => asset.vendor_device_serial === deviceId,
    ));
    page = getNextTenantDevicePage(result.pagination) || 0;
  }

  return assets;
}

export function Gb28181OnboardingButton({
  projectId,
  projectLabel,
  initialAsset,
  size = "sm",
}: {
  projectId?: string;
  projectLabel?: string;
  initialAsset?: TenantDeviceAsset;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const fixedProjectId = projectId || initialAsset?.source_project_id || "";
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<OnboardingStep>(fixedProjectId ? "name" : "project");
  const [selectedProjectId, setSelectedProjectId] = useState(fixedProjectId);
  const [selectedProject, setSelectedProject] = useState<CameraProjectOption | null>(null);
  const [name, setName] = useState(initialAsset?.vendor_device_name || "");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<TencentDeviceCreateResult | null>(null);
  const [channels, setChannels] = useState<Gb28181ChannelAsset[]>([]);
  const activeProjectId = fixedProjectId || selectedProjectId;
  const activeProjectLabel = projectLabel
    || selectedProject?.address
    || selectedProject?.name
    || "当前项目";

  function resetForNext() {
    setStep("name");
    setName("");
    setError("");
    setCreated(null);
    setChannels([]);
  }

  function changeOpen(nextOpen: boolean) {
    if (pending) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setSelectedProjectId(fixedProjectId);
      setSelectedProject(null);
      setStep(fixedProjectId ? "name" : "project");
      setName(initialAsset?.vendor_device_name || "");
      setError("");
      setCreated(null);
      setChannels([]);
    }
  }

  function loadInitialAccess() {
    if (!initialAsset || pending) return;
    setError("");
    setStep("resume-loading");
    startTransition(async () => {
      try {
        const result = await requestBackendJson<TencentDeviceCreateResult>(
          `/tenant-devices/${initialAsset.id}/tencent-access`,
        );
        setName(result.device.device_name || initialAsset.vendor_device_name || "摄像头");
        setCreated(result);
        setStep("configure");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "读取接入信息失败");
      }
    });
  }

  function openDialog() {
    if (initialAsset) {
      setStep("resume-loading");
    }
    setOpen(true);
    if (initialAsset) loadInitialAccess();
  }

  function createDevice() {
    const cameraName = name.trim();
    if (!cameraName || pending) return;

    setError("");
    startTransition(async () => {
      try {
        const result = await requestBackendJson<TencentDeviceCreateResult>(
          `/projects/${activeProjectId}/cameras/tencent-devices`,
          {
            method: "POST",
            body: JSON.stringify({
              name: cameraName,
              device_type: 2,
              password: null,
            }),
          },
        );
        setCreated(result);
        setStep("configure");
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "生成接入信息失败");
      }
    });
  }

  async function bindChannel(channel: Gb28181ChannelAsset) {
    if (!created?.device.device_id) return;
    await requestBackendJson(`/projects/${activeProjectId}/cameras`, {
      method: "POST",
      body: JSON.stringify(buildGb28181CameraPayload({
        name,
        deviceId: created.device.device_id,
        channelId: channel.vendor_channel_id,
        deviceCode: channel.vendor_device_code || created.device.device_code,
        channelCode: channel.vendor_channel_code,
      })),
    });
    setStep("success");
    router.refresh();
  }

  function detectAndBind() {
    const deviceId = created?.device.device_id;
    if (!deviceId || pending) return;

    setError("");
    startTransition(async () => {
      try {
        await requestBackendJson("/tenant-devices/sync", { method: "POST" });
        const assets = await loadDeviceAssets(deviceId);
        const decision = decideGb28181Assets(assets, deviceId, activeProjectId);

        if (decision.kind === "already-bound") {
          setStep("success");
          router.refresh();
          return;
        }
        if (decision.kind === "bound-elsewhere") {
          setError("该摄像头已绑定到其他项目，请先在设备管理中核对。");
          return;
        }
        if (decision.kind === "not-found") {
          setError("暂未检测到摄像头，请确认设备已保存 GB28181 配置并联网后重试。");
          return;
        }
        if (decision.kind === "choose") {
          setChannels(decision.channels);
          setStep("choose-channel");
          return;
        }

        await bindChannel(decision.channel);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "检测连接失败，请重试");
      }
    });
  }

  function chooseChannel(channel: Gb28181ChannelAsset) {
    if (pending) return;
    setError("");
    startTransition(async () => {
      try {
        await bindChannel(channel);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "绑定摄像头失败");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={initialAsset ? "outline" : "default"}
        disabled={pending}
        onClick={openDialog}
      >
        <Plus data-icon="inline-start" />
        {initialAsset ? "继续接入" : "接入摄像头"}
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-h-[90vh] max-w-[640px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step === "success" ? "摄像头已接入" : "接入 GB28181 摄像头"}
            </DialogTitle>
            <DialogDescription>
              {step === "name"
                ? `接入到「${activeProjectLabel}」，每台摄像头只需填写一个名称。`
                : step === "project"
                  ? "先选择摄像头所属项目，连续添加时无需重复选择。"
                : step === "resume-loading"
                  ? "正在读取这台摄像头的 GB28181 接入信息。"
                : step === "configure"
                  ? "把以下参数填写到摄像头的 GB28181 配置页面并保存。"
                  : step === "choose-channel"
                    ? "该设备返回了多个通道，请选择要接入当前项目的通道。"
                    : `「${name}」已绑定到「${activeProjectLabel}」。`}
            </DialogDescription>
          </DialogHeader>

          {step === "project" ? (
            <Gb28181ProjectPicker
              disabled={pending}
              selectedProjectId={selectedProjectId}
              onSelect={(project) => {
                setSelectedProject(project);
                setSelectedProjectId(project?.id || "");
              }}
            />
          ) : null}

          {step === "name" ? (
            <Field>
              <FieldLabel htmlFor="gb28181-camera-name">摄像头名称</FieldLabel>
              <Input
                id="gb28181-camera-name"
                value={name}
                maxLength={48}
                autoFocus
                disabled={pending}
                placeholder="例如：客厅、入户门、二楼施工区"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createDevice();
                }}
              />
              <FieldDescription>用位置命名，后续查看监控时更容易识别。</FieldDescription>
            </Field>
          ) : null}

          {step === "configure" && created ? (
            <div className="space-y-4">
              <Gb28181AccessDetails
                device={created.device}
                sipServer={created.sip_server}
              />
              <StatusAlert tone="warning">
                认证密码只提供给现场安装人员。设备保存配置并联网后，再检测连接。
              </StatusAlert>
            </div>
          ) : null}

          {step === "resume-loading" && pending ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在读取接入信息…
            </div>
          ) : null}

          {step === "choose-channel" ? (
            <div className="divide-y rounded-md border">
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={pending}
                  onClick={() => chooseChannel(channel)}
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {channelLabel(channel)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">选择</span>
                </button>
              ))}
            </div>
          ) : null}

          {step === "success" ? (
            <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              <div>
                <div className="text-sm font-medium">接入完成</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  现在可以在项目摄像头列表查看「{name}」。
                </p>
              </div>
            </div>
          ) : null}

          {error ? <StatusAlert>{error}</StatusAlert> : null}

          <DialogFooter>
            {step === "name" ? (
              <>
                <Button type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>
                  取消
                </Button>
                <Button type="button" disabled={pending || !name.trim()} onClick={createDevice}>
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  生成接入信息
                </Button>
              </>
            ) : null}
            {step === "project" ? (
              <>
                <Button type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={!selectedProjectId}
                  onClick={() => setStep("name")}
                >
                  下一步
                </Button>
              </>
            ) : null}
            {step === "resume-loading" ? (
              <>
                <Button type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>
                  取消
                </Button>
                {!pending ? (
                  <Button type="button" onClick={loadInitialAccess}>
                    重新读取
                  </Button>
                ) : null}
              </>
            ) : null}
            {step === "configure" ? (
              <>
                <Button type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>
                  稍后继续
                </Button>
                <Button type="button" disabled={pending} onClick={detectAndBind}>
                  {pending ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <RadioTower data-icon="inline-start" />
                  )}
                  我已配置，检测连接
                </Button>
              </>
            ) : null}
            {step === "choose-channel" ? (
              <Button type="button" variant="outline" disabled={pending} onClick={() => setStep("configure")}>
                返回
              </Button>
            ) : null}
            {step === "success" ? (
              <>
                <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                  完成
                </Button>
                <Button type="button" onClick={resetForNext}>
                  <Plus data-icon="inline-start" />
                  继续添加下一台
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
