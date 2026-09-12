import type { RenderingLibraryCreate, RenderingLibraryStyle } from '@gooes/domain';
import { RenderingLibraryCreateSchema } from '@gooes/domain';
import type { createLibraryRequests } from './requests';

export interface UploadQueueItem {
  key: string; file: File; title: string; previewUrl: string;
  status: 'ready' | 'uploading' | 'saving' | 'saved' | 'failed';
  fileId?: string; error?: string; errorCode?: string; failureStage?: 'upload' | 'save'; saved?: RenderingLibraryStyle;
}
export type UploadDefaults = Pick<RenderingLibraryCreate, 'space' | 'style' | 'source_type'> & { rights_confirmed: boolean };
type Requests = Pick<ReturnType<typeof createLibraryRequests>, 'upload' | 'create'>;
export class RenderingUploadQueue {
  private running = false;
  private stopped = false;
  constructor(private readonly requests: Requests) {}
  stop(): void { this.stopped = true; }
  async run(items: UploadQueueItem[], defaults: UploadDefaults, changed: (item: UploadQueueItem) => void): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      for (const original of items) {
        if (this.stopped) break;
        if (original.status === 'saved' || original.errorCode === 'RENDERING_STYLE_FILE_USED') continue;
        let item = { ...original, error: undefined, errorCode: undefined };
        const validation = RenderingLibraryCreateSchema.omit({ file_id: true }).safeParse({ ...defaults, title: item.title });
        if (!validation.success) { changed({ ...item, status: 'failed', error: '请补全标题、分类并确认图片使用授权', failureStage: item.fileId ? 'save' : 'upload' }); continue; }
        try {
          if (!item.fileId) {
            item = { ...item, status: 'uploading' }; changed(item);
            const uploaded = await this.requests.upload(item.file);
            item = { ...item, fileId: uploaded.file_id, status: 'saving' }; changed(item);
            if (this.stopped) break;
          }
          item = { ...item, status: 'saving' }; changed(item);
          const saved = await this.requests.create({ ...validation.data, file_id: item.fileId });
          changed({ ...item, saved, status: 'saved' });
        } catch (error) {
          const errorCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
          changed({ ...item, status: 'failed', failureStage: item.fileId ? 'save' : 'upload', errorCode,
            error: error instanceof Error ? error.message : '处理素材失败，请重试' });
        }
      }
    } finally { this.running = false; }
  }
}
