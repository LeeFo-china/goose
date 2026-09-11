'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { StatusAlert } from '@/components/admin/status-alert';
import type { AiProviderRecord } from './ai-config-types';
import { deleteAiProvider, providerDeleteError } from './ai-provider-delete-state';

export function AiProviderDelete({ provider, onDeleted, disabled = false }: {
  provider: AiProviderRecord;
  onDeleted: (provider: AiProviderRecord) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const validVersion = typeof provider.version === 'number' && Number.isSafeInteger(provider.version) && provider.version > 0;

  function changeOpen(next: boolean) {
    if (submitting.current) return;
    setOpen(next);
    setError('');
  }

  async function confirmDelete() {
    if (submitting.current || disabled || !validVersion || error) return;
    submitting.current = true;
    setPending(true);
    try {
      await deleteAiProvider(provider);
    } catch (cause) {
      setError(providerDeleteError(cause));
      submitting.current = false;
      setPending(false);
      return;
    }
    setOpen(false);
    toast.success('供应商已删除，共用密钥配置已保留');
    // 删除确认成功后，刷新失败不能被表述为删除失败或触发重试。
    try { await onDeleted(provider); }
    catch { toast.error('供应商已删除，但列表刷新失败，请刷新页面。'); }
    finally { submitting.current = false; setPending(false); }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`删除供应商 ${provider.name}`}>
          <Trash2 data-icon="inline-start" />删除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除供应商？</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            确认删除“{provider.name}”？删除后不可恢复，共用的 API Key 配置会保留。
            有关联模型或目录同步记录的供应商不能删除，请改用停用。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!validVersion ? <StatusAlert>供应商版本无效，请取消并刷新页面。</StatusAlert> : null}
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={pending || disabled || !validVersion || Boolean(error)}
            onClick={() => void confirmDelete()}>{pending ? '正在删除…' : '确认删除'}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
