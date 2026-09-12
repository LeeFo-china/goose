'use client';
import { useEffect, useRef, useState } from 'react';
import type { RenderingLibraryStyle } from '@gooes/domain';
import { StatusAlert } from '@/components/admin/status-alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SOURCE_LABELS, SPACE_LABELS, STYLE_LABELS, validateUploadFiles } from './contracts';
import { LibrarySelect } from './library-select';
import { libraryRequests } from './requests';
import { RenderingUploadQueue, type UploadDefaults, type UploadQueueItem } from './upload-queue';
import { UploadItem } from './upload-item';
import { UploadRights } from './upload-rights';
import { installUploadTraversalGuard } from './upload-traversal-guard';

export function UploadPanel({ onClose, onSaved, onEdit }: { onClose: () => void; onSaved: () => void; onEdit: (style: RenderingLibraryStyle) => void }) {
  const [items, setItems] = useState<UploadQueueItem[]>([]);
  const [defaults, setDefaults] = useState<UploadDefaults>({ space: 'living_room', style: 'modern_simple', source_type: 'design', rights_confirmed: false });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [rightsError, setRightsError] = useState('');
  const [titleErrors, setTitleErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ action: 'close' | 'remove' | 'navigate' | 'traverse'; value?: string; proceed?: () => Promise<void> }>();
  const [traversalSupported, setTraversalSupported] = useState(true);
  const queue = useRef<RenderingUploadQueue | null>(null);
  if (!queue.current) queue.current = new RenderingUploadQueue(libraryRequests);
  const itemsRef = useRef(items); const active = useRef(true); const lock = useRef(false); const leaving = useRef(false);
  const update = (next: UploadQueueItem[]) => { itemsRef.current = next; if (active.current) setItems(next); };
  useEffect(() => {
    active.current = true;
    queue.current = new RenderingUploadQueue(libraryRequests);
    const unsaved = () => !leaving.current && itemsRef.current.some((item) => item.status !== 'saved');
    const traversal = installUploadTraversalGuard({ navigation: 'navigation' in window ? window.navigation : undefined,
      shouldBlock: unsaved, onBlocked: (proceed) => { if (!lock.current) setPending({ action: 'traverse', proceed }); } });
    setTraversalSupported(traversal.supported);
    const unload = (event: BeforeUnloadEvent) => { if (unsaved()) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: MouseEvent) => {
      if (!unsaved() || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.target === '_blank' || link.href === window.location.href) return;
      event.preventDefault(); event.stopPropagation();
      if (!lock.current) setPending({ action: 'navigate', value: link.href });
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true);
    return () => { active.current = false; traversal.dispose(); queue.current?.stop(); for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
      window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, []);
  function selectFiles(files: File[]) {
    if (lock.current) return;
    const invalid = validateUploadFiles([...itemsRef.current.map((item) => item.file), ...files]);
    if (invalid) { setError(invalid); return; }
    setError(''); update([...itemsRef.current, ...files.map((file) => ({ key: crypto.randomUUID(), file,
      title: file.name.replace(/\.[^.]+$/, '').slice(0, 80), previewUrl: URL.createObjectURL(file), status: 'ready' as const }))]);
  }
  async function run(selected: UploadQueueItem[]) {
    if (lock.current || !selected.length) return;
    const invalidTitles = Object.fromEntries(selected.filter((item) => !item.title.trim()).map((item) => [item.key, '请填写素材标题']));
    setTitleErrors(invalidTitles); setRightsError(defaults.rights_confirmed ? '' : '请确认已取得图片使用授权');
    if (!defaults.rights_confirmed || Object.keys(invalidTitles).length) return;
    lock.current = true; setBusy(true); setError('');
    let hasSaved = false;
    try {
      await queue.current?.run(selected, defaults, (changed) => {
        update(itemsRef.current.map((item) => item.key === changed.key ? changed : item));
        if (changed.status === 'saved') hasSaved = true;
      });
    } finally { lock.current = false; if (active.current) { setBusy(false); if (hasSaved) onSaved(); } }
  }
  function remove(key: string) { const item = itemsRef.current.find((value) => value.key === key); if (item) URL.revokeObjectURL(item.previewUrl); update(itemsRef.current.filter((value) => value.key !== key)); }
  function close() { if (lock.current) return; if (itemsRef.current.some((item) => item.status !== 'saved')) setPending({ action: 'close' }); else onClose(); }
  async function confirm() {
    if (!pending || lock.current) return;
    lock.current = true; setBusy(true);
    if (pending.action === 'remove' && pending.value) remove(pending.value);
    else {
      leaving.current = true;
      try {
        if (pending.action === 'traverse' && pending.proceed) await pending.proceed();
        else if (pending.action === 'navigate' && pending.value) window.location.assign(pending.value);
        else onClose();
      } catch {
        leaving.current = false;
        if (active.current) setError('页面跳转失败，上传队列仍保留，请重试或继续整理');
      }
    }
    lock.current = false; if (active.current) setBusy(false);
    setPending(undefined);
  }
  return <section aria-label="上传素材" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">上传素材</h2><p className="mt-1 text-sm text-muted-foreground">每次最多 20 张，每张不超过 10 MiB，支持 JPG、PNG、WebP。</p></div><Button variant="outline" disabled={busy} onClick={close}>关闭上传</Button></div>
    <FieldGroup className="grid gap-4 sm:grid-cols-3">
      <LibrarySelect id="upload-space" label="公共空间" value={defaults.space} labels={SPACE_LABELS} disabled={busy} onChange={(space) => { if (space) setDefaults({ ...defaults, space }); }} />
      <LibrarySelect id="upload-style" label="公共风格" value={defaults.style} labels={STYLE_LABELS} disabled={busy} onChange={(style) => { if (style) setDefaults({ ...defaults, style }); }} />
      <LibrarySelect id="upload-source" label="公共来源" value={defaults.source_type} labels={SOURCE_LABELS} disabled={busy} onChange={(source_type) => { if (source_type) setDefaults({ ...defaults, source_type }); }} />
    </FieldGroup>
    <Field><FieldLabel htmlFor="rendering-upload-files">选择图片</FieldLabel><Input id="rendering-upload-files" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple disabled={busy} onChange={(event) => { selectFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} className="min-w-0" />
      <FieldDescription>分类会用于本次保存。保存后可逐项编辑全部资料。</FieldDescription></Field>
    <UploadRights checked={defaults.rights_confirmed} disabled={busy} error={rightsError} onChange={(checked) => { setDefaults({ ...defaults, rights_confirmed: checked }); if (checked) setRightsError(''); }} />
    {error ? <StatusAlert>{error}</StatusAlert> : null}
    <div className="flex flex-wrap items-center gap-3"><Button disabled={busy || !items.some((item) => item.status === 'ready')} onClick={() => void run(itemsRef.current.filter((item) => item.status === 'ready'))}>{busy ? '正在处理素材' : '开始上传'}</Button>
      <p className="text-xs text-muted-foreground" aria-live="polite">{items.filter((item) => item.status === 'saved').length} / {items.length} 张已保存</p></div>
    <ul className="min-w-0">{items.map((item) => <UploadItem key={item.key} item={item} titleError={titleErrors[item.key]} disabled={busy}
      onTitle={(title) => { update(itemsRef.current.map((value) => value.key === item.key ? { ...value, title } : value)); if (title.trim()) setTitleErrors((previous) => ({ ...previous, [item.key]: '' })); }}
      onRemove={() => item.status === 'saved' ? remove(item.key) : setPending({ action: 'remove', value: item.key })}
      onRetry={() => void run([item])} onEdit={() => { if (item.saved) onEdit(item.saved); }} />)}</ul>
    <p className="text-xs text-muted-foreground">关闭只会清除本地队列，不会删除已经上传的远端图片。处理中离开会停止后续任务，已发出的请求可能仍会完成。</p>
    <p className="text-xs text-muted-foreground">未保存的队列仅保留在本页。浏览器可能无法拦截前进或后退，请先保存资料或关闭上传面板，再使用浏览器导航。</p>
    {!traversalSupported ? <StatusAlert tone="warning">当前浏览器不支持站内前进、后退的离页确认，使用这些操作会丢失未保存的本地队列。</StatusAlert> : null}
    <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open && !busy) setPending(undefined); }}><AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg motion-reduce:animate-none">
      <AlertDialogHeader><AlertDialogTitle>放弃未保存的资料？</AlertDialogTitle><AlertDialogDescription>未保存的标题和队列将丢失。已经上传的远端图片仍会保留，请核对后处理。</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><Button variant="outline" disabled={busy} onClick={() => setPending(undefined)}>继续整理</Button><Button variant="destructive" disabled={busy} onClick={() => void confirm()}>放弃并继续</Button></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </section>;
}
