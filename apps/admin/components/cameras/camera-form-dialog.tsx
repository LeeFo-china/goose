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

type CameraDialogProps = {
  mode: CameraMode;
  projectId: string;
  project?: CameraProjectOption;
  camera?: CameraRecord;
  devices: CameraDeviceChannel[];
  advanced?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CameraDialog(props: CameraDialogProps) {
  // A new project or open session must never inherit another session's async results.
  if (!props.open) return null;
  return <CameraDialogSession key={`${props.mode}:${props.projectId}:${props.camera?.id || ""}`} {...props} />;
}

function CameraDialogSession({
  mode, projectId, project, camera, devices, advanced = false, open, onOpenChange,
}: CameraDialogProps) {
  const router = useRouter();
  const defaults = useMemo(() => buildDefaults(camera), [camera]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [projectKeyword, setProjectKeyword] = useState("");
  const [projectOptions, setProjectOptions] = useState<CameraProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  const [selectedProject, setSelectedProject] = useState<CameraProjectOption | null>(null);
  const [projectLoading, setProjectLoading] = useState(mode === "create" && Boolean(projectId));
  const [projectSelectError, setProjectSelectError] = useState("");
  const [createDevices, setCreateDevices] = useState<CameraDeviceChannel[]>([]);
  const [deviceKeyword, setDeviceKeyword] = useState("");
  const [devicePage, setDevicePage] = useState(1);
  const [deviceTotalPages, setDeviceTotalPages] = useState(0);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const deviceRequestScope = useRef<{ active: boolean; loading: boolean } | null>(null);
  const form = useForm<CameraFormValues>({
    resolver: zodResolver(CameraFormSchema as never) as Resolver<CameraFormValues>,
    defaultValues: { ...defaults, device_key: "" },
  });
  const activeProjectId = projectId || selectedProjectId;
  const projectEligible = selectedProject?.id === activeProjectId && canBindCameraToProject(selectedProject);
  const activeDevices = mode === "create" ? createDevices : devices;
  const availableDevices = useMemo(
    () => activeDevices.filter((device) => device.can_bind),
    [activeDevices],
  );
  const selectedCapabilities = form.watch("capabilities");

  useEffect(() => {
    if (!open || mode !== "create") return;

    let disposed = false;
    setSelectedProject(null);
    setProjectLoading(Boolean(activeProjectId || projectKeyword.trim()));
    setProjectSelectError("");
    const timer = window.setTimeout(() => {
      if (!projectKeyword.trim() && !activeProjectId) {
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
      if (!projectId && projectKeyword.trim()) {
        params.set("keyword", projectKeyword.trim());
      }
      if (activeProjectId) {
        params.set("selected_project_id", activeProjectId);
      }

      requestCamera<CameraBindProjectOptionsData>({
        path: `/projects/camera-bind-options?${params.toString()}`,
      })
        .then((data: CameraBindProjectOptionsData) => {
          if (disposed) return;
          const list = data?.list || [];
          setProjectOptions(list);
          const current = list.find((item) => item.id === activeProjectId) || null;
          setSelectedProject(current);
          if (activeProjectId && !current) {
            setProjectSelectError("当前项目不存在或无权访问，请关闭后刷新项目列表重试。");
          } else if (current && !canBindCameraToProject(current)) {
            setProjectSelectError("无效或竣工验收项目不能新增摄像头。");
          }
        })
        .catch((err) => {
          if (disposed) return;
          setProjectSelectError(err instanceof Error ? err.message : "房产项目加载失败");
        })
        .finally(() => {
          if (!disposed) setProjectLoading(false);
        });
    }, !projectId && projectKeyword.trim() ? 300 : 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [activeProjectId, mode, open, projectId, projectKeyword]);

  useEffect(() => {
    const scope = { active: true, loading: false };
    deviceRequestScope.current = scope;
    setCreateDevices([]);
    setDevicePage(1);
    setDeviceTotalPages(0);
    setDeviceError("");
    form.setValue("device_key", "", { shouldDirty: false });
    if (!open || mode !== "create" || !projectEligible || projectLoading) {
      setDeviceLoading(false);
      return () => { scope.active = false; };
    }

    scope.loading = true;
    setDeviceLoading(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ only_unbound: "true", page: "1", pageSize: "20" });
      if (deviceKeyword.trim()) params.set("keyword", deviceKeyword.trim());
      requestCamera<TenantDeviceListData>({ path: `/tenant-devices?${params.toString()}` })
        .then((data) => {
          if (!scope.active) return;
          setCreateDevices(tenantAssetsToDevices(data?.list || []));
          setDevicePage(data.pagination?.page || 1);
          setDeviceTotalPages(data.pagination?.totalPages || 0);
        })
        .catch((err) => {
          if (scope.active) setDeviceError(err instanceof Error ? err.message : "公司设备资产加载失败");
        })
        .finally(() => {
          if (!scope.active) return;
          scope.loading = false;
          setDeviceLoading(false);
        });
    }, deviceKeyword.trim() ? 300 : 0);

    return () => {
      scope.active = false;
      window.clearTimeout(timer);
    };
  }, [activeProjectId, deviceKeyword, form, mode, open, projectEligible, projectLoading]);

  function loadMoreDevices() {
    const scope = deviceRequestScope.current;
    if (!scope?.active || scope.loading || !projectEligible || devicePage >= deviceTotalPages) return;
    const params = new URLSearchParams({
      only_unbound: "true", page: String(devicePage + 1), pageSize: "20",
    });
    if (deviceKeyword.trim()) params.set("keyword", deviceKeyword.trim());
    scope.loading = true;
    setDeviceLoading(true);
    setDeviceError("");
    requestCamera<TenantDeviceListData>({ path: `/tenant-devices?${params.toString()}` })
      .then((data) => {
        if (!scope.active) return;
        const nextDevices = tenantAssetsToDevices(data?.list || []);
        setCreateDevices((current) => {
          const known = new Set(current.map(buildDeviceKey));
          return [...current, ...nextDevices.filter((device) => !known.has(buildDeviceKey(device)))];
        });
        setDevicePage(data.pagination?.page || devicePage + 1);
        setDeviceTotalPages(data.pagination?.totalPages || deviceTotalPages);
      })
      .catch((err) => {
        if (scope.active) setDeviceError(err instanceof Error ? err.message : "公司设备资产加载失败");
      })
      .finally(() => {
        if (!scope.active) return;
        scope.loading = false;
        setDeviceLoading(false);
      });
  }

  function changeDeviceKeyword(value: string) {
    if (deviceRequestScope.current) deviceRequestScope.current.active = false;
    setCreateDevices([]);
    setDeviceTotalPages(0);
    setDeviceLoading(true);
    setDeviceKeyword(value);
  }

  function changeProjectId(value: string) {
    if (projectId) return;
    if (deviceRequestScope.current) deviceRequestScope.current.active = false;
    setSelectedProject(null);
    setCreateDevices([]);
    setDeviceKeyword("");
    setSelectedProjectId(value);
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
    if (mode === "create" && (projectLoading || !projectEligible)) {
      setError(projectSelectError || "请等待项目校验完成后重试");
      return;
    }
    if (mode === "create" && (deviceLoading || !availableDevices.some((device) => buildDeviceKey(device) === values.device_key))) {
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
                projectLocked={Boolean(projectId)}
                projectContext={project?.id === projectId ? project : undefined}
                projectKeyword={projectKeyword}
                projectOptions={projectOptions}
                selectedProjectId={selectedProjectId}
                selectedProject={selectedProject}
                projectLoading={projectLoading}
                projectSelectError={projectSelectError}
                deviceKeyword={deviceKeyword}
                deviceLoading={deviceLoading}
                deviceError={deviceError}
                hasMoreDevices={devicePage < deviceTotalPages}
                availableDevices={availableDevices}
                setProjectKeyword={setProjectKeyword}
                setSelectedProjectId={changeProjectId}
                setSelectedProject={setSelectedProject}
                setDeviceKeyword={changeDeviceKeyword}
                loadMoreDevices={loadMoreDevices}
                onNavigateToDevices={close}
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
                  projectLoading ||
                  !projectEligible ||
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
