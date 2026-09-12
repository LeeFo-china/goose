'use client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { UploadQueueItem } from './upload-queue';
const labels = { ready: '待上传', uploading: '上传中', saving: '保存资料中', saved: '已保存', failed: '失败' } as const;

export function UploadItem({ item, titleError, disabled, onTitle, onRemove, onRetry, onEdit }: {
  item: UploadQueueItem; titleError?: string; disabled: boolean; onTitle: (title: string) => void; onRemove: () => void; onRetry: () => void; onEdit: () => void;
}) {
  const used = item.errorCode === 'RENDERING_STYLE_FILE_USED';
  return <li className="flex min-w-0 flex-col gap-3 border-b py-4 last:border-0 sm:flex-row">
    {item.previewUrl ? <img src={item.previewUrl} alt={`${item.title}本地预览`} className="aspect-[4/3] w-24 shrink-0 rounded-md bg-muted object-cover" /> : null}
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-xs text-muted-foreground">{item.file.name}</span><Badge variant={item.status === 'failed' ? 'danger' : item.status === 'saved' ? 'success' : 'secondary'}>{labels[item.status]}</Badge></div>
      <Field data-invalid={Boolean(titleError)}><FieldLabel htmlFor={`upload-title-${item.key}`}>素材标题</FieldLabel>
        <Input id={`upload-title-${item.key}`} maxLength={80} value={item.title} disabled={disabled || item.status === 'saved' || used} onChange={(event) => onTitle(event.target.value)} aria-invalid={Boolean(titleError)} aria-describedby={titleError || item.error ? `upload-error-${item.key}` : undefined} />
        <FieldError id={`upload-error-${item.key}`}>{titleError || item.error}</FieldError></Field>
      {item.status === 'failed' && item.failureStage === 'upload' ? <p className="text-xs text-muted-foreground">上传结果可能未确认，存储中可能已保留文件。请核对后再重新上传。</p> : null}
      {used ? <p className="text-xs text-muted-foreground">请先核对素材库中的现有记录，不能将本次失败视为保存成功。</p> : null}
      <div className="flex flex-wrap gap-2">
        {item.status === 'failed' && !used ? <Button size="sm" variant="outline" disabled={disabled} onClick={onRetry}>{item.fileId ? '重试保存资料' : '重新上传'}</Button> : null}
        {item.saved ? <Button size="sm" variant="outline" disabled={disabled} onClick={onEdit}>编辑资料</Button> : null}
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onRemove}>移除</Button>
      </div>
    </div>
  </li>;
}
