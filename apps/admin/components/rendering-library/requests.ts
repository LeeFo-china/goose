import { z } from 'zod';
import { RenderingLibraryCreateSchema, RenderingLibraryUpdateSchema, RenderingLibraryVersionSchema, RenderingLibraryPublishSchema, RenderingLibraryListSchema,
  RenderingLibraryStyleSchema, RenderingLibraryFileUploadResultSchema, RenderingLibraryFilePreviewResultSchema, RenderingLibraryBatchPreviewSchema,
  RenderingLibraryBatchPreviewResultSchema, type RenderingLibraryList } from '@gooes/domain';
import { parseBackendJson } from '@/lib/backend';
import { LibraryListResultSchema } from './contracts';

export class LibraryRequestError extends Error {
  constructor(message: string, readonly code = 'RENDERING_REQUEST_FAILED', readonly status = 0) { super(message); this.name = 'LibraryRequestError'; }
}
type FetchPort = (path: string, init: RequestInit) => Promise<Response>;
const base = '/api/backend/tenant/rendering-library';
function parse<Output>(schema: z.ZodType<Output>, input: unknown, message: string): Output {
  const result = schema.safeParse(input);
  if (!result.success) throw new LibraryRequestError(message, 'VALIDATION_ERROR');
  return result.data;
}
export function createLibraryRequests(fetcher: FetchPort = (path, init) => fetch(path, init)) {
  async function request<Output>(path: string, schema: z.ZodType<Output>, message: string, init: RequestInit = {}): Promise<Output> {
    try {
      const response = await fetcher(`${base}${path}`, { ...init, cache: 'no-store' });
      const result = await parseBackendJson<unknown>(response);
      return parse(schema, result.data, `${message.replace(/失败$/, '')}响应格式异常`);
    } catch (error) {
      if (error instanceof LibraryRequestError) throw error;
      if (init.signal?.aborted) throw error;
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'RENDERING_REQUEST_FAILED';
      const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 0;
      const known = code === 'RENDERING_STYLE_FILE_USED' ? '该原图已用于装修效果素材，请核对素材库'
        : code === 'RENDERING_STYLE_PUBLISH_IDEMPOTENCY_CONFLICT' ? '本次发布标识已用于其他请求，请关闭弹窗后重新发起发布'
        : status === 404 && path.startsWith('/styles/') ? '素材已删除或不可用，请关闭后刷新素材列表'
        : status === 409 ? '素材已更新，请加载最新资料后再操作' : message;
      throw new LibraryRequestError(known, code, status);
    }
  }
  const json = (method: string, value: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  return {
    list(query: RenderingLibraryList, signal?: AbortSignal) {
      const parsed = parse(RenderingLibraryListSchema, query, '筛选条件无效');
      const params = new URLSearchParams(Object.entries(parsed).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
      return request(`/styles?${params}`, LibraryListResultSchema, '读取素材列表失败', { signal });
    },
    async get(id: string) {
      const value = await request(`/styles/${parse(z.uuid(), id, '素材 ID 无效')}`, RenderingLibraryStyleSchema, '素材资料失败');
      if (value.id !== id) throw new LibraryRequestError('素材资料响应格式异常');
      return value;
    },
    upload(file: File) { const data = new FormData(); data.set('file', file); return request('/files', RenderingLibraryFileUploadResultSchema, '上传图片失败，结果可能未确认，请核对后再重新上传', { method: 'POST', body: data }); },
    create(input: unknown) { return request('/styles', RenderingLibraryStyleSchema, '保存素材资料失败', json('POST', parse(RenderingLibraryCreateSchema, input, '素材资料不完整'))); },
    update(id: string, input: unknown) { return request(`/styles/${parse(z.uuid(), id, '素材 ID 无效')}`, RenderingLibraryStyleSchema, '保存素材资料失败', json('PATCH', parse(RenderingLibraryUpdateSchema, input, '素材资料不完整'))); },
    publish(id: string, input: unknown) { return request(`/styles/${parse(z.uuid(), id, '素材 ID 无效')}/publish`, RenderingLibraryStyleSchema, '发布素材失败', json('POST', parse(RenderingLibraryPublishSchema, input, '发布请求无效'))); },
    hide(id: string, version: number) { return request(`/styles/${parse(z.uuid(), id, '素材 ID 无效')}/hide`, RenderingLibraryStyleSchema, '隐藏素材失败', json('POST', parse(RenderingLibraryVersionSchema, { expected_version: version }, '素材版本无效'))); },
    remove(id: string, version: number) { return request(`/styles/${parse(z.uuid(), id, '素材 ID 无效')}`, z.strictObject({ id: z.uuid(), deleted: z.literal(true) }), '删除素材失败', json('DELETE', parse(RenderingLibraryVersionSchema, { expected_version: version }, '素材版本无效'))); },
    preview(id: string, signal?: AbortSignal) { return request(`/files/${parse(z.uuid(), id, '文件 ID 无效')}/preview`, RenderingLibraryFilePreviewResultSchema, '预览加载失败，素材资料仍可查看', { signal }); },
    previews(file_ids: string[], signal?: AbortSignal) { return request('/files/previews', RenderingLibraryBatchPreviewResultSchema, '预览加载失败，素材资料仍可查看', { ...json('POST', parse(RenderingLibraryBatchPreviewSchema, { file_ids }, '预览文件列表无效')), signal }); },
  };
}
export const libraryRequests = createLibraryRequests();
