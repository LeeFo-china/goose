"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Edit3, Loader2, Plus, Trash2, Video } from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { Button } from "@/components/ui/button";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import type { CameraDeviceChannel, CameraRecord } from "@/components/cameras/camera-types";
import type { PlayParams } from "@/components/cameras/camera-mutation-types";
import { CameraDialog } from "@/components/cameras/camera-form-dialog";
import { PlayPreviewDialog } from "@/components/cameras/camera-play-preview-dialog";
import { requestCamera } from "@/components/cameras/camera-mutation-shared";

export function CreateCameraButton({
  projectId,
  devices,
}: {
  projectId: string;
  devices: CameraDeviceChannel[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
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
  devices: CameraDeviceChannel[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [playParams, setPlayParams] = useState<PlayParams | null>(null);

  function showPreview() {
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
    <div className="flex min-w-[250px] flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={showPreview}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Video data-icon="inline-start" />}
        预览
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditOpen(true)}>
        <Edit3 data-icon="inline-start" />
        编辑
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setDeleteOpen(true)}>
        <Trash2 data-icon="inline-start" />
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
        description={`确认解绑摄像头「${camera.name}」？`}
        confirmLabel="确认解绑"
        destructive
        pending={pending}
        onConfirm={deleteCamera}
      />
    </div>
  );
}
