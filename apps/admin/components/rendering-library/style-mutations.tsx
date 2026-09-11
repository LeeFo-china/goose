'use client';
import { useRef, useState } from 'react';
import type { RenderingLibraryStyle } from '@gooes/domain';
import { StatusAlert } from '@/components/admin/status-alert';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { libraryRequests } from './requests';
import { getStyleWriteBlock } from './style-write-state';

export function StyleMutation({ style, command, onClose, onSuccess }: {
  style: RenderingLibraryStyle; command: 'hide' | 'remove'; onClose: () => void; onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  const [current, setCurrent] = useState(style);
  const [writeBlock, setWriteBlock] = useState<ReturnType<typeof getStyleWriteBlock>>();
  const [reloaded, setReloaded] = useState(false);
  async function submit() {
    if (lock.current || writeBlock) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (command === 'hide') await libraryRequests.hide(current.id, current.version);
      else await libraryRequests.remove(current.id, current.version);
      onSuccess(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试'); setWriteBlock(getStyleWriteBlock(cause)); setReloaded(false); }
    finally { lock.current = false; setBusy(false); }
  }
  async function loadLatest() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { const latest = await libraryRequests.get(current.id); setCurrent(latest); setWriteBlock(undefined); setReloaded(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '读取最新资料失败'); if (getStyleWriteBlock(cause) === 'unavailable') setWriteBlock('unavailable'); }
    finally { lock.current = false; setBusy(false); }
  }
  const label = command === 'hide' ? '隐藏素材' : '删除素材';
  return <AlertDialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg motion-reduce:animate-none"><AlertDialogHeader>
      <AlertDialogTitle>{label}</AlertDialogTitle><AlertDialogDescription>
        {command === 'hide' ? `隐藏“${current.title}”后，可通过已隐藏筛选找到它。` : `将“${current.title}”移出素材库，原图文件仍会保留，此操作不会删除存储中的图片。`}
      </AlertDialogDescription></AlertDialogHeader>
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {writeBlock === 'conflict' ? <StatusAlert tone="warning">请先加载并核对最新资料，再确认操作。<Button className="mt-2" variant="outline" disabled={busy} onClick={() => void loadLatest()}>加载最新资料</Button></StatusAlert> : null}
      {reloaded ? <StatusAlert tone="success">已加载最新资料：{current.title}。请核对后再次确认。</StatusAlert> : null}
      <AlertDialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button>
        <Button variant={command === 'remove' ? 'destructive' : 'default'} disabled={busy || Boolean(writeBlock)} onClick={() => void submit()}>{busy ? '处理中' : label}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
