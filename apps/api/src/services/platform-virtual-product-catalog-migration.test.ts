import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const migration = new URL(
  '../../../../supabase/migrations/20260803100000_create_platform_virtual_product_catalog.sql',
  import.meta.url,
);

function sql(): string {
  return readFileSync(migration, 'utf8')
    .replace(/--.*$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

describe('platform virtual product catalog migration', () => {
  test('creates protected facts and service-role-only commands', () => {
    const value = sql();

    for (const table of [
      'platform_virtual_products',
      'platform_virtual_product_grant_rules',
      'platform_virtual_payment_channels',
      'platform_virtual_product_mappings',
      'platform_virtual_goods_operations',
    ]) {
      expect(value).toContain(`create table public.${table}`);
    }

    expect(value).toContain("provider_product_id ~ '^[a-za-z0-9_-]{1,20}$'");
    expect(value).toContain('unique (product_id, channel_id)');
    expect(value).toContain('unique (channel_id, provider_product_id)');
    expect(value).toContain(
      'create unique index platform_virtual_goods_operations_one_running_per_channel_idx',
    );
    expect(value).toContain("where state in ('submitted', 'processing')");
    expect(value).toContain('enable row level security');
    expect(value).toContain('to service_role');
    expect(value).not.toContain('to authenticated');
  });

  test('backfills annual branding identity without changing its ids', () => {
    const value = sql();

    expect(value).toContain('insert into public.platform_virtual_products');
    expect(value).toContain('from public.platform_addon_products');
    expect(value).toContain('insert into public.platform_virtual_product_mappings');
    expect(value).toContain('from public.platform_virtual_payment_products');
    expect(value).toContain('provider_product_id');
    expect(value).toContain('on conflict');
  });
});
