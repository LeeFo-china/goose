import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const migration = new URL(
  '../../../../supabase/migrations/20260803101000_add_annual_virtual_product_compatibility_command.sql',
  import.meta.url,
);

describe('annual virtual product compatibility migration', () => {
  test('updates only generic catalog facts and protects channel identity', () => {
    const sql = readFileSync(migration, 'utf8')
      .replace(/--.*$/gm, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    expect(sql).toContain(
      'create or replace function public.platform_manage_annual_virtual_payment_compatibility',
    );
    expect(sql).toContain('from public.platform_virtual_products');
    expect(sql).toContain('update public.platform_virtual_payment_channels');
    expect(sql).toContain('update public.platform_virtual_product_mappings');
    expect(sql).toContain('virtual_product_channel_id_immutable');
    expect(sql).toContain('security definer');
    expect(sql).toContain('to service_role');
    expect(sql).toContain("file_object.owner_type = 'branding_virtual_goods'");
    expect(sql).toContain("file_object.scene = 'branding_virtual_goods'");
    expect(sql).toContain('file_object.width = 200');
    expect(sql).toContain('file_object.height = 200');
    expect(sql).toContain(
      'v_channel.version is distinct from v_expected_mapping_version',
    );
    expect(sql).not.toContain('update public.platform_addon_products');
    expect(sql).not.toContain('update public.platform_virtual_payment_products');
  });
});
