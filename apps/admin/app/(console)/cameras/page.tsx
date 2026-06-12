import {
  Camera,
  CameraOff,
  CircuitBoard,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { StatusAlert } from "@/components/admin/status-alert";
import { CreateCameraButton } from "@/components/cameras/camera-mutations";
import { CamerasTable } from "@/components/cameras/cameras-table";
import { CamerasWorkspaceTabs } from "@/components/cameras/cameras-workspace-tabs";
import { TenantDeviceAssetsPanel } from "@/components/cameras/tenant-device-assets-panel";
import { SyncTenantDevicesButton } from "@/components/cameras/tenant-device-asset-actions";
import { CreateTencentDeviceButton } from "@/components/cameras/tencent-device-actions";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAdminToken } from "@/lib/auth";
import {
  buildCameraPageHref,
  type CamerasPageSearchParams,
  getCameraProjectGroups,
  getProjects,
  getTenantDevices,
} from "./page-data";

function SetupStep({
  index,
  title,
  description,
  state,
}: {
  index: number;
  title: string;
  description: string;
  state: "done" | "active" | "pending";
}) {
  const isDone = state === "done";
  const isActive = state === "active";

  return (
    <div className="flex gap-3">
      <div
        className={[
          "flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
          isDone ? "border-success bg-success text-success-foreground" : "",
          isActive ? "border-primary bg-primary text-primary-foreground" : "",
          state === "pending" ? "bg-card text-muted-foreground" : "",
        ].filter(Boolean).join(" ")}
      >
        {index}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function CameraEmptyState({
  cameraKeyword,
  hasTenantDevices,
  hasUnboundTenantDevices,
  selectedProjectId,
}: {
  cameraKeyword: string;
  hasTenantDevices: boolean;
  hasUnboundTenantDevices: boolean;
  selectedProjectId: string;
}) {
  if (cameraKeyword) {
    return (
      <Empty className="border-0 py-12">
        <EmptyHeader>
          <EmptyTitle>没有匹配的项目摄像头</EmptyTitle>
          <EmptyDescription>
            换一个项目、客户、手机号、小区或房号关键词再试。
          </EmptyDescription>
        </EmptyHeader>
        <Button type="button" variant="outline" asChild>
          <Link href="/cameras">清除搜索</Link>
        </Button>
      </Empty>
    );
  }

  const activeStep = !hasTenantDevices ? 1 : hasUnboundTenantDevices ? 3 : 2;

  return (
    <div className="px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <div className="text-center">
          <h2 className="text-base font-semibold">按设备接入流程完成项目监控</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            先把现场设备纳入资产池，再同步通道，最后绑定到房产项目。
          </p>
        </div>

        <div className="grid gap-4 rounded-md border bg-muted/20 p-4 md:grid-cols-3">
          <SetupStep
            index={1}
            title="新增设备"
            description="创建设备资产，获取现场 SIP 接入信息。"
            state={!hasTenantDevices ? "active" : "done"}
          />
          <SetupStep
            index={2}
            title="同步通道"
            description="设备上线后同步通道，确认可绑定资产。"
            state={activeStep === 2 ? "active" : activeStep > 2 ? "done" : "pending"}
          />
          <SetupStep
            index={3}
            title="绑定项目"
            description="把可用通道绑定到客户的房产项目。"
            state={activeStep === 3 ? "active" : "pending"}
          />
        </div>

        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
          {!hasTenantDevices && selectedProjectId ? (
            <CreateTencentDeviceButton projectId={selectedProjectId} sipServer={null} />
          ) : null}
          {hasTenantDevices && !hasUnboundTenantDevices ? (
            <SyncTenantDevicesButton />
          ) : null}
          {hasUnboundTenantDevices ? (
            <CreateCameraButton projectId="" devices={[]} />
          ) : null}
        </div>
      </div>
    </div>
  );
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
  const hasTenantDevices = tenantDevices.length > 0;
  const hasUnboundTenantDevices = unboundTenantDeviceCount > 0;
  const hasCameraProjectGroups = cameraProjectGroups.length > 0;
  const showCameraSearch = hasCameraProjectGroups || Boolean(cameraKeyword);
  const showCameraPagination = cameraProjectPagination.total > 0;
  const showWorkspaceSummary = cameraProjectSummary.total_camera_count > 0 || hasTenantDevices;
  const showSetupFlow = !hasCameraProjectGroups && !cameraProjectError && !cameraKeyword;
  const currentPageOfflineCount = cameraProjectGroups.reduce(
    (count, group) => count + group.cameras.filter((camera) => camera.status === "offline").length,
    0,
  );
  const currentPageEncryptedCount = cameraProjectGroups.reduce(
    (count, group) => count + group.cameras.filter((camera) => camera.video_encrypted).length,
    0,
  );
  const currentPageHiddenCount = cameraProjectGroups.reduce(
    (count, group) => count + group.summary.hidden_count,
    0,
  );
  const hasCurrentPageRisks = (
    currentPageOfflineCount > 0
    || currentPageEncryptedCount > 0
    || currentPageHiddenCount > 0
    || hasUnboundTenantDevices
  );
  const headerAction = showSetupFlow ? null : (
    !hasTenantDevices && selectedProjectId ? (
      <CreateTencentDeviceButton projectId={selectedProjectId} sipServer={null} />
    ) : projects.length ? (
      <CreateCameraButton projectId="" devices={[]} />
    ) : null
  );

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
            <Camera className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-normal">工地监控</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              维护项目摄像头、客户可见权限和设备资产接入。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">已绑定项目 {cameraProjectSummary.project_count}</Badge>
              {cameraProjectSummary.online_count > 0 ? (
                <Badge variant="success">在线 {cameraProjectSummary.online_count}</Badge>
              ) : null}
              {cameraProjectSummary.hidden_count > 0 ? (
                <Badge variant="secondary">客户隐藏 {cameraProjectSummary.hidden_count}</Badge>
              ) : null}
              {hasTenantDevices ? (
                <Badge variant="outline">未绑定设备 {unboundTenantDeviceCount}</Badge>
              ) : (
                <Badge variant="secondary">尚未接入设备</Badge>
              )}
            </div>
          </div>
        </div>
        {headerAction}
      </div>

      {projectError ? (
        <div className="shrink-0">
          <StatusAlert>{projectError}</StatusAlert>
        </div>
      ) : null}
      {cameraProjectError ? (
        <div className="shrink-0">
          <StatusAlert>{cameraProjectError}</StatusAlert>
        </div>
      ) : null}
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
          summary={showWorkspaceSummary ? (
            <>
              {cameraProjectSummary.total_camera_count > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Camera className="size-3.5" />
                  摄像头 {cameraProjectSummary.total_camera_count}
                </span>
              ) : null}
              {hasTenantDevices ? (
                <span className="inline-flex items-center gap-1">
                  <CircuitBoard className="size-3.5" />
                  设备 {tenantDevices.length}
                </span>
              ) : null}
              {cameraProjectSummary.hidden_count > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <CameraOff className="size-3.5" />
                  客户隐藏 {cameraProjectSummary.hidden_count}
                </span>
              ) : null}
            </>
          ) : null}
          cameras={(
            <>
              <div className="shrink-0 border-b bg-card px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">项目摄像头</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {showCameraPagination ? (
                        <>
                          共 {cameraProjectPagination.total} 个项目 · 第 {cameraProjectPagination.page} /{" "}
                          {Math.max(cameraProjectPagination.totalPages, 1)} 页
                        </>
                      ) : (
                        "尚未绑定项目摄像头"
                      )}
                    </p>
                    {hasCameraProjectGroups ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {hasCurrentPageRisks ? (
                          <>
                            {currentPageOfflineCount > 0 ? (
                              <Badge variant="danger">离线 {currentPageOfflineCount}</Badge>
                            ) : null}
                            {currentPageHiddenCount > 0 ? (
                              <Badge variant="secondary">客户隐藏 {currentPageHiddenCount}</Badge>
                            ) : null}
                            {currentPageEncryptedCount > 0 ? (
                              <Badge variant="warning">加密 {currentPageEncryptedCount}</Badge>
                            ) : null}
                            {hasUnboundTenantDevices ? (
                              <Badge variant="outline">未绑定设备 {unboundTenantDeviceCount}</Badge>
                            ) : null}
                          </>
                        ) : (
                          <Badge variant="success">本页无离线风险</Badge>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {showCameraSearch ? (
                    <form
                      className={[
                        "grid w-full gap-2 lg:w-auto",
                        cameraKeyword
                          ? "sm:grid-cols-[minmax(0,22rem)_auto_auto]"
                          : "sm:grid-cols-[minmax(0,22rem)_auto]",
                      ].join(" ")}
                      action="/cameras"
                    >
                      <Input
                        name="camera_keyword"
                        defaultValue={cameraKeyword}
                        placeholder="搜索项目、客户、手机号、小区或房号"
                      />
                      <Button type="submit" size="sm">
                        <Search data-icon="inline-start" />
                        搜索
                      </Button>
                      {cameraKeyword ? (
                        <Button type="button" variant="outline" size="sm" asChild>
                          <Link href="/cameras">
                            <X data-icon="inline-start" />
                            清除
                          </Link>
                        </Button>
                      ) : null}
                    </form>
                  ) : null}
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 divide-y overflow-auto">
                  {cameraProjectGroups.map((group) => (
                    <section key={group.project.id} className="bg-card">
                      <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {group.project.address || group.project.name || "未命名项目"}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {group.project.customer_name ? <span>{group.project.customer_name}</span> : null}
                            {group.project.phone_masked ? <span>{group.project.phone_masked}</span> : null}
                            {group.project.property?.layout ? <span>{group.project.property.layout}</span> : null}
                            {group.project.property?.area ? <span>{group.project.property.area}㎡</span> : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="success">在线 {group.summary.online_count}</Badge>
                          <Badge variant="secondary">客户隐藏 {group.summary.hidden_count}</Badge>
                          <Badge variant="outline">腾讯云 {group.summary.tencent_count}</Badge>
                          <Badge variant="outline">共 {group.summary.camera_count}</Badge>
                        </div>
                      </div>
                      <CamerasTable
                        projectId={group.project.id}
                        cameras={group.cameras}
                        devices={[]}
                      />
                    </section>
                  ))}

                  {!cameraProjectGroups.length && !cameraProjectError ? (
                    <CameraEmptyState
                      cameraKeyword={cameraKeyword}
                      hasTenantDevices={hasTenantDevices}
                      hasUnboundTenantDevices={hasUnboundTenantDevices}
                      selectedProjectId={selectedProjectId}
                    />
                  ) : null}
                </div>

                {showCameraPagination ? (
                  <div className="shrink-0 flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 md:flex-row md:items-center md:justify-between">
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
                ) : null}
              </div>
            </>
          )}
          devices={(
            selectedProjectId ? (
              <TenantDeviceAssetsPanel
                assets={tenantDevices}
                error={tenantDeviceError}
                projectId={selectedProjectId}
              />
            ) : (
              <Empty className="border-0 py-12">
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
