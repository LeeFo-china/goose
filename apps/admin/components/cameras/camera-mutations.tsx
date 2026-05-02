"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import {
  Edit3,
  Eye,
  Loader2,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  CameraRecord,
  EzvizDeviceChannel,
} from "@/components/cameras/camera-types";

type CameraMode = "create" | "edit";

type PlayParams = {
  camera?: {
    id: string;
    name: string;
    status: string;
    can_control: boolean;
    capabilities: string[];
  };
  player?: {
    provider: string;
    plugin_version: string;
    access_token: string;
    play_url: string;
    expires_at: string;
  };
};

const CAMERA_CAPABILITY_VALUES = [
  "live",
  "ptz",
  "zoom",
  "talk",
  "playback",
] as const;

const CameraFormSchema = z.object({
  name: z.string().trim().min(1, "请输入摄像头名称").max(80, "摄像头名称过长"),
  position: z.string().max(80, "位置过长"),
  device_key: z.string(),
  can_view: z.enum(["true", "false"]),
  can_control: z.enum(["true", "false"]),
  capabilities: z.array(z.enum(CAMERA_CAPABILITY_VALUES)).min(1, "至少选择一个能力"),
  cover_url: z.string().trim().refine((value) => {
    if (!value) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, "封面地址格式不正确"),
  sort_order: z.string().refine((value) => {
    const amount = Number(value || 0);
    return Number.isInteger(amount) && amount >= 0 && amount <= 999999;
  }, "排序值必须是 0 到 999999 的整数"),
  remark: z.string().max(500, "备注过长"),
  video_encrypted: z.enum(["true", "false"]),
});

type CameraFormValues = z.infer<typeof CameraFormSchema>;

const capabilityOptions = [
  ["live", "直播"],
  ["ptz", "云台"],
  ["zoom", "变焦"],
  ["talk", "对讲"],
  ["playback", "回放"],
] as const;

const boolOptions = [
  ["true", "是"],
  ["false", "否"],
] as const;

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestCamera(input: {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  payload?: unknown;
}) {
  const response = await fetch(`/api/backend${input.path}`, {
    method: input.method || "GET",
    headers: input.payload ? { "content-type": "application/json" } : undefined,
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }
  return payload.data;
}

function buildDeviceKey(device: EzvizDeviceChannel) {
  return `${device.device_serial}::${device.channel_no}`;
}

function parseDeviceKey(value: string) {
  const [deviceSerial, channelNo] = value.split("::");
  return {
    deviceSerial: deviceSerial || "",
    channelNo: Number(channelNo || 1),
  };
}

function formatDeviceLabel(device: EzvizDeviceChannel) {
  const name = [device.device_name, device.channel_name].filter(Boolean).join(" / ");
  return `${name || device.device_serial} · ${device.device_serial} · 通道 ${device.channel_no}`;
}

function buildDefaults(camera?: CameraRecord): CameraFormValues {
  return {
    name: camera?.name || "",
    position: camera?.position || "",
    device_key: "",
    can_view: camera?.can_view === false ? "false" : "true",
    can_control: camera?.can_control ? "true" : "false",
    capabilities: camera?.capabilities?.length
      ? camera.capabilities.filter((item): item is CameraFormValues["capabilities"][number] =>
        CAMERA_CAPABILITY_VALUES.includes(item as CameraFormValues["capabilities"][number])
      )
      : ["live"],
    cover_url: camera?.cover_url || "",
    sort_order: camera?.sort_order != null ? String(camera.sort_order) : "0",
    remark: "",
    video_encrypted: camera?.video_encrypted ? "true" : "false",
  };
}

function toBoolean(value: "true" | "false") {
  return value === "true";
}

function CameraDialog({
  mode,
  projectId,
  camera,
  devices,
  open,
  onOpenChange,
}: {
  mode: CameraMode;
  projectId: string;
  camera?: CameraRecord;
  devices: EzvizDeviceChannel[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const defaults = useMemo(() => buildDefaults(camera), [camera]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const availableDevices = useMemo(() => devices.filter((device) => device.can_bind), [devices]);
  const form = useForm<CameraFormValues>({
    resolver: zodResolver(CameraFormSchema as never) as Resolver<CameraFormValues>,
    defaultValues: defaults,
  });
  const selectedCapabilities = form.watch("capabilities");

  useEffect(() => {
    if (open) {
      form.reset({
        ...defaults,
        device_key: availableDevices[0] ? buildDeviceKey(availableDevices[0]) : "",
      });
      setError("");
    }
  }, [availableDevices, defaults, form, open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function toggleCapability(capability: CameraFormValues["capabilities"][number]) {
    const current = form.getValues("capabilities");
    const next = current.includes(capability)
      ? current.filter((item) => item !== capability)
      : [...current, capability];
    form.setValue("capabilities", next.length ? next : ["live"], {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function submit(values: CameraFormValues) {
    setError("");
    if (mode === "create" && !values.device_key) {
      setError("请选择一个未绑定的萤石设备通道");
      return;
    }

    startTransition(async () => {
      try {
        const commonPayload = {
          name: values.name.trim(),
          position: values.position.trim() || null,
          can_view: toBoolean(values.can_view),
          can_control: toBoolean(values.can_control),
          capabilities: values.capabilities,
          cover_url: values.cover_url.trim() || null,
          sort_order: Number(values.sort_order || 0),
          remark: values.remark.trim() || null,
          video_encrypted: toBoolean(values.video_encrypted),
        };

        if (mode === "create") {
          const device = parseDeviceKey(values.device_key);
          await requestCamera({
            path: `/projects/${projectId}/cameras`,
            method: "POST",
            payload: {
              ...commonPayload,
              vendor: "ezviz",
              vendor_device_serial: device.deviceSerial,
              channel_no: device.channelNo,
            },
          });
        } else if (camera) {
          await requestCamera({
            path: `/projects/${projectId}/cameras/${camera.id}`,
            method: "PATCH",
            payload: commonPayload,
          });
        }

        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-[760px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "绑定摄像头" : "编辑摄像头"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "从未绑定的萤石设备通道中选择，并维护展示名称、权限和播放配置。"
              : "设备序列号和通道号绑定后不可修改，避免误切换到其他项目。"}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {mode === "create" ? (
              <Controller
                name="device_key"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="camera-device">萤石设备通道</FieldLabel>
                    <FormSelect
                      id="camera-device"
                      value={field.value}
                      disabled={pending || availableDevices.length === 0}
                      invalid={fieldState.invalid}
                      placeholder={availableDevices.length ? "请选择设备通道" : "暂无未绑定设备"}
                      options={availableDevices.map((device) => ({
                        value: buildDeviceKey(device),
                        label: formatDeviceLabel(device),
                      }))}
                      onChange={field.onChange}
                    />
                    <FieldDescription>
                      只展示当前未绑定到任何项目的设备通道。
                    </FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            ) : null}
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="camera-name">摄像头名称</FieldLabel>
                  <Input
                    {...field}
                    id="camera-name"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    placeholder="例如：客厅施工位"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="position"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="camera-position">安装位置</FieldLabel>
                  <Input
                    {...field}
                    id="camera-position"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    placeholder="例如：客厅 / 阳台"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="can_view"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="camera-can-view">客户可查看</FieldLabel>
                  <FormSelect
                    id="camera-can-view"
                    value={field.value}
                    disabled={pending}
                    invalid={fieldState.invalid}
                    options={boolOptions.map(([value, label]) => ({ value, label }))}
                    onChange={field.onChange}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="can_control"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="camera-can-control">允许控制</FieldLabel>
                  <FormSelect
                    id="camera-can-control"
                    value={field.value}
                    disabled={pending}
                    invalid={fieldState.invalid}
                    options={boolOptions.map(([value, label]) => ({ value, label }))}
                    onChange={field.onChange}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Field className="md:col-span-2">
              <FieldLabel>摄像头能力</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {capabilityOptions.map(([value, label]) => (
                  <label
                    key={value}
                    className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCapabilities.includes(value)}
                      disabled={pending}
                      onChange={() => toggleCapability(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <FieldError errors={[form.formState.errors.capabilities]} />
            </Field>
            <Controller
              name="video_encrypted"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="camera-video-encrypted">视频加密</FieldLabel>
                  <FormSelect
                    id="camera-video-encrypted"
                    value={field.value}
                    disabled={pending}
                    invalid={fieldState.invalid}
                    options={boolOptions.map(([value, label]) => ({ value, label }))}
                    onChange={field.onChange}
                  />
                  <FieldDescription>开启加密时，客户播放会被后端拒绝。</FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="sort_order"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="camera-sort-order">排序</FieldLabel>
                  <Input
                    {...field}
                    id="camera-sort-order"
                    type="number"
                    min="0"
                    max="999999"
                    step="1"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="cover_url"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="camera-cover-url">封面地址</FieldLabel>
                  <Input
                    {...field}
                    id="camera-cover-url"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    placeholder="可选，https://..."
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="remark"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="camera-remark">备注</FieldLabel>
                  <Textarea
                    {...field}
                    id="camera-remark"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    placeholder="内部备注，客户侧不展示"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              取消
            </Button>
            <Button type="submit" disabled={pending || (mode === "create" && availableDevices.length === 0)}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {mode === "create" ? "绑定摄像头" : "保存修改"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlayParamsDialog({
  camera,
  data,
  onClose,
}: {
  camera: CameraRecord;
  data: PlayParams;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{camera.name} 播放参数</DialogTitle>
          <DialogDescription>
            前端播放器使用 `player.play_url` 和 `player.access_token` 初始化 EZPlayer。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <InfoItem label="播放器" value={`${data.player?.provider || "-"} ${data.player?.plugin_version || ""}`} />
          <InfoItem label="过期时间" value={formatDateTime(data.player?.expires_at)} />
          <InfoItem label="播放地址" value={data.player?.play_url || "-"} wrap />
          <InfoItem label="访问令牌" value={data.player?.access_token || "-"} wrap />
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoItem({
  label,
  value,
  wrap,
}: {
  label: string;
  value: string;
  wrap?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={wrap ? "mt-1 break-all text-sm font-medium" : "mt-1 truncate text-sm font-medium"}>
        {value}
      </div>
    </div>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CreateCameraButton({
  projectId,
  devices,
}: {
  projectId: string;
  devices: EzvizDeviceChannel[];
}) {
  const [open, setOpen] = useState(false);
  const availableCount = devices.filter((device) => device.can_bind).length;

  return (
    <>
      <Button type="button" disabled={!projectId || availableCount === 0} onClick={() => setOpen(true)}>
        <Plus />
        绑定摄像头
      </Button>
      <CameraDialog
        mode="create"
        projectId={projectId}
        devices={devices}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function CameraRowActions({
  projectId,
  camera,
  devices,
}: {
  projectId: string;
  camera: CameraRecord;
  devices: EzvizDeviceChannel[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [playParams, setPlayParams] = useState<PlayParams | null>(null);

  function showPlayParams() {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestCamera({
          path: `/projects/${projectId}/cameras/${camera.id}/play-params`,
          method: "POST",
          payload: { stream: "live" },
        });
        setPlayParams(data as PlayParams);
      } catch (err) {
        setError(err instanceof Error ? err.message : "播放参数获取失败");
      }
    });
  }

  function deleteCamera() {
    if (!window.confirm(`确认解绑摄像头「${camera.name}」？`)) return;
    setError("");
    startTransition(async () => {
      try {
        await requestCamera({
          path: `/projects/${projectId}/cameras/${camera.id}`,
          method: "DELETE",
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "解绑失败");
      }
    });
  }

  return (
    <div className="flex min-w-[250px] flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={showPlayParams}>
        {pending ? <Loader2 className="animate-spin" /> : <Video />}
        播放
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditOpen(true)}>
        <Edit3 />
        编辑
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={deleteCamera}>
        <Trash2 />
        解绑
      </Button>
      <CameraDialog
        mode="edit"
        projectId={projectId}
        camera={camera}
        devices={devices}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {playParams ? (
        <PlayParamsDialog
          camera={camera}
          data={playParams}
          onClose={() => setPlayParams(null)}
        />
      ) : null}
      {error ? (
        <div className="absolute right-5 mt-10 max-w-[360px] rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
