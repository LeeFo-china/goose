"use client";

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { StatusAlert } from '@/components/admin/status-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { requestBackendJson } from '@/lib/backend-client';
import { CamerasTable } from './cameras-table';
import type { CameraProjectGroup, CameraRecord, Pagination } from './camera-types';

type DevicePage = { list: CameraRecord[]; pagination: Pagination; status_source?: "live" | "cached" | "persisted" | "mixed" };
export function CameraProjectDevices({ group }: { group: CameraProjectGroup }) {
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<DevicePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    requestBackendJson<DevicePage>(`/project-cameras/projects/${group.project.id}/devices?page=${page}&pageSize=20`, {signal:controller.signal})
      .then(result => {
        if (controller.signal.aborted) return;
        const lastPage = Math.max(result.pagination.totalPages, 1);
        if (page > lastPage) {
          setData(null);
          setPage(lastPage);
          return;
        }
        setData(result);
      })
      .catch(caught => {if (!controller.signal.aborted) {setData(null);setError(caught instanceof Error ? caught.message : '设备加载失败');}})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [group, page, refresh]);
  return <section aria-label="项目设备" aria-busy={loading} className="space-y-3 p-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">设备状态以最近查询为准，可刷新本页状态。</p>
      <Button variant="outline" size="sm" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw className="size-4" />刷新状态</Button>
    </div>
    {data && data.list.length > 0 && !loading && !error && (data.status_source === 'persisted' || data.status_source === 'mixed') ? <p className="text-xs text-muted-foreground" role="status">部分设备未取得最新状态，已保留最近记录；可尝试预览或稍后刷新。</p> : null}
    {error ? <div className="space-y-2"><StatusAlert>{error}</StatusAlert><Button variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>重试加载设备</Button></div> : loading ? <div className="space-y-2" role="status" aria-label="正在加载设备"><Skeleton className="h-10" /><Skeleton className="h-12" /></div> : data ? <CamerasTable projectId={group.project.id} cameras={data.list} devices={[]} /> : null}
    {data && !error ? <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>共 {data.pagination.total} 台，第 {data.pagination.page} / {Math.max(data.pagination.totalPages,1)} 页</span>
      <div className="flex gap-2"><Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>上一页设备</Button><Button variant="outline" size="sm" disabled={loading || page >= data.pagination.totalPages} onClick={() => setPage(value => value + 1)}>下一页设备</Button></div>
    </div> : null}
  </section>;
}
