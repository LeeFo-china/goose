import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';

const qualityRepairMigrationFile = new URL(
  '../../../../../supabase/migrations/20260821105200_fix_douyin_appointment_command_invariants.sql',
  import.meta.url,
);

const ownershipRepairMigrationFile = new URL(
  '../../../../../supabase/migrations/20260821105300_fix_douyin_appointment_customer_ownership.sql',
  import.meta.url,
);

function normalize(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function topLevelSql(sql: string): string {
  return normalize(sql)
    .replace(/do \$block\$.*?\$block\$;/g, ' ')
    .replace(/create (?:or replace )?function .*?as \$function\$.*?\$function\$;/g, ' ');
}

function functionBody(sql: string, functionName: string): string {
  const normalized = normalize(sql);
  const marker = `create or replace function public.${functionName}`;
  const start = normalized.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = normalized.indexOf('as $function$', start);
  const end = normalized.indexOf('$function$;', bodyStart + 13);
  expect(bodyStart).toBeGreaterThan(start);
  expect(end).toBeGreaterThan(bodyStart);
  return normalized.slice(start, end + 11);
}

describe('douyin appointment ownership repair migration', () => {
  test('keeps the applied 105200 migration byte-for-byte immutable', async () => {
    const sql = await Bun.file(qualityRepairMigrationFile).arrayBuffer();
    expect(createHash('sha256').update(new Uint8Array(sql)).digest('hex')).toBe(
      'f74489b5ff1dd723422ff5e0c2a36c7b77c3b88e4d0679f4a60cb01a8ab5a1cf',
    );
  });

  test('reuses only recent leads whose linked customer still owns the current phone', async () => {
    const body = functionBody(await Bun.file(ownershipRepairMigrationFile).text(), 'submit_douyin_measurement_appointment');

    expect(body).toContain('lead.customer_id is null or exists (');
    expect(body).toContain('from public.customers as linked_customer');
    expect(body).toContain('linked_customer.id = lead.customer_id');
    expect(body).toContain('linked_customer.tenant_id = p_tenant_id');
    expect(body).toContain('linked_customer.phone = p_phone');
    expect(body).toContain('customer_id = case when v_existing_customer_linked then v_customer.id else null end');
  });

  test('rejects appointment customer conflicts before conversion writes', async () => {
    const body = functionBody(await Bun.file(ownershipRepairMigrationFile).text(), 'convert_douyin_lead_to_customer');
    const customerInsert = body.indexOf('insert into public.customers');
    const leadUpdate = body.indexOf('update public.marketing_leads');
    const operationInsert = body.indexOf('insert into public.douyin_lead_workflow_operations');
    const conflicts = [...body.matchAll(/douyin_lead_appointment_customer_conflict/g)].map((match) => match.index ?? -1);
    const updateStart = body.indexOf('update public.douyin_measurement_appointments');
    const appointmentUpdate = body.slice(updateStart, body.indexOf('get diagnostics v_appointments_updated', updateStart));

    expect(body).toContain('from public.douyin_measurement_appointments as appointment');
    expect(body).toContain('appointment.marketing_lead_id = p_marketing_lead_id');
    expect(body).toContain('order by appointment.id');
    expect(body).toContain('for update');
    expect(body).toContain('appointment.customer_id is not null');
    expect(body).toContain('appointment.customer_id is distinct from v_customer.id');
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0]).toBeLessThan(operationInsert);
    expect(conflicts[1]).toBeLessThan(customerInsert);
    expect(conflicts[1]).toBeLessThan(leadUpdate);
    expect(appointmentUpdate).toContain('and customer_id is null');
    expect(appointmentUpdate).not.toContain('customer_id is distinct from v_customer.id');
    expect(body).toContain('and appointment.customer_id = v_customer.id');
  });

  test('keeps the ownership repair top level free of business mutations', async () => {
    const topLevel = topLevelSql(await Bun.file(ownershipRepairMigrationFile).text());

    expect(topLevel).not.toMatch(/\b(insert|update|delete|merge|copy|call|select)\b/);
    const statements = topLevel.split(';').map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) {
      expect(statement).toMatch(/^(begin|set local |revoke all on function |grant execute on function |comment on |commit$)/);
    }
  });
});
