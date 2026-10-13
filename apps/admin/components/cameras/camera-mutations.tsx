"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Edit3, Loader2, MoreHorizontal, Plus, Unlink, Video } from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import type { CameraDeviceChannel, CameraProjectOption, CameraRecord } from "@/components/cameras/camera-types";
import type { PlayParams } from "@/components/cameras/camera-mutation-types";
import { CameraDialog } from "@/components/cameras/camera-form-dialog";
import { PlayPreviewDialog } from "@/components/cameras/camera-play-preview-dialog";
import { requestCamera } from "@/components/cameras/camera-mutation-shared";

export function CreateCameraButton({
  projectId,
  project,
  devices = [],
  label = "添加摄像头",
}: {
  projectId: string;
  project?: CameraProjectOption;
  devices?: CameraDeviceChannel[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        {label}
      </Button>
      <CameraDialog
        mode="create"
        project={project}
        advanced
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
  devices: CameraDeviceChannel[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [playParams, setPlayParams] = useState<PlayParams | null>(null);

  const previewDisabledReason = camera.status === "offline" && camera.status_source !== "persisted"
    ? "设备离线，暂时无法预览直播，请待设备上线后重试。"
    : "";

  function showPreview() {
    if (previewDisabledReason) return;
    startTransition(async () => {
      try {
        const data = await requestCamera({
          path: `/projects/${projectId}/cameras/${camera.id}/play-params`,
          method: "POST",
          payload: { stream: "live" },
        });
        setPlayParams(data as PlayParams);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "播放参数获取失败");
      }
    });
  }

  function deleteCamera() {
    startTransition(async () => {
      try {
        await requestCamera({
          path: `/projects/${projectId}/cameras/${camera.id}`,
          method: "DELETE",
        });
        setDeleteOpen(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "解绑失败");
      }
    });
  }

  return (
    <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
      <span title={previewDisabledReason || undefined}>
        <Button type="button" variant="ghost" size="sm" title={previewDisabledReason || undefined} disabled={pending || Boolean(previewDisabledReason)} onClick={showPreview}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Video data-icon="inline-start" />}
          预览
        </Button>
      </span>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setEditOpen(true)}>
        <Edit3 data-icon="inline-start" />
        编辑
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" disabled={pending} aria-label="更多摄像头操作">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={pending} onSelect={() => setDeleteOpen(true)}>
              <Unlink />
              解绑
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <CameraDialog
        mode="edit"
        projectId={projectId}
        camera={camera}
        devices={devices}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {playParams ? (
        <PlayPreviewDialog
          camera={camera}
          data={playParams}
          pending={pending}
          onClose={() => setPlayParams(null)}
          onRefresh={showPreview}
        />
      ) : null}
      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="解绑摄像头"
        description={`确认解除「${camera.name}」与当前项目的绑定？设备资产不会删除，解绑后可重新绑定到其他项目。`}
        confirmLabel="确认解绑"
        destructive
        pending={pending}
        onConfirm={deleteCamera}
      />
    </div>
  );
}
