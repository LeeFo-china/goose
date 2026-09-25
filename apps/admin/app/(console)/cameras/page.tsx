import { Search, X } from "lucide-react";
import Link from "next/link";
import { StatusAlert } from "@/components/admin/status-alert";
import { CamerasTable } from "@/components/cameras/cameras-table";
import { CamerasWorkspaceTabs } from "@/components/cameras/cameras-workspace-tabs";
import { CreateCameraButton } from "@/components/cameras/camera-mutations";
import { TenantDeviceAssetsPanel } from "@/components/cameras/tenant-device-assets-panel";
import { collapseTenantDeviceAssets } from "@/components/cameras/tenant-device-asset-utils";
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
  getTenantDevices,
} from "./page-data";

function CameraEmptyState({
  cameraKeyword,
}: {
  cameraKeyword: string;
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

  return (
    <div className="px-4 py-10">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center">
        <div className="text-center">
          <h2 className="text-base font-semibold">暂无项目摄像头</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            点击“添加摄像头”，选择未绑定设备并设置项目内别名。
          </p>
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
  const cameraPage = Math.max(Number(params.camera_page || 1) || 1, 1);
  const cameraKeyword = params.camera_keyword?.trim() || "";
  const {
    list: cameraProjectGroups,
    pagination: cameraProjectPagination,
    error: cameraProjectError,
  } = await getCameraProjectGroups({
    token,
    page: cameraPage,
    keyword: cameraKeyword,
  });
  const {
    list: tenantDevices,
    pagination: tenantDevicePagination,
    error: tenantDeviceError,
  } = await getTenantDevices(token);
  const unboundTenantDeviceCount = collapseTenantDeviceAssets(tenantDevices).filter(
    (device) => !device.bound_camera_id && !device.bound_project_id,
  ).length;
  const hasUnboundTenantDevices = unboundTenantDeviceCount > 0;
  const hasCameraProjectGroups = cameraProjectGroups.length > 0;
  const showCameraSearch = hasCameraProjectGroups || Boolean(cameraKeyword);
  const showCameraPagination = cameraProjectPagination.total > 0;
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
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <h1 className="sr-only">工地监控</h1>

      {cameraProjectError ? (
        <div className="shrink-0">
          <StatusAlert>{cameraProjectError}</StatusAlert>
        </div>
      ) : null}
      <CamerasWorkspaceTabs
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
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                    <CreateCameraButton projectId="" devices={[]} />
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
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 divide-y overflow-auto">
                  {cameraProjectGroups.map((group) => (
                    <section key={group.project.id} className="bg-card">
                      <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
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
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {group.summary.camera_count} 台摄像头
                            </span>
                            <span>在线 {group.summary.online_count}</span>
                            {group.summary.hidden_count > 0 ? (
                              <span>客户隐藏 {group.summary.hidden_count}</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0">
                          <CreateCameraButton
                            projectId={group.project.id}
                            devices={[]}
                          />
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
            <TenantDeviceAssetsPanel
              assets={tenantDevices}
              error={tenantDeviceError}
              pagination={tenantDevicePagination}
            />
          )}
        />
    </div>
  );
}
