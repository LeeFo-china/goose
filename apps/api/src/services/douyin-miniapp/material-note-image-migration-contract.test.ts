import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

const imageBlocksMigrationFile = new URL(
  '../../../../../supabase/migrations/20260902160000_allow_douyin_material_note_image_blocks.sql',
  import.meta.url,
);

describe('douyin material note image block migration', () => {
  test('extends content validation with strict image blocks in a forward migration', () => {
    expect(existsSync(imageBlocksMigrationFile)).toBe(true);
    const source = readFileSync(imageBlocksMigrationFile, 'utf8');
    const normalized = normalize(source);
    const validator = functionDefinition(source, 'is_valid_douyin_material_note_content_blocks');

    expect(normalized).toStartWith('begin;');
    expect(normalized).toEndWith('commit;');
    expect(normalized).toContain(
      'create or replace function public.is_valid_douyin_material_note_content_blocks',
    );
    for (const fragment of [
      "when 'image' then",
      "block ?& array['type','fileid','alt']",
      "block - array['type','fileid','alt','caption']::text[] <> '{}'::jsonb",
      "jsonb_typeof(block -> 'fileid')<> 'string'",
      "block ->> 'fileid' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'",
      "jsonb_typeof(block -> 'alt')<> 'string'",
      "char_length(btrim(block ->> 'alt'))not between 1 and 300",
      "jsonb_typeof(block -> 'caption')<> 'string'",
      "char_length(btrim(block ->> 'caption'))not between 1 and 1000",
    ]) {
      expect(validator).toContain(fragment);
    }
    for (const forbidden of ["'src'", "'url'", "'html'", "'base64'"]) {
      expect(validator).not.toContain(forbidden);
    }
  });
});

function normalize(value: string): string {
  return value.toLowerCase()
    .replace(/"([^"]+)"/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s+([(),;])/g, '$1')
    .replace(/([(),;])\s+/g, '$1')
    .trim();
}

function functionDefinition(source: string, name: string): string {
  const normalized = normalize(source);
  const signature = `function public.${name}(`;
  const start = normalized.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const tail = normalized.slice(start);
  const end = tail.indexOf('$function$;');
  expect(end).toBeGreaterThanOrEqual(0);
  return tail.slice(0, end + '$function$;'.length);
}
