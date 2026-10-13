import Link from 'next/link';
import { StatusAlert } from '@/components/admin/status-alert';
import { CameraProjectsTable } from '@/components/cameras/camera-projects-table';
import { CameraProjectToolbar } from '@/components/cameras/camera-project-toolbar';
import { buildCameraProjectHref, normalizeCameraProjectFilters } from '@/components/cameras/camera-project-filters';
import { CamerasWorkspaceTabs } from '@/components/cameras/cameras-workspace-tabs';
import { TenantDeviceAssetsPanel } from '@/components/cameras/tenant-device-assets-panel';
import { getTenantBusinessAccessDenied } from '@/components/layout/platform-mode-access-denied';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { getAdminToken } from '@/lib/auth';
import { type CamerasPageSearchParams, getCameraProjectGroups, getTenantDevices } from './page-data';

export default async function CamerasPage({ searchParams }: { searchParams: Promise<CamerasPageSearchParams> }) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;
  const params = await searchParams;
  const filters = normalizeCameraProjectFilters(params);
  const token = await getAdminToken();
  const [projects, devices] = await Promise.all([
    getCameraProjectGroups({ token, ...filters }),
    getTenantDevices(token),
  ]);
  const { pagination } = projects;
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <h1 className="sr-only">工地监控</h1>
      <CamerasWorkspaceTabs cameras={(
        <>
          <CameraProjectToolbar key={JSON.stringify(filters)} filters={filters} />
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            {projects.error ? (
              <div className="space-y-3 p-4"><StatusAlert>{projects.error}</StatusAlert><Button variant="outline" asChild><Link href={buildCameraProjectHref(filters)}>重新加载项目</Link></Button></div>
            ) : projects.list.length ? <CameraProjectsTable groups={projects.list} /> : (
              <Empty className="border-0 py-12">
                <EmptyHeader>
                  <EmptyTitle>{filters.keyword || filters.status ? '没有匹配的项目' : filters.binding === 'bound' ? '暂无已绑定摄像头的项目' : filters.binding === 'unbound' ? '暂无未绑定摄像头的项目' : '暂无可查看的项目'}</EmptyTitle>
                  <EmptyDescription>{filters.keyword || filters.status ? '调整关键词或项目状态后重试。' : filters.binding === 'bound' ? '查看未绑定项目，为项目添加首台摄像头。' : '项目会按你的查看权限展示。'}</EmptyDescription>
                </EmptyHeader>
                <Button variant="outline" asChild><Link href={buildCameraProjectHref({page:1,keyword:'',binding:filters.binding === 'bound' ? 'unbound' : 'all',status:''})}>{filters.binding === 'bound' ? '查看未绑定项目' : '查看全部项目'}</Link></Button>
              </Empty>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground tabular-nums">当前 {projects.list.length} 个项目，共 {pagination.total} 个 · 第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页</span>
            <div className="flex gap-2">
              {pagination.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={buildCameraProjectHref({...filters,page:pagination.page-1})}>上一页</Link></Button> : <Button variant="outline" size="sm" disabled>上一页</Button>}
              {pagination.page < pagination.totalPages ? <Button variant="outline" size="sm" asChild><Link href={buildCameraProjectHref({...filters,page:pagination.page+1})}>下一页</Link></Button> : <Button variant="outline" size="sm" disabled>下一页</Button>}
            </div>
          </div>
        </>
      )} devices={<TenantDeviceAssetsPanel assets={devices.list} error={devices.error} pagination={devices.pagination} />} />
    </div>
  );
}
