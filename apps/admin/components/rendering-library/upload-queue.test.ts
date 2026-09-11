import { expect, test } from 'bun:test';
import { RenderingUploadQueue, type UploadQueueItem } from './upload-queue';
import { fileId, style } from './test-fixtures';
const defaults = { space: 'living_room', style: 'cream', source_type: 'design', rights_confirmed: true } as const;
const item = (): UploadQueueItem => ({ key: crypto.randomUUID(), file: new File(['x'], 'a.png', { type: 'image/png' }), title: '客厅', previewUrl: '', status: 'ready' });

test('create failure keeps uploaded file ID immediately and retry never uploads again', async () => {
  let uploads = 0; let creates = 0;
  const changes: UploadQueueItem[] = [];
  const queue = new RenderingUploadQueue({ upload: async () => { uploads++; return { file_id: fileId, mime_type: 'image/webp', size_bytes: 4, width: 1, height: 1 }; },
    create: async () => { creates++; if (creates === 1) throw Object.assign(new Error('保存素材资料失败'), { code: 'DB_ERROR' }); return style; } });
  await queue.run([item()], defaults, (value) => changes.push(value));
  expect(changes.some((value) => value.fileId === fileId && value.status === 'saving')).toBe(true);
  expect(changes.at(-1)).toMatchObject({ fileId, status: 'failed', failureStage: 'save', error: '保存素材资料失败' });
  await queue.run([changes.at(-1)!], defaults, (value) => changes.push(value));
  expect(changes.at(-1)?.status).toBe('saved');
  expect({ uploads, creates }).toEqual({ uploads: 1, creates: 2 });
});
test('file-used remains an explicit failure and cannot silently create or reupload', async () => {
  let uploads = 0;
  const changes: UploadQueueItem[] = [];
  const queue = new RenderingUploadQueue({ upload: async () => { uploads++; return { file_id: fileId, mime_type: 'image/webp', size_bytes: 4, width: 1, height: 1 }; },
    create: async () => { throw Object.assign(new Error('该原图已用于装修效果素材，请核对素材库'), { code: 'RENDERING_STYLE_FILE_USED' }); } });
  await queue.run([item()], defaults, (value) => changes.push(value));
  expect(changes.at(-1)).toMatchObject({ status: 'failed', errorCode: 'RENDERING_STYLE_FILE_USED' });
  await queue.run([changes.at(-1)!], defaults, (value) => changes.push(value));
  expect(uploads).toBe(1);
  expect(changes.at(-1)?.status).not.toBe('saved');
});
test('queue serializes double-clicks and stop prevents later scheduling without cancelling in-flight work', async () => {
  let release: (() => void) | undefined; let uploads = 0; let creates = 0;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queue = new RenderingUploadQueue({ upload: async () => { uploads++; await gate; return { file_id: fileId, mime_type: 'image/webp', size_bytes: 4, width: 1, height: 1 }; },
    create: async () => { creates++; return style; } });
  const items = [item(), item()];
  const first = queue.run(items, defaults, () => {});
  await queue.run(items, defaults, () => {});
  queue.stop(); release?.(); await first;
  expect(uploads).toBe(1);
  expect(creates).toBe(0);
});
