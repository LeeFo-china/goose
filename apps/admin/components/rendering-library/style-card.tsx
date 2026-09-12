'use client';
import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { RenderingLibraryStyle, RenderingLibraryFilePreviewResult } from '@gooes/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SOURCE_LABELS, SPACE_LABELS, STATUS_LABELS, STYLE_LABELS } from './contracts';

export interface StyleActions {
  onView: (style: RenderingLibraryStyle) => void; onEdit: (style: RenderingLibraryStyle) => void;
  onCommand: (style: RenderingLibraryStyle, command: 'publish' | 'hide' | 'remove') => void;
}
export function StyleCard({ style, preview, canManage, onView, onEdit, onCommand }: StyleActions & {
  style: RenderingLibraryStyle; preview?: RenderingLibraryFilePreviewResult; canManage: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const available = preview && preview.url !== failedUrl && Date.parse(preview.expires_at) > Date.now();
  return <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
    <button type="button" className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`查看${style.title}详情`} onClick={() => onView(style)}>
      {available ? <img src={preview.url} alt={style.title} loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" onError={() => setFailedUrl(preview.url)} />
        : <span className="flex flex-col items-center gap-2 text-xs text-muted-foreground"><ImageOff aria-hidden="true" className="size-6" />预览暂不可用</span>}
    </button>
    <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
      <div className="flex min-w-0 items-start justify-between gap-2"><h2 className="min-w-0 break-words text-sm font-semibold">{style.title}</h2><Badge variant={style.status === 'hidden' ? 'outline' : 'secondary'} className="shrink-0">{STATUS_LABELS[style.status]}</Badge></div>
      <p className="text-xs text-muted-foreground">{SOURCE_LABELS[style.source_type]} · {SPACE_LABELS[style.space]} · {STYLE_LABELS[style.style]}</p>
      {style.status === 'published' && style.published_version !== null && style.version > style.published_version ?
        <p className="text-xs font-medium text-foreground">线上仍为上一版本 · 有未发布修改</p> : null}
      <div className="mt-auto flex flex-wrap gap-1">
        {canManage ? <><Button size="sm" variant="outline" onClick={() => onEdit(style)}>编辑</Button>
          <Button size="sm" onClick={() => onCommand(style, 'publish')}>{style.status === 'published' ? style.published_version !== null && style.version > style.published_version ? '发布最新修改' : '重新发布' : '发布'}</Button>
          {style.status === 'published' ? <Button size="sm" variant="ghost" onClick={() => onCommand(style, 'hide')}>隐藏</Button> : null}
          <Button size="sm" variant="ghost" onClick={() => onCommand(style, 'remove')}>删除</Button></>
          : <Button size="sm" variant="outline" onClick={() => onView(style)}>查看详情</Button>}
      </div>
    </div>
  </article>;
}
