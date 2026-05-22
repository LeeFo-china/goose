type StatusMachineCheckRow = {
  check_name: string;
  issue_count: number;
};

const databaseUrl = process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DB_DIRECT_URL;

if (!databaseUrl) {
  console.error("缺少 SUPABASE_DB_URL 或 SUPABASE_DB_DIRECT_URL");
  process.exit(1);
}

const db = new Bun.SQL(databaseUrl);

async function main() {
  const rows = await db<StatusMachineCheckRow[]>`
  with checks as (
    select 1 as ord, 'old_or_invalid_customer_status' as check_name, count(*)::int as issue_count
    from public.customers
    where status is not null
      and status not in ('potential', 'following', 'arrived', 'designing', 'signed', 'dormant', 'invalid')
    union all
    select 2, 'old_or_invalid_project_status', count(*)::int
    from public.projects
    where status is not null
      and status not in (
        'designing',
        'proposal_confirmed',
        'signed',
        'design_finalized',
        'pending_start',
        'started',
        'constructing',
        'on_hold',
        'acceptance',
        'invalid'
      )
    union all
    select 3, 'signed_project_customer_still_designing', count(*)::int
    from public.projects p
    join public.customers c
      on c.id = p.customer_id
     and c.tenant_id = p.tenant_id
    where p.status in ('signed', 'design_finalized', 'pending_start', 'started', 'constructing', 'acceptance')
      and c.status = 'designing'
    union all
    select 4, 'signable_project_customer_not_designing_or_signed', count(*)::int
    from public.projects p
    join public.customers c
      on c.id = p.customer_id
     and c.tenant_id = p.tenant_id
    where p.status in (
        'proposal_confirmed',
        'signed',
        'design_finalized',
        'pending_start',
        'started',
        'constructing',
        'acceptance'
      )
      and coalesce(c.status, '') not in ('designing', 'signed')
    union all
    select 5, 'designing_or_signed_customer_without_active_project', count(*)::int
    from public.customers c
    where c.status in ('designing', 'signed')
      and not exists (
        select 1
        from public.projects p
        where p.customer_id = c.id
          and p.tenant_id = c.tenant_id
          and coalesce(p.status, '') <> 'invalid'
      )
    union all
    select 6, 'duplicate_active_project_same_customer_property', count(*)::int
    from (
      select tenant_id, customer_id, property_id
      from public.projects
      where customer_id is not null
        and property_id is not null
        and coalesce(status, '') <> 'invalid'
      group by tenant_id, customer_id, property_id
      having count(*) > 1
    ) t
    union all
    select 7, 'signed_project_missing_signed_amount', count(*)::int
    from public.projects
    where status in ('signed', 'design_finalized', 'pending_start', 'started', 'constructing', 'acceptance')
      and coalesce(signed_amount, 0) <= 0
    union all
    select 8, 'scheduled_or_later_project_missing_start_date', count(*)::int
    from public.projects
    where status in ('pending_start', 'started', 'constructing', 'acceptance')
      and start_date is null
  )
  select check_name, issue_count
  from checks
  order by ord;
  `;

  for (const row of rows) {
    console.log(`${row.check_name}: ${row.issue_count}`);
  }

  await db.close();
}

main().catch(async (error) => {
  await db.close();
  console.error(error instanceof Error ? error.message : "状态机一致性检查失败");
  process.exit(1);
});
