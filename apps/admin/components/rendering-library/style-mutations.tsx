'use client';
import { useRef, useState } from 'react';
import type { RenderingLibraryFilePreviewResult, RenderingLibraryStyle } from '@gooes/domain';
import { StatusAlert } from '@/components/admin/status-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SOURCE_LABELS, SPACE_LABELS, STYLE_LABELS } from './contracts';
import { libraryRequests, LibraryRequestError } from './requests';
import { getStyleWriteBlock } from './style-write-state';

export function StyleMutation({ style, preview, command, onClose, onSuccess }: {
  style: RenderingLibraryStyle; preview?: RenderingLibraryFilePreviewResult;
  command: 'publish' | 'hide' | 'remove'; onClose: () => void; onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  const [current, setCurrent] = useState(style);
  const [currentPreview, setCurrentPreview] = useState(preview);
  const [responsibilityConfirmed, setResponsibilityConfirmed] = useState(false);
  const [publicationKey] = useState(() => crypto.randomUUID());
  const [writeBlock, setWriteBlock] = useState<ReturnType<typeof getStyleWriteBlock>>();
  const [reloaded, setReloaded] = useState(false);
  async function submit() {
    if (lock.current || writeBlock || (command === 'publish' && !responsibilityConfirmed)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (command === 'publish') await libraryRequests.publish(current.id, { expected_version: current.version,
        idempotency_key: publicationKey, responsibility_confirmed: true });
      else if (command === 'hide') await libraryRequests.hide(current.id, current.version);
      else await libraryRequests.remove(current.id, current.version);
      onSuccess(); onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请重试');
      setWriteBlock(cause instanceof LibraryRequestError && cause.code === 'RENDERING_STYLE_PUBLISH_IDEMPOTENCY_CONFLICT'
        ? 'unavailable' : getStyleWriteBlock(cause));
      setReloaded(false);
    }
    finally { lock.current = false; setBusy(false); }
  }
  async function loadLatest() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const latest = await libraryRequests.get(current.id);
      const latestPreview = command === 'publish' && latest.file_id !== current.file_id ? await libraryRequests.preview(latest.file_id) : currentPreview;
      setCurrent(latest); setCurrentPreview(latestPreview); setWriteBlock(undefined); setReloaded(true);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : '读取最新资料失败'); if (getStyleWriteBlock(cause) === 'unavailable') setWriteBlock('unavailable'); }
    finally { lock.current = false; setBusy(false); }
  }
  const label = command === 'publish' ? '发布素材' : command === 'hide' ? '隐藏素材' : '删除素材';
  return <AlertDialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <AlertDialogContent onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
      className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-lg motion-reduce:animate-none"><AlertDialogHeader>
      <AlertDialogTitle>{label}</AlertDialogTitle><AlertDialogDescription>
        {command === 'publish' ? '请核对当前资料。确认后会建立供客户浏览的独立公开副本。'
          : command === 'hide' ? '隐藏会停止新的客户浏览和生成，但不会删除历史引用，也不能保证立即清除客户端或 CDN 已缓存的图片。'
            : `将“${current.title}”移出素材库，原图文件仍会保留，此操作不会删除存储中的图片。`}
      </AlertDialogDescription></AlertDialogHeader>
      {command === 'publish' ? <div className="flex flex-col gap-3 text-sm">
        {currentPreview && currentPreview.file_id === current.file_id && Date.parse(currentPreview.expires_at) > Date.now()
          ? <img src={currentPreview.url} alt={current.title} referrerPolicy="no-referrer" className="aspect-[4/3] max-h-48 w-full rounded-md object-cover" />
          : <p className="rounded-md border bg-muted p-3 text-xs text-muted-foreground">当前图片预览暂不可用，仍可核对以下素材资料。</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b pb-3 text-xs">
          <dt className="text-muted-foreground">标题</dt><dd className="min-w-0 break-words font-medium">{current.title}</dd>
          <dt className="text-muted-foreground">空间 / 风格</dt><dd>{SPACE_LABELS[current.space]} / {STYLE_LABELS[current.style]}</dd>
          <dt className="text-muted-foreground">来源</dt><dd>{SOURCE_LABELS[current.source_type]}</dd>
          <dt className="text-muted-foreground">图片授权</dt><dd>{current.rights_confirmed ? '已确认' : '未确认'}</dd>
          {current.color_notes ? <><dt className="text-muted-foreground">颜色说明</dt><dd className="min-w-0 break-words">{current.color_notes}</dd></> : null}
          {current.material_notes ? <><dt className="text-muted-foreground">材质说明</dt><dd className="min-w-0 break-words">{current.material_notes}</dd></> : null}
        </dl>
        <Field orientation="horizontal" className="items-start gap-2">
          <Checkbox id="rendering-publish-responsibility" checked={responsibilityConfirmed} disabled={busy}
            onCheckedChange={(checked) => setResponsibilityConfirmed(checked === true)} />
          <FieldLabel htmlFor="rendering-publish-responsibility" className="cursor-pointer text-sm leading-5">
            该素材将由本公司自行公开发布，本公司承担内容及版权责任。
          </FieldLabel>
        </Field>
      </div> : null}
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {writeBlock === 'conflict' ? <StatusAlert tone="warning">请先加载并核对最新资料，再确认操作。<Button className="mt-2" variant="outline" disabled={busy} onClick={() => void loadLatest()}>加载最新资料</Button></StatusAlert> : null}
      {reloaded ? <StatusAlert tone="success">已加载最新资料：{current.title}。请核对后再次确认。</StatusAlert> : null}
      <AlertDialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button>
        <Button variant={command === 'remove' ? 'destructive' : 'default'} disabled={busy || Boolean(writeBlock) || (command === 'publish' && !responsibilityConfirmed)} onClick={() => void submit()}>{busy ? '处理中' : label}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
