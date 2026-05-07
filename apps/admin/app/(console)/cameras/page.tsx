import {
  Camera,
  CameraOff,
  CircuitBoard,
  Link2,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { CameraProjectPicker } from "@/components/cameras/camera-list-actions";
import { CreateCameraButton } from "@/components/cameras/camera-mutations";
import { CamerasTable } from "@/components/cameras/cameras-table";
import type {
  CameraProjectOption,
  CameraRecord,
  CameraDeviceChannel,
  EzvizDeviceChannel,
  Pagination,
  TencentDeviceChannel,
} from "@/components/cameras/camera-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type ProjectListData = {
  list: Array<{
    id: string;
    name: string | null;
    status?: string | null;
    address?: string | null;
    customer?: {
      name?: string | null;
      phone_masked?: string | null;
      phone?: string | null;
    } | Array<{
      name?: string | null;
      phone_masked?: string | null;
      phone?: string | null;
    }> | null;
  }>;
  pagination: Pagination;
};

type CameraListData = {
  list: CameraRecord[];
};

type EzvizDeviceListData = {
  list: EzvizDeviceChannel[];
};

type TencentDeviceListData = {
  list: TencentDeviceChannel[];
};

type CamerasPageSearchParams = {
  project_id?: string;
};

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = {
  online: { label: "在线", variant: "success" },
  offline: { label: "离线", variant: "danger" },
  unknown: { label: "未知", variant: "secondary" },
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function customerName(project: ProjectListData["list"][number]) {
  const customer = relationOne(project.customer);
  return customer?.name || customer?.phone_masked || customer?.phone || null;
}

function renderStatus(status: string) {
  const meta = statusMeta[status] || {
    label: status || "未知",
    variant: "outline" as const,
  };

  return <Badge className="whitespace-nowrap" variant={meta.variant}>{meta.label}</Badge>;
}

function compactIdentifier(value: string | null | undefined) {
  if (!value) return "-";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function tencentDeviceName(device: TencentDeviceChannel) {
  return device.device_name || device.device_code || compactIdentifier(device.device_id);
}

function tencentChannelName(device: TencentDeviceChannel) {
  return device.channel_name || device.channel_code || compactIdentifier(device.channel_id);
}

async function fetchBackendData<T>(token: string, path: string) {
  const response = await fetch(buildBackendUrl(path), {
    headers: {
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const payload = await parseBackendJson<T>(response);
  return payload.data as T;
}

async function getProjects(token: string | null) {
  if (!token) {
    return {
      list: [] as CameraProjectOption[],
      error: "缺少登录凭证",
    };
  }

  try {
    const data = await fetchBackendData<ProjectListData>(
      token,
      "/projects?page=1&pageSize=100",
    );
    return {
      list: (data?.list || []).map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status || null,
        customer_name: customerName(project),
        address: project.address || null,
      })),
      error: null,
    };
  } catch (error) {
    return {
      list: [] as CameraProjectOption[],
      error: error instanceof Error ? error.message : "项目列表加载失败",
    };
  }
}

async function getCameraData(token: string | null, projectId: string) {
  if (!token || !projectId) {
    return {
      cameras: [] as CameraRecord[],
      devices: [] as CameraDeviceChannel[],
      ezvizDevices: [] as EzvizDeviceChannel[],
      tencentDevices: [] as TencentDeviceChannel[],
      cameraError: null,
      ezvizDeviceError: null,
      tencentDeviceError: null,
    };
  }

  const [cameraResult, ezvizDeviceResult, tencentDeviceResult] = await Promise.allSettled([
    fetchBackendData<CameraListData>(token, `/projects/${projectId}/cameras`),
    fetchBackendData<EzvizDeviceListData>(
      token,
      `/projects/${projectId}/cameras/ezviz-devices?only_unbound=false`,
    ),
    fetchBackendData<TencentDeviceListData>(
      token,
      `/projects/${projectId}/cameras/tencent-devices?only_unbound=false`,
    ),
  ]);
  const ezvizDevices = ezvizDeviceResult.status === "fulfilled"
    ? ezvizDeviceResult.value?.list || []
    : [];
  const tencentDevices = tencentDeviceResult.status === "fulfilled"
    ? tencentDeviceResult.value?.list || []
    : [];

  return {
    cameras: cameraResult.status === "fulfilled"
      ? cameraResult.value?.list || []
      : [],
    devices: [
      ...ezvizDevices.map((device) => ({ ...device, vendor: "ezviz" as const })),
      ...tencentDevices.map((device) => ({
        ...device,
        vendor: "tencent_iotvideo_industry" as const,
      })),
    ],
    ezvizDevices,
    tencentDevices,
    cameraError: cameraResult.status === "rejected"
      ? cameraResult.reason instanceof Error
        ? cameraResult.reason.message
        : "摄像头列表加载失败"
      : null,
    ezvizDeviceError: ezvizDeviceResult.status === "rejected"
      ? ezvizDeviceResult.reason instanceof Error
        ? ezvizDeviceResult.reason.message
        : "萤石设备列表加载失败"
      : null,
    tencentDeviceError: tencentDeviceResult.status === "rejected"
      ? tencentDeviceResult.reason instanceof Error
        ? tencentDeviceResult.reason.message
        : "腾讯云设备列表加载失败"
      : null,
  };
}

export default async function CamerasPage({
  searchParams,
}: {
  searchParams: Promise<CamerasPageSearchParams>;
}) {
  const params = await searchParams;
  const token = await getAdminToken();
  const { list: projects, error: projectError } = await getProjects(token);
  const requestedProjectId = params.project_id?.trim() || "";
  const selectedProjectId = projects.some((project) => project.id === requestedProjectId)
    ? requestedProjectId
    : projects[0]?.id || "";
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;
  const {
    cameras,
    devices,
    ezvizDevices,
    tencentDevices,
    cameraError,
    ezvizDeviceError,
    tencentDeviceError,
  } = await getCameraData(
    token,
    selectedProjectId,
  );
  const onlineCount = cameras.filter((cameraItem) => cameraItem.status === "online").length;
  const hiddenCount = cameras.filter((cameraItem) => !cameraItem.can_view).length;
  const unboundDeviceCount = devices.filter((device) => device.can_bind).length;
  const tencentCameraCount = cameras.filter((cameraItem) => cameraItem.vendor === "tencent_iotvideo_industry").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">工地监控</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            萤石和腾讯云行业版设备通道选择、项目摄像头绑定、客户可见权限和播放参数。
          </p>
        </div>
        {selectedProjectId ? (
          <CreateCameraButton projectId={selectedProjectId} devices={devices} />
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Camera />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">当前项目摄像头</div>
              <div className="text-xl font-semibold">{cameras.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <CircuitBoard />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">未绑定设备通道</div>
              <div className="text-xl font-semibold">{unboundDeviceCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <CameraOff />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">隐藏摄像头</div>
              <div className="text-xl font-semibold">{hiddenCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">腾讯云 {tencentCameraCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
            <CameraProjectPicker
              projects={projects}
              selectedProjectId={selectedProjectId}
            />
            <div className="rounded-md border bg-background p-3 text-sm">
              <div className="font-medium">{selectedProject?.name || "未选择项目"}</div>
              <div className="mt-1 truncate text-muted-foreground">
                {[selectedProject?.customer_name, selectedProject?.address].filter(Boolean).join(" · ") || "请选择项目后管理摄像头"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {projectError ? <StatusAlert>{projectError}</StatusAlert> : null}
      {cameraError ? <StatusAlert>{cameraError}</StatusAlert> : null}
      {ezvizDeviceError ? (
        <StatusAlert tone="warning">
          {ezvizDeviceError}。已绑定摄像头仍可管理，新增萤石绑定需要萤石设备列表可用。
        </StatusAlert>
      ) : null}
      {tencentDeviceError ? (
        <StatusAlert tone="warning">
          {tencentDeviceError}。已绑定摄像头仍可管理，新增腾讯云绑定需要先完成腾讯云监控配置。
        </StatusAlert>
      ) : null}

      {!selectedProjectId && !projectError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>暂无可管理项目</EmptyTitle>
            <EmptyDescription>
              创建项目后，可以在这里绑定萤石或腾讯云行业版摄像头通道。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {selectedProjectId ? (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <CardTitle>项目摄像头</CardTitle>
              <div className="flex flex-wrap justify-end gap-2">
                <Badge variant="success">在线 {onlineCount}</Badge>
                <Badge variant="outline">共 {cameras.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <CamerasTable
                projectId={selectedProjectId}
                cameras={cameras}
                devices={devices}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <CardTitle>萤石设备通道</CardTitle>
              <Badge variant="outline">共 {ezvizDevices.length} 个通道</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-t text-sm">
                  <thead className="bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">设备</th>
                      <th className="px-4 py-3">序列号</th>
                      <th className="px-4 py-3">通道</th>
                      <th className="px-4 py-3">状态</th>
                      <th className="px-4 py-3">加密</th>
                      <th className="px-4 py-3">绑定状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ezvizDevices.map((device) => (
                      <tr
                        key={`${device.device_serial}-${device.channel_no}`}
                        className="border-t"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {device.device_name || "未命名设备"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {device.channel_name || "未命名通道"}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {device.device_serial}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {device.channel_no}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {renderStatus(device.status)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {device.video_encrypted ? (
                            <Badge variant="warning">已加密</Badge>
                          ) : (
                            <Badge variant="success">未加密</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {device.is_bound ? (
                            <div className="flex flex-col gap-1">
                              <Badge
                                className="w-fit"
                                variant={device.is_bound_to_current_project ? "success" : "secondary"}
                              >
                                <Link2 />
                                {device.is_bound_to_current_project ? "当前项目" : "其他项目"}
                              </Badge>
                              <div className="text-xs text-muted-foreground">
                                {device.bound_project_name || device.bound_camera_name || "-"}
                              </div>
                            </div>
                          ) : (
                            <Badge variant="outline">可绑定</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                    {ezvizDevices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="h-28 px-4 py-6 text-center text-muted-foreground">
                          暂无萤石设备通道
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <CardTitle>腾讯云行业版通道</CardTitle>
              <Badge variant="outline">共 {tencentDevices.length} 个通道</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-t text-sm">
                  <thead className="bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">设备备注</th>
                      <th className="px-4 py-3">通道备注</th>
                      <th className="px-4 py-3">状态</th>
                      <th className="px-4 py-3">协议</th>
                      <th className="px-4 py-3">绑定状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tencentDevices.map((device) => (
                      <tr
                        key={`${device.device_id}-${device.channel_id}`}
                        className="border-t"
                      >
                        <td className="max-w-[320px] px-4 py-3">
                          <div className="font-medium">
                            {tencentDeviceName(device)}
                          </div>
                          <div
                            className="truncate text-xs text-muted-foreground"
                            title={device.device_id}
                          >
                            ID {compactIdentifier(device.device_id)}
                          </div>
                        </td>
                        <td className="max-w-[320px] px-4 py-3">
                          <div className="font-medium">
                            {tencentChannelName(device)}
                          </div>
                          <div
                            className="truncate text-xs text-muted-foreground"
                            title={device.channel_id}
                          >
                            通道ID {compactIdentifier(device.channel_id)}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {renderStatus(device.status)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {device.protocol || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {device.is_bound ? (
                            <div className="flex flex-col gap-1">
                              <Badge
                                className="w-fit"
                                variant={device.is_bound_to_current_project ? "success" : "secondary"}
                              >
                                <Link2 />
                                {device.is_bound_to_current_project ? "当前项目" : "其他项目"}
                              </Badge>
                              <div className="text-xs text-muted-foreground">
                                {device.bound_project_name || device.bound_camera_name || "-"}
                              </div>
                            </div>
                          ) : (
                            <Badge variant="outline">可绑定</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                    {tencentDevices.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="h-28 px-4 py-6 text-center text-muted-foreground">
                          暂无腾讯云行业版通道
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
