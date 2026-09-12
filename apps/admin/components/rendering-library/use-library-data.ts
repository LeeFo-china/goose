'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RenderingLibraryFilePreviewResult, RenderingLibraryList, RenderingLibraryStyle } from '@gooes/domain';
import type { LibraryListResult } from './contracts';
import { libraryRequests } from './requests';

export function useLibraryData() {
  const [query, setQuery] = useState<RenderingLibraryList>({ page: 1, pageSize: 20 });
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<LibraryListResult>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState<Record<string, RenderingLibraryFilePreviewResult>>({});
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequest = useRef<AbortController | undefined>(undefined);
  const previewGeneration = useRef(0);
  const rows = useRef<RenderingLibraryStyle[]>([]);
  const loadPreviews = useCallback(async (list: RenderingLibraryStyle[]) => {
    previewRequest.current?.abort();
    const generation = ++previewGeneration.current;
    const controller = new AbortController(); previewRequest.current = controller;
    setPreviews({}); setPreviewError('');
    if (!list.length) { setPreviewLoading(false); return; }
    setPreviewLoading(true);
    try {
      const result = await libraryRequests.previews([...new Set(list.map((item) => item.file_id))], controller.signal);
      if (!controller.signal.aborted && generation === previewGeneration.current) setPreviews(Object.fromEntries(result.items.map((item) => [item.file_id, item])));
    } catch (cause) {
      if (!controller.signal.aborted && generation === previewGeneration.current) setPreviewError(cause instanceof Error ? cause.message : '预览加载失败');
    } finally { if (!controller.signal.aborted && generation === previewGeneration.current) setPreviewLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    previewRequest.current?.abort(); ++previewGeneration.current;
    rows.current = []; setData(undefined); setPreviews({}); setPreviewError(''); setPreviewLoading(false); setLoading(true); setError('');
    libraryRequests.list(query, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      const lastPage = Math.max(1, result.pagination.totalPages);
      if (query.page > lastPage) { setQuery((current) => ({ ...current, page: lastPage })); return; }
      rows.current = result.list; setData(result); void loadPreviews(result.list);
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '读取素材列表失败');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); previewRequest.current?.abort(); ++previewGeneration.current; };
  }, [query, revision, loadPreviews]);
  return { query, setQuery, data, loading, error, previews, previewError, previewLoading,
    refresh: () => setRevision((value) => value + 1), refreshPreviews: () => void loadPreviews(rows.current) };
}
