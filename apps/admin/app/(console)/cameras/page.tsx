import {
  Camera,
  CameraOff,
  CircuitBoard,
  Link2,
} from "lucide-react";
import Link from "next/link";
import { StatusAlert } from "@/components/admin/status-alert";
import { CreateCameraButton } from "@/components/cameras/camera-mutations";
import { CamerasTable } from "@/components/cameras/cameras-table";
import { CamerasWorkspaceTabs } from "@/components/cameras/cameras-workspace-tabs";
import { TencentDeviceChannelTree } from "@/components/cameras/tencent-device-channel-tree";
import {
  CreateTencentDeviceButton,
  TencentSipAccessButton,
} from "@/components/cameras/tencent-device-actions";
import type {
  CameraProjectOption,
  CameraDeviceChannel,
  CameraProjectGroup,
  EzvizDeviceChannel,
  Pagination,
  TencentDeviceChannel,
  TencentDeviceRecord,
  TencentSipServerConfig,
} from "@/components/cameras/camera-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type EzvizDeviceListData = {
  list: EzvizDeviceChannel[];
};

type TencentDeviceListData = {
  sip_server: TencentSipServerConfig | null;
  devices: TencentDeviceRecord[];
  list: TencentDeviceChannel[];
};

type CamerasPageSearchParams = {
  project_id?: string;
  camera_page?: string;
  camera_keyword?: string;
};

type CameraProjectGroupsData = {
  list: CameraProjectGroup[];
  pagination: Pagination;
  summary: {
    project_count: number;
    total_camera_count: number;
    online_count: number;
    hidden_count: number;
    tencent_count: number;
  };
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
      devices: [] as CameraDeviceChannel[],
      ezvizDevices: [] as EzvizDeviceChannel[],
      tencentDeviceRecords: [] as TencentDeviceRecord[],
      tencentDevices: [] as TencentDeviceChannel[],
      tencentSipServer: null as TencentSipServerConfig | null,
      ezvizDeviceError: null,
      tencentDeviceError: null,
    };
  }

  const [ezvizDeviceResult, tencentDeviceResult] = await Promise.allSettled([
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
  const tencentDeviceRecords = tencentDeviceResult.status === "fulfilled"
    ? tencentDeviceResult.value?.devices || []
    : [];
  const tencentSipServer = tencentDeviceResult.status === "fulfilled"
    ? tencentDeviceResult.value?.sip_server || null
    : null;

  return {
    devices: [
      ...ezvizDevices.map((device) => ({ ...device, vendor: "ezviz" as const })),
      ...tencentDevices.map((device) => ({
        ...device,
        vendor: "tencent_iotvideo_industry" as const,
      })),
    ],
    ezvizDevices,
    tencentDeviceRecords,
    tencentDevices,
    tencentSipServer,
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

async function getCameraProjectGroups(input: {
  token: string | null;
  page: number;
  keyword: string;
}) {
  if (!input.token) {
    return {
      list: [] as CameraProjectGroup[],
      pagination: { page: input.page, pageSize: 5, total: 0, totalPages: 0 },
      summary: {
        project_count: 0,
        total_camera_count: 0,
        online_count: 0,
        hidden_count: 0,
        tencent_count: 0,
      },
      error: "缺少登录凭证",
    };
  }

  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: "5",
  });
  if (input.keyword) params.set("keyword", input.keyword);

  try {
    const data = await fetchBackendData<CameraProjectGroupsData>(
      input.token,
      `/project-cameras/projects?${params.toString()}`,
    );
    return {
      list: data?.list || [],
      pagination: data?.pagination || { page: input.page, pageSize: 5, total: 0, totalPages: 0 },
      summary: data?.summary || {
        project_count: 0,
        total_camera_count: 0,
        online_count: 0,
        hidden_count: 0,
        tencent_count: 0,
      },
      error: null,
    };
  } catch (error) {
    return {
      list: [] as CameraProjectGroup[],
      pagination: { page: input.page, pageSize: 5, total: 0, totalPages: 0 },
      summary: {
        project_count: 0,
        total_camera_count: 0,
        online_count: 0,
        hidden_count: 0,
        tencent_count: 0,
      },
      error: error instanceof Error ? error.message : "项目摄像头加载失败",
    };
  }
}

function buildCameraPageHref(input: {
  page: number;
  keyword: string;
}) {
  const params = new URLSearchParams();
  if (input.page > 1) params.set("camera_page", String(input.page));
  if (input.keyword) params.set("camera_keyword", input.keyword);
  const query = params.toString();
  return query ? `/cameras?${query}` : "/cameras";
}

export default async function CamerasPage({
  searchParams,
}: {
  searchParams: Promise<CamerasPageSearchParams>;
}) {
  const params = await searchParams;
  const token = await getAdminToken();
  const { list: projects, error: projectError } = await getProjects(token);
  const cameraPage = Math.max(Number(params.camera_page || 1) || 1, 1);
  const cameraKeyword = params.camera_keyword?.trim() || "";
  const {
    list: cameraProjectGroups,
    pagination: cameraProjectPagination,
    summary: cameraProjectSummary,
    error: cameraProjectError,
  } = await getCameraProjectGroups({
    token,
    page: cameraPage,
    keyword: cameraKeyword,
  });
  const requestedProjectId = params.project_id?.trim() || "";
  const selectedProjectId = projects.some((project) => project.id === requestedProjectId)
    ? requestedProjectId
    : projects[0]?.id || "";
  const {
    devices,
    ezvizDevices,
    tencentDeviceRecords,
    tencentDevices,
    tencentSipServer,
    ezvizDeviceError,
    tencentDeviceError,
  } = await getCameraData(
    token,
    selectedProjectId,
  );
  const unboundDeviceCount = devices.filter((device) => device.can_bind).length;

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
              <div className="text-sm text-muted-foreground">已绑定项目</div>
              <div className="text-xl font-semibold">{cameraProjectSummary.project_count}</div>
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
              <div className="text-xl font-semibold">{cameraProjectSummary.hidden_count}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                总摄像头 {cameraProjectSummary.total_camera_count} · 在线 {cameraProjectSummary.online_count}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {projectError ? <StatusAlert>{projectError}</StatusAlert> : null}
      {cameraProjectError ? <StatusAlert>{cameraProjectError}</StatusAlert> : null}
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

      {selectedProjectId || cameraProjectGroups.length || cameraProjectError ? (
        <CamerasWorkspaceTabs
          cameras={(
            <div className="flex flex-col gap-4">
              <Card>
                <CardContent className="p-4">
                  <form className="flex flex-col gap-3 md:flex-row md:items-center" action="/cameras">
                    <Input
                      name="camera_keyword"
                      defaultValue={cameraKeyword}
                      placeholder="搜索项目、客户、手机号、小区或房号"
                      className="md:max-w-[360px]"
                    />
                    <div className="flex gap-2">
                      <Button type="submit">搜索</Button>
                      {cameraKeyword ? (
                        <Button type="button" variant="outline" asChild>
                          <Link href="/cameras">清除</Link>
                        </Button>
                      ) : null}
                    </div>
                    <div className="text-sm text-muted-foreground md:ml-auto">
                      每页 {cameraProjectPagination.pageSize} 个项目，共 {cameraProjectPagination.total} 个
                    </div>
                  </form>
                </CardContent>
              </Card>

              {cameraProjectGroups.map((group) => (
                <Card key={group.project.id}>
                  <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="truncate">
                        {group.project.address || group.project.name || "未命名项目"}
                      </CardTitle>
                      <div className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground">
                        {group.project.customer_name ? <span>{group.project.customer_name}</span> : null}
                        {group.project.phone_masked ? <span>{group.project.phone_masked}</span> : null}
                        {group.project.property?.layout ? <span>{group.project.property.layout}</span> : null}
                        {group.project.property?.area ? <span>{group.project.property.area}㎡</span> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="success">在线 {group.summary.online_count}</Badge>
                      <Badge variant="secondary">隐藏 {group.summary.hidden_count}</Badge>
                      <Badge variant="outline">腾讯云 {group.summary.tencent_count}</Badge>
                      <Badge variant="outline">共 {group.summary.camera_count}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <CamerasTable
                      projectId={group.project.id}
                      cameras={group.cameras}
                      devices={[]}
                    />
                  </CardContent>
                </Card>
              ))}

              {!cameraProjectGroups.length && !cameraProjectError ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>暂无已绑定摄像头的项目</EmptyTitle>
                    <EmptyDescription>
                      点击右上角绑定摄像头，选择房产项目后会出现在这里。
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}

              {cameraProjectPagination.totalPages > 1 ? (
                <div className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
                  <div className="text-sm text-muted-foreground">
                    第 {cameraProjectPagination.page} / {cameraProjectPagination.totalPages} 页
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={cameraProjectPagination.page <= 1}
                      asChild={cameraProjectPagination.page > 1}
                    >
                      {cameraProjectPagination.page > 1 ? (
                        <Link href={buildCameraPageHref({
                          page: cameraProjectPagination.page - 1,
                          keyword: cameraKeyword,
                        })}
                        >
                          上一页
                        </Link>
                      ) : (
                        "上一页"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={cameraProjectPagination.page >= cameraProjectPagination.totalPages}
                      asChild={cameraProjectPagination.page < cameraProjectPagination.totalPages}
                    >
                      {cameraProjectPagination.page < cameraProjectPagination.totalPages ? (
                        <Link href={buildCameraPageHref({
                          page: cameraProjectPagination.page + 1,
                          keyword: cameraKeyword,
                        })}
                        >
                          下一页
                        </Link>
                      ) : (
                        "下一页"
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          devices={(
            selectedProjectId ? (
              <div className="flex flex-col gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                  <CardTitle>腾讯云设备与通道</CardTitle>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Badge variant="outline">设备 {tencentDeviceRecords.length}</Badge>
                    <Badge variant="outline">通道 {tencentDevices.length}</Badge>
                    <TencentSipAccessButton sipServer={tencentSipServer} />
                    <CreateTencentDeviceButton
                      projectId={selectedProjectId}
                      sipServer={tencentSipServer}
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <TencentDeviceChannelTree
                    projectId={selectedProjectId}
                    devices={tencentDeviceRecords}
                    channels={tencentDevices}
                    sipServer={tencentSipServer}
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
            </div>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>暂无设备接入上下文</EmptyTitle>
                  <EmptyDescription>
                    创建项目后，可以在这里查看并绑定腾讯云或萤石设备通道。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          )}
        />
      ) : null}
    </div>
  );
}
