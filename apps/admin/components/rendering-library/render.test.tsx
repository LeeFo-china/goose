import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { StyleCard } from './style-card';
import { getPublicationPreviewExpiryDelay } from './style-mutations';
import { StyleFields } from './style-fields';
import { LibraryGrid } from './library-client';
import { UploadItem } from './upload-item';
import { UploadRights } from './upload-rights';
import { toStyleFields } from './contracts';
import { style } from './test-fixtures';

test('cards render real metadata, fixed cover and read-only detail access without write or publish actions', () => {
  const html = renderToStaticMarkup(<StyleCard style={style} preview={{ file_id: style.file_id, url: 'https://preview.example.com/image', expires_at: '2099-09-11T00:00:00Z' }} canManage={false} onView={() => {}} onEdit={() => {}} onCommand={() => {}} />);
  expect(html).toContain('<article');
  for (const text of ['客厅原图', '实景案例', '客厅', '奶油风', '草稿', '查看详情', 'referrerPolicy="no-referrer"']) expect(html).toContain(text);
  for (const text of ['>编辑<', '>删除<', '>发布<']) expect(html).not.toContain(text);
});

test('upload validation errors are associated with the specific title and rights controls', () => {
  const html = renderToStaticMarkup(<UploadItem item={{ key: 'one', file: new File(['x'], 'a.png'), title: '', previewUrl: '', status: 'ready' }} titleError="请填写素材标题" disabled={false} onTitle={() => {}} onRemove={() => {}} onRetry={() => {}} onEdit={() => {}} />);
  expect(html).toContain('请填写素材标题');
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('aria-describedby="upload-error-one"');
  const rights = renderToStaticMarkup(<UploadRights checked={false} disabled={false} error="请确认已取得图片使用授权" onChange={() => {}} />);
  expect(rights).toContain('aria-invalid="true"');
  expect(rights).toContain('aria-describedby="rendering-upload-rights-error"');
  expect(rights).toContain('请确认已取得图片使用授权');
});
test('form fields have concrete labels, constraints and associated errors', () => {
  const html = renderToStaticMarkup(<StyleFields value={toStyleFields(style)} onChange={() => {}} errors={{ title: '请输入标题' }} />);
  for (const text of ['标题', '空间', '风格', '来源', '颜色说明', '材质说明', '排序', '请输入标题', 'aria-invalid="true"', 'maxLength="80"']) expect(html).toContain(text);
});
test('gallery has loading, empty, no-results and recoverable error states', () => {
  const props = { list: [], previews: {}, canManage: false, onView: () => {}, onEdit: () => {}, onCommand: () => {}, onRetry: () => {} };
  expect(renderToStaticMarkup(<LibraryGrid {...props} loading />)).toContain('正在读取素材');
  expect(renderToStaticMarkup(<LibraryGrid {...props} />)).toContain('还没有素材');
  expect(renderToStaticMarkup(<LibraryGrid {...props} canManage />)).toContain('发布给客户浏览');
  expect(renderToStaticMarkup(<LibraryGrid {...props} filtered />)).toContain('没有符合筛选条件的素材');
  expect(renderToStaticMarkup(<LibraryGrid {...props} error="读取素材列表失败" />)).toContain('重新加载');
});
test('failed metadata save exposes the original error and a save-only retry', () => {
  const html = renderToStaticMarkup(<UploadItem item={{ key: 'one', file: new File(['x'], '客厅.png'), title: '客厅', previewUrl: '',
    status: 'failed', failureStage: 'save', fileId: style.file_id, error: '保存素材资料失败' }} disabled={false} onTitle={() => {}} onRemove={() => {}} onRetry={() => {}} onEdit={() => {}} />);
  expect(html).toContain('保存素材资料失败');
  expect(html).toContain('重试保存资料');
  expect(html).not.toContain('重新上传');
});

test('card distinguishes draft, published, unpublished edits and read-only operations', () => {
  const props = { preview: undefined, canManage: true, onView: () => {}, onEdit: () => {}, onCommand: () => {} };
  const draft = renderToStaticMarkup(<StyleCard {...props} style={style} />);
  expect(draft).toContain('>发布<');
  const published = { ...style, status: 'published' as const, published_version: 2, version: 2, published_at: '2026-09-13T00:00:00Z' };
  const clean = renderToStaticMarkup(<StyleCard {...props} style={published} />);
  expect(clean).toContain('>已发布<');
  expect(clean).toContain('>重新发布<');
  expect(clean).toContain('>隐藏<');
  const dirty = renderToStaticMarkup(<StyleCard {...props} style={{ ...published, version: 3 }} />);
  expect(dirty).toContain('线上仍为上一版本');
  expect(dirty).toContain('发布最新修改');
  const readonly = renderToStaticMarkup(<StyleCard {...props} style={published} canManage={false} />);
  expect(readonly).not.toContain('>重新发布<');
  expect(readonly).not.toContain('>隐藏<');
});

test('publication confirmation statically includes the public-cache limitation', () => {
  const source = readFileSync(new URL('./style-mutations.tsx', import.meta.url), 'utf8');
  expect(source).toContain('客户端或 CDN 已缓存的图片无法保证立即清除');
});

test('only a loaded, current and still-valid preview arms automatic expiry renewal', () => {
  const preview = { file_id: style.file_id, url: 'https://preview.example.test/private', expires_at: '2026-09-13T10:00:01Z' };
  const now = Date.parse('2026-09-13T10:00:00Z');
  expect(getPublicationPreviewExpiryDelay(preview, style.file_id, preview.url, now)).toBe(1000);
  expect(getPublicationPreviewExpiryDelay(preview, style.file_id, '', now)).toBeNull();
  expect(getPublicationPreviewExpiryDelay(preview, 'other-file', preview.url, now)).toBeNull();
  expect(getPublicationPreviewExpiryDelay(preview, style.file_id, preview.url, now + 1001)).toBeNull();
});
