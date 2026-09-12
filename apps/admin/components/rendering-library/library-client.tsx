'use client';
import { useState } from 'react';
import { Images, RefreshCw, Upload } from 'lucide-react';
import type { RenderingLibraryStyle, RenderingLibraryFilePreviewResult } from '@gooes/domain';
import { StatusAlert } from '@/components/admin/status-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import type { LibraryAccess } from './contracts';
import { LibraryFilters } from './library-filters';
import { StyleCard, type StyleActions } from './style-card';
import { StyleEditor } from './style-editor';
import { StyleMutation } from './style-mutations';
import { UploadPanel } from './upload-panel';
import { useLibraryData } from './use-library-data';

export function LibrarySkeleton() {
  return <div role="status" aria-label="正在读取素材" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
    <span className="sr-only">正在读取素材</span>{Array.from({ length: 8 }, (_, index) => <div key={index} className="flex flex-col gap-3"><Skeleton className="aspect-[4/3] w-full rounded-lg motion-reduce:animate-none" /><Skeleton className="h-4 w-2/3 motion-reduce:animate-none" /><Skeleton className="h-3 w-1/2 motion-reduce:animate-none" /></div>)}
  </div>;
}
export function LibraryGrid({ list, previews, canManage, loading, error, filtered, onRetry, ...actions }: StyleActions & {
  list: RenderingLibraryStyle[]; previews: Record<string, RenderingLibraryFilePreviewResult>; canManage: boolean;
  loading?: boolean; error?: string; filtered?: boolean; onRetry: () => void;
}) {
  if (loading) return <LibrarySkeleton />;
  if (error) return <div className="flex flex-col gap-3"><StatusAlert>{error}</StatusAlert><Button variant="outline" className="self-start" onClick={onRetry}>重新加载</Button></div>;
  if (!list.length) return <Empty><EmptyHeader><EmptyMedia variant="icon"><Images aria-hidden="true" /></EmptyMedia>
    <EmptyTitle>{filtered ? '没有符合筛选条件的素材' : '还没有素材'}</EmptyTitle>
    <EmptyDescription>{filtered ? '调整空间、风格或状态筛选后重试。' : canManage ? '上传有使用授权的图片，整理后可发布给客户浏览。' : '管理员添加素材后，你可以在这里查看。'}</EmptyDescription>
  </EmptyHeader></Empty>;
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{list.map((style) => <StyleCard key={style.id} style={style} preview={previews[style.file_id]} canManage={canManage} {...actions} />)}</div>;
}
export function LibraryClient({ access }: { access: LibraryAccess }) {
  const library = useLibraryData();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editor, setEditor] = useState<{ style: RenderingLibraryStyle; editable: boolean }>();
  const [mutation, setMutation] = useState<{ style: RenderingLibraryStyle; command: 'publish' | 'hide' | 'remove'; preview?: RenderingLibraryFilePreviewResult }>();
  const { query, data } = library;
  const pages = Math.max(1, data?.pagination.totalPages ?? 1);
  return <div className="flex h-[calc(100dvh-8rem)] min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
    <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h1 className="text-xl font-semibold">装修效果库</h1><p className="mt-1 text-sm text-muted-foreground">整理并发布公司装修风格素材，已发布内容可供客户浏览。</p></div>
      {access.canManage && !uploadOpen ? <Button onClick={() => setUploadOpen(true)}><Upload data-icon="inline-start" />上传素材</Button> : null}
    </header>
    {uploadOpen && access.canManage ? <UploadPanel onClose={() => setUploadOpen(false)} onSaved={library.refresh} onEdit={(style) => setEditor({ style, editable: true })} /> : <>
      {!access.canManage ? <p className="shrink-0 text-sm text-muted-foreground">你当前为只读权限，可以查看素材详情和预览。</p> : null}
      <LibraryFilters query={query} onChange={library.setQuery} />
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">{library.previewLoading ? '正在加载本页预览' : '预览为短时链接，失效后可手动刷新。'}</p>
        <Button size="sm" variant="outline" disabled={library.loading || library.previewLoading || !data?.list.length} onClick={library.refreshPreviews}><RefreshCw data-icon="inline-start" />刷新预览</Button>
      </div>
      {library.previewError ? <StatusAlert>{library.previewError}</StatusAlert> : null}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-1">
        <LibraryGrid list={data?.list ?? []} previews={library.previews} canManage={access.canManage} loading={library.loading} error={library.error}
          filtered={Boolean(query.space || query.style || query.status)} onRetry={library.refresh}
          onView={(style) => setEditor({ style, editable: access.canManage })} onEdit={(style) => setEditor({ style, editable: true })}
          onCommand={(style, command) => setMutation({ style, command })} />
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">第 {query.page} / {pages} 页</Badge><span className="tabular-nums">当前 {data?.list.length ?? 0} 条，共 {data?.pagination.total ?? 0} 条</span></div>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={library.loading || query.page <= 1} onClick={() => library.setQuery({ ...query, page: query.page - 1 })}>上一页</Button>
          <Button size="sm" variant="outline" disabled={library.loading || query.page >= pages} onClick={() => library.setQuery({ ...query, page: query.page + 1 })}>下一页</Button></div>
      </footer>
    </>}
    {editor ? <StyleEditor key={editor.style.id} style={editor.style} preview={library.previews[editor.style.file_id]} canManage={access.canManage && editor.editable}
      onClose={() => setEditor(undefined)} onSaved={library.refresh}
      onCommand={(style, command, preview) => { setEditor(undefined); setMutation({ style, command, preview }); }} /> : null}
    {mutation && access.canManage ? <StyleMutation {...mutation} preview={mutation.preview ?? library.previews[mutation.style.file_id]} onClose={() => setMutation(undefined)} onSuccess={library.refresh} /> : null}
  </div>;
}
