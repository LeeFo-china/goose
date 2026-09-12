'use client';
import type { RenderingLibraryList } from '@gooes/domain';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { SPACE_LABELS, STYLE_LABELS, STATUS_LABELS } from './contracts';
import { LibrarySelect } from './library-select';

export function LibraryFilters({ query, onChange }: { query: RenderingLibraryList; onChange: (query: RenderingLibraryList) => void }) {
  return <div className="shrink-0 border-b pb-4">
    <FieldGroup className="grid grid-cols-3 gap-2 sm:gap-3 lg:max-w-2xl">
      <LibrarySelect id="library-filter-space" label="空间" value={query.space ?? ''} labels={SPACE_LABELS} allLabel="全部空间" onChange={(space) => onChange({ ...query, space: space || undefined, page: 1 })} />
      <LibrarySelect id="library-filter-style" label="风格" value={query.style ?? ''} labels={STYLE_LABELS} allLabel="全部风格" onChange={(style) => onChange({ ...query, style: style || undefined, page: 1 })} />
      <LibrarySelect id="library-filter-status" label="状态" value={query.status ?? ''} labels={STATUS_LABELS} allLabel="全部状态" onChange={(status) => onChange({ ...query, status: status || undefined, page: 1 })} />
    </FieldGroup>
    {query.space || query.style || query.status ? <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange({ page: 1, pageSize: query.pageSize })}>清除筛选</Button> : null}
  </div>;
}
