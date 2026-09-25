"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import type { CameraDeviceChannel, CameraProjectOption, CameraRecord } from "@/components/cameras/camera-types";
import type { CameraBindProjectOptionsData, CameraMode, TenantDeviceListData } from "@/components/cameras/camera-mutation-types";
import { saveCameraForm } from "@/components/cameras/camera-form-submit";
import { CameraProjectDeviceFields } from "@/components/cameras/camera-project-device-fields";
import { CameraSettingsFields } from "@/components/cameras/camera-settings-fields";
import { buildDefaults, buildDeviceKey, CameraFormSchema, canBindCameraToProject, requestCamera, tenantAssetsToDevices, type CameraFormValues } from "@/components/cameras/camera-mutation-shared";

export function CameraDialog({
  mode,
  projectId,
  camera,
  devices,
  advanced = false,
  open,
  onOpenChange,
}: {
  mode: CameraMode;
  projectId: string;
  camera?: CameraRecord;
  devices: CameraDeviceChannel[];
  advanced?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const defaults = useMemo(() => buildDefaults(camera), [camera]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [projectKeyword, setProjectKeyword] = useState("");
  const [projectOptions, setProjectOptions] = useState<CameraProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  const [selectedProject, setSelectedProject] = useState<CameraProjectOption | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectSelectError, setProjectSelectError] = useState("");
  const [createDevices, setCreateDevices] = useState<CameraDeviceChannel[]>(
    projectId ? devices : [],
  );
  const [deviceKeyword, setDeviceKeyword] = useState("");
  const [devicePage, setDevicePage] = useState(1);
  const [deviceTotalPages, setDeviceTotalPages] = useState(0);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const initializedOpenRef = useRef(false);
  const form = useForm<CameraFormValues>({
    resolver: zodResolver(CameraFormSchema as never) as Resolver<CameraFormValues>,
    defaultValues: defaults,
  });
  const activeProjectId = mode === "create" ? selectedProjectId : projectId;
  const activeDevices = mode === "create" ? createDevices : devices;
  const availableDevices = useMemo(
    () => activeDevices.filter((device) => device.can_bind),
    [activeDevices],
  );
  const selectedCapabilities = form.watch("capabilities");

  useEffect(() => {
    if (!open) {
      initializedOpenRef.current = false;
      return;
    }
    if (initializedOpenRef.current) return;

    initializedOpenRef.current = true;
    setSelectedProjectId(projectId);
    setSelectedProject(null);
    setProjectKeyword("");
    setProjectOptions([]);
    setProjectSelectError("");
    setCreateDevices(projectId ? devices : []);
    setDeviceKeyword("");
    setDevicePage(1);
    setDeviceTotalPages(0);
    form.reset({
      ...defaults,
      device_key: "",
    });
    setError("");
  }, [defaults, devices, form, mode, open, projectId]);

  useEffect(() => {
    if (!open || mode !== "create") return;

    let disposed = false;
    const timer = window.setTimeout(() => {
      if (!projectKeyword.trim() && !selectedProjectId) {
        setProjectOptions([]);
        setSelectedProject(null);
        setProjectSelectError("");
        setProjectLoading(false);
        return;
      }

      setProjectLoading(true);
      setProjectSelectError("");
      const params = new URLSearchParams({
        page: "1",
        pageSize: "20",
      });
      if (projectKeyword.trim()) {
        params.set("keyword", projectKeyword.trim());
      }
      if (selectedProjectId) {
        params.set("selected_project_id", selectedProjectId);
      }

      requestCamera({
        path: `/projects/camera-bind-options?${params.toString()}`,
      })
        .then((data: CameraBindProjectOptionsData) => {
          if (disposed) return;
          const list = data?.list || [];
          setProjectOptions(list);
          const current = list.find((item) => item.id === selectedProjectId) || null;
          if (current) {
            setSelectedProject(current);
          }
        })
        .catch((err) => {
          if (disposed) return;
          setProjectSelectError(err instanceof Error ? err.message : "房产项目加载失败");
        })
        .finally(() => {
          if (!disposed) setProjectLoading(false);
        });
    }, projectKeyword.trim() ? 300 : 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [mode, open, projectKeyword, selectedProjectId]);

  useEffect(() => {
    if (!open || mode !== "create" || !selectedProjectId) {
      if (mode === "create" && !selectedProjectId) {
        setCreateDevices([]);
        setDevicePage(1);
        setDeviceTotalPages(0);
        form.setValue("device_key", "", {
          shouldDirty: false,
          shouldValidate: true,
        });
      }
      return;
    }

    let disposed = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        only_unbound: "true",
        page: "1",
        pageSize: "20",
      });
      if (deviceKeyword.trim()) params.set("keyword", deviceKeyword.trim());

      setDeviceLoading(true);
      setError("");
      requestCamera({ path: `/tenant-devices?${params.toString()}` })
        .then((data: TenantDeviceListData) => {
          if (disposed) return;
          const nextDevices = tenantAssetsToDevices(data?.list || []);
          setCreateDevices(nextDevices);
          setDevicePage(data.pagination?.page || 1);
          setDeviceTotalPages(data.pagination?.totalPages || 0);
          form.setValue("device_key", "", {
            shouldDirty: false,
            shouldValidate: true,
          });
        })
        .catch((err) => {
          if (!disposed) {
            setCreateDevices([]);
            setError(err instanceof Error ? err.message : "公司设备资产加载失败");
          }
        })
        .finally(() => {
          if (!disposed) setDeviceLoading(false);
        });
    }, deviceKeyword.trim() ? 300 : 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [deviceKeyword, form, mode, open, selectedProjectId]);

  function loadMoreDevices() {
    if (deviceLoading || devicePage >= deviceTotalPages) return;
    const params = new URLSearchParams({
      only_unbound: "true",
      page: String(devicePage + 1),
      pageSize: "20",
    });
    if (deviceKeyword.trim()) params.set("keyword", deviceKeyword.trim());

    setDeviceLoading(true);
    setError("");
    requestCamera({ path: `/tenant-devices?${params.toString()}` })
      .then((data: TenantDeviceListData) => {
        const nextDevices = tenantAssetsToDevices(data?.list || []);
        setCreateDevices((current) => {
          const known = new Set(current.map(buildDeviceKey));
          return [...current, ...nextDevices.filter((device) => !known.has(buildDeviceKey(device)))];
        });
        setDevicePage(data.pagination?.page || devicePage + 1);
        setDeviceTotalPages(data.pagination?.totalPages || deviceTotalPages);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "公司设备资产加载失败");
      })
      .finally(() => setDeviceLoading(false));
  }

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
    if (mode === "create" && !activeProjectId) {
      setError("请选择要绑定的房产项目");
      return;
    }
    if (mode === "create" && !canBindCameraToProject(selectedProject)) {
      setError("无效或竣工验收项目不能新增摄像头");
      return;
    }
    if (mode === "create" && !values.device_key) {
      setError("请选择一个未绑定的设备资产");
      return;
    }

    startTransition(async () => {
      try {
        await saveCameraForm({
          mode,
          projectId,
          activeProjectId,
          cameraId: camera?.id,
          values,
          availableDevices,
        });
        onOpenChange(false);
        refreshAfterDialogClose(router);
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
              ? "选择未绑定的设备资产，设置项目内别名后完成绑定。"
              : "设备序列号和通道号绑定后不可修改，避免误切换到其他项目。"}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {mode === "create" ? (
              <CameraProjectDeviceFields
                form={form}
                pending={pending}
                activeProjectId={activeProjectId}
                projectKeyword={projectKeyword}
                projectOptions={projectOptions}
                selectedProjectId={selectedProjectId}
                selectedProject={selectedProject}
                projectLoading={projectLoading}
                projectSelectError={projectSelectError}
                deviceKeyword={deviceKeyword}
                deviceLoading={deviceLoading}
                hasMoreDevices={devicePage < deviceTotalPages}
                availableDevices={availableDevices}
                setProjectKeyword={setProjectKeyword}
                setSelectedProjectId={setSelectedProjectId}
                setSelectedProject={setSelectedProject}
                setDeviceKeyword={setDeviceKeyword}
                loadMoreDevices={loadMoreDevices}
              />
            ) : null}
            <CameraSettingsFields
              form={form}
              showAdvanced={mode === "edit" || advanced}
              pending={pending}
              selectedCapabilities={selectedCapabilities}
              toggleCapability={toggleCapability}
            />
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              取消
            </Button>
            <Button
              type="submit"
              disabled={
                pending ||
                (mode === "create" && (
                  deviceLoading ||
                  !activeProjectId ||
                  !canBindCameraToProject(selectedProject) ||
                  availableDevices.length === 0
                ))
              }
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {mode === "create" ? "绑定摄像头" : "保存修改"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
