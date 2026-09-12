'use client';
import { useEffect, useRef, useState } from 'react';
import type { RenderingLibraryStyle, RenderingLibraryFilePreviewResult } from '@gooes/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusAlert } from '@/components/admin/status-alert';
import { STATUS_LABELS, StyleFieldsSchema, fieldErrors, hasUnpublishedChanges, publishActionLabel, toStyleFields } from './contracts';
import { libraryRequests } from './requests';
import { getStyleWriteBlock } from './style-write-state';
import { StyleFields } from './style-fields';
import { useFilePreview } from './use-file-preview';

export function StyleEditor({ style, preview: initialPreview, canManage, onClose, onSaved, onCommand }: {
  style: RenderingLibraryStyle; preview?: RenderingLibraryFilePreviewResult; canManage: boolean;
  onClose: () => void; onSaved: (style: RenderingLibraryStyle) => void;
  onCommand: (style: RenderingLibraryStyle, command: 'publish' | 'hide', preview?: RenderingLibraryFilePreviewResult) => void;
}) {
  const [current, setCurrent] = useState(style);
  const [fields, setFields] = useState(() => toStyleFields(style));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [writeBlock, setWriteBlock] = useState<ReturnType<typeof getStyleWriteBlock>>();
  const [busy, setBusy] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string>();
  const lock = useRef(false); const active = useRef(true);
  const detail = useFilePreview(current.file_id, initialPreview);
  const preview = detail.preview;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function save() {
    if (lock.current || writeBlock || !canManage) return;
    const parsed = StyleFieldsSchema.safeParse(fields);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    lock.current = true; setBusy(true); setErrors({}); setError('');
    try {
      const saved = await libraryRequests.update(current.id, { ...parsed.data, expected_version: current.version });
      if (active.current) { onSaved(saved); onClose(); }
    } catch (cause) {
      if (active.current) { setError(cause instanceof Error ? cause.message : '保存素材资料失败'); setWriteBlock(getStyleWriteBlock(cause)); }
    } finally { lock.current = false; if (active.current) setBusy(false); }
  }
  async function loadLatest() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const latest = await libraryRequests.get(current.id);
      if (active.current) { setCurrent(latest); setFields(toStyleFields(latest)); setWriteBlock(undefined); setErrors({}); }
    } catch (cause) { if (active.current) { setError(cause instanceof Error ? cause.message : '读取最新资料失败'); if (getStyleWriteBlock(cause) === 'unavailable') setWriteBlock('unavailable'); } }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  const available = preview && preview.url !== failedUrl && Date.parse(preview.expires_at) > Date.now();
  const hasUnsavedChanges = fields.title !== current.title || fields.space !== current.space || fields.style !== current.style
    || fields.source_type !== current.source_type || fields.color_notes !== current.color_notes
    || fields.material_notes !== current.material_notes || fields.sort_order !== current.sort_order;
  const canRunCommand = canManage && !busy && !writeBlock && !hasUnsavedChanges;
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl auto-rows-max overflow-y-auto rounded-lg motion-reduce:animate-none" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{canManage ? '编辑素材' : '素材详情'}</DialogTitle><DialogDescription>保存的资料仅在发布后向客户展示；后续修改需要重新发布。</DialogDescription></DialogHeader>
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-muted">
        {available ? <img src={preview.url} alt={current.title} referrerPolicy="no-referrer" className="size-full object-contain" onError={() => setFailedUrl(preview.url)} />
          : <Button variant="outline" disabled={detail.loading} onClick={() => { setFailedUrl(undefined); void detail.refresh(); }}>{detail.loading ? '正在加载预览' : '刷新预览'}</Button>}
      </div>
      {detail.error ? <StatusAlert>{detail.error}</StatusAlert> : null}
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {writeBlock === 'conflict' ? <StatusAlert tone="warning">本地输入已保留。加载最新资料会替换当前输入，请先核对。<Button variant="outline" className="mt-2" disabled={busy} onClick={() => void loadLatest()}>加载最新资料</Button></StatusAlert> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex flex-wrap items-center gap-2"><Badge variant={current.status === 'hidden' ? 'outline' : 'secondary'}>{STATUS_LABELS[current.status]}</Badge>
          {hasUnpublishedChanges(current) ? <span className="text-xs font-medium">线上仍为上一版本 · 有未发布修改</span> : null}</div>
        {canManage ? <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={!canRunCommand} onClick={() => onCommand(current, 'publish', preview)}>{publishActionLabel(current)}</Button>
          {current.status === 'published' ? <Button type="button" size="sm" variant="outline" disabled={!canRunCommand} onClick={() => onCommand(current, 'hide', preview)}>隐藏</Button> : null}
        </div> : null}
      </div>
      {canManage && hasUnsavedChanges ? <p role="status" className="text-xs text-muted-foreground">当前有未保存修改，请先保存资料，再发布或隐藏。</p> : null}
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex flex-col gap-4">
        <StyleFields value={fields} onChange={setFields} errors={errors} disabled={busy || !canManage} />
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>关闭</Button>
          {canManage ? <Button type="submit" disabled={busy || Boolean(writeBlock)}>{busy ? '处理中' : '保存资料'}</Button> : null}</DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
