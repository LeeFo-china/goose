'use client';
import { useEffect, useRef, useState } from 'react';
import type { RenderingLibraryStyle, RenderingLibraryFilePreviewResult } from '@gooes/domain';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusAlert } from '@/components/admin/status-alert';
import { StyleFieldsSchema, fieldErrors, toStyleFields } from './contracts';
import { libraryRequests } from './requests';
import { getStyleWriteBlock } from './style-write-state';
import { StyleFields } from './style-fields';
import { useFilePreview } from './use-file-preview';

export function StyleEditor({ style, preview: initialPreview, canManage, onClose, onSaved }: {
  style: RenderingLibraryStyle; preview?: RenderingLibraryFilePreviewResult; canManage: boolean;
  onClose: () => void; onSaved: (style: RenderingLibraryStyle) => void;
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
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg motion-reduce:animate-none" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{canManage ? '编辑素材' : '素材详情'}</DialogTitle><DialogDescription>保存的资料仅在发布后向客户展示；后续修改需要重新发布。</DialogDescription></DialogHeader>
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-muted">
        {available ? <img src={preview.url} alt={current.title} referrerPolicy="no-referrer" className="size-full object-contain" onError={() => setFailedUrl(preview.url)} />
          : <Button variant="outline" disabled={detail.loading} onClick={() => { setFailedUrl(undefined); void detail.refresh(); }}>{detail.loading ? '正在加载预览' : '刷新预览'}</Button>}
      </div>
      {detail.error ? <StatusAlert>{detail.error}</StatusAlert> : null}
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {writeBlock === 'conflict' ? <StatusAlert tone="warning">本地输入已保留。加载最新资料会替换当前输入，请先核对。<Button variant="outline" className="mt-2" disabled={busy} onClick={() => void loadLatest()}>加载最新资料</Button></StatusAlert> : null}
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex flex-col gap-4">
        <StyleFields value={fields} onChange={setFields} errors={errors} disabled={busy || !canManage} />
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>关闭</Button>
          {canManage ? <Button type="submit" disabled={busy || Boolean(writeBlock)}>{busy ? '处理中' : '保存资料'}</Button> : null}</DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
