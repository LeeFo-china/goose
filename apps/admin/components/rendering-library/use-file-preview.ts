'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RenderingLibraryFilePreviewResult } from '@gooes/domain';
import { libraryRequests } from './requests';

export function useFilePreview(fileId: string | undefined, initial?: RenderingLibraryFilePreviewResult) {
  const [preview, setPreview] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!fileId) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const current = ++generation.current; setLoading(true); setError('');
    try {
      const result = await libraryRequests.preview(fileId, controller.signal);
      if (!controller.signal.aborted && current === generation.current) setPreview(result);
    } catch (cause) {
      if (!controller.signal.aborted && current === generation.current) setError(cause instanceof Error ? cause.message : '预览加载失败');
    } finally { if (!controller.signal.aborted && current === generation.current) setLoading(false); }
  }, [fileId]);
  useEffect(() => {
    setPreview(initial);
    if (fileId && (!initial || Date.parse(initial.expires_at) <= Date.now())) void refresh();
    return () => { request.current?.abort(); ++generation.current; };
  }, [fileId, initial, refresh]);
  return { preview, loading, error, refresh };
}
