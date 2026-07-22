import { describe, expect, test } from 'bun:test';

const MIGRATION = new URL(
  '../../../../../supabase/migrations/20260722170000_add_ocr_platform_document_index.sql',
  import.meta.url,
);

describe('OCR platform list index migration', () => {
  test('indexes document type with the platform list sort key', async () => {
    const file = Bun.file(MIGRATION);

    expect(await file.exists()).toBe(true);
    const sql = await file.text();
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS ocr_recognitions_document_created_idx',
    );
    expect(sql).toContain(
      'ON public.ocr_recognitions(document_type, created_at DESC);',
    );
  });
});
