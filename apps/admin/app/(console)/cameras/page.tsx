import {
  Camera,
  CameraOff,
  CircuitBoard,
} from "lucide-react";
import Link from "next/link";
import { StatusAlert } from "@/components/admin/status-alert";
import { CreateCameraButton } from "@/components/cameras/camera-mutations";
import { CamerasTable } from "@/components/cameras/cameras-table";
import { CamerasWorkspaceTabs } from "@/components/cameras/cameras-workspace-tabs";
import { TenantDeviceAssetsPanel } from "@/components/cameras/tenant-device-assets-panel";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import type {
  CameraProjectOption,
  CameraProjectGroup,
  Pagination,
  TenantDeviceAsset,
} from "@/components/cameras/camera-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
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

type TenantDeviceListData = {
  list: TenantDeviceAsset[];
  pagination: Pagination;
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

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function customerName(project: ProjectListData["list"][number]) {
  const customer = relationOne(project.customer);
  return customer?.name || customer?.phone_masked || customer?.phone || null;
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

async function getTenantDevices(token: string | null) {
  if (!token) {
    return {
      list: [] as TenantDeviceAsset[],
      error: "缺少登录凭证",
    };
  }

  try {
    const data = await fetchBackendData<TenantDeviceListData>(
      token,
      "/tenant-devices?page=1&pageSize=100",
    );
    return {
      list: data?.list || [],
      error: null,
    };
  } catch (error) {
    return {
      list: [] as TenantDeviceAsset[],
      error: error instanceof Error ? error.message : "租户设备资产加载失败",
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
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

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
    list: tenantDevices,
    error: tenantDeviceError,
  } = await getTenantDevices(token);
  const unboundTenantDeviceCount = tenantDevices.filter((device) => !device.bound_camera_id).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">工地监控</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理租户设备资产、项目摄像头绑定、客户可见权限和播放参数。
          </p>
        </div>
        {projects.length ? (
          <CreateCameraButton projectId="" devices={[]} />
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
              <div className="text-xl font-semibold">{unboundTenantDeviceCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">来自设备资产池</div>
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
      {!selectedProjectId && !projectError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>暂无可管理项目</EmptyTitle>
            <EmptyDescription>
              创建项目后，可以在这里绑定摄像头并维护设备资产。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {selectedProjectId || cameraProjectGroups.length || cameraProjectError ? (
        <CamerasWorkspaceTabs
          cameras={(
            <>
              <div className="flex flex-col gap-3 border-t px-4 py-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <CardTitle>项目摄像头</CardTitle>
                    <CardDescription>
                      搜索条件作用于下方项目摄像头列表，当前共 {cameraProjectPagination.total} 个项目。
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    第 {cameraProjectPagination.page} / {Math.max(cameraProjectPagination.totalPages, 1)} 页
                  </Badge>
                </div>
                <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]" action="/cameras">
                  <Input
                    name="camera_keyword"
                    defaultValue={cameraKeyword}
                    placeholder="搜索项目、客户、手机号、小区或房号"
                  />
                  <Button type="submit">搜索</Button>
                  {cameraKeyword ? (
                    <Button type="button" variant="outline" asChild>
                      <Link href="/cameras">清除</Link>
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" disabled>
                      清除
                    </Button>
                  )}
                </form>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 px-4 pt-4">
                  {cameraProjectGroups.map((group) => (
                    <div key={group.project.id} className="overflow-hidden rounded-md border">
                      <div className="flex flex-col gap-3 border-b bg-muted/30 p-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold">
                            {group.project.address || group.project.name || "未命名项目"}
                          </div>
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
                      </div>
                      <CamerasTable
                        projectId={group.project.id}
                        cameras={group.cameras}
                        devices={[]}
                      />
                    </div>
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
                </div>

                <div className="flex flex-col gap-3 px-4 pb-4 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-muted-foreground">
                    每页 {cameraProjectPagination.pageSize} 个项目，共 {cameraProjectPagination.total} 个
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
              </div>
            </>
          )}
          devices={(
            selectedProjectId ? (
              <div className="border-t p-4">
                <TenantDeviceAssetsPanel
                  assets={tenantDevices}
                  error={tenantDeviceError}
                  projectId={selectedProjectId}
                />
              </div>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>暂无设备接入上下文</EmptyTitle>
                  <EmptyDescription>
                    创建项目后，可以在这里维护租户设备资产。
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
