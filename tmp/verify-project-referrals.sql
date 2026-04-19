begin;

create temp table verify_results(
  step text,
  ok boolean,
  detail text
);

do $$
declare
  v_project_id uuid;
  v_referrer_id uuid;
  v_referral_id uuid;
  v_employee_id uuid;
  v_commission numeric;
  v_status text;
  v_recalc timestamptz;
begin
  select id into v_employee_id from public.employees limit 1;

  insert into public.projects(name, status)
  values ('验证项目-介绍费', 'lead')
  returning id into v_project_id;

  insert into public.external_referrers(name, status, phone)
  values ('验证介绍人', 'active', '13800009999')
  returning id into v_referrer_id;

  insert into public.project_referrals(project_id, referrer_id, rate_bps, remark)
  values (v_project_id, v_referrer_id, 150, '验证提成')
  returning id into v_referral_id;

  update public.projects
  set status = 'signed', signed_amount = 200000
  where id = v_project_id;

  select status, commission_amount
  into v_status, v_commission
  from public.project_referrals
  where id = v_referral_id;

  insert into verify_results
  values (
    'signed auto calculate',
    v_status = 'calculated' and v_commission = 3000,
    'status=' || coalesce(v_status, 'null') || ', commission=' || coalesce(v_commission::text, 'null')
  );

  update public.project_referrals
  set rate_bps = 200
  where id = v_referral_id;

  select commission_amount, recalculated_at
  into v_commission, v_recalc
  from public.project_referrals
  where id = v_referral_id;

  insert into verify_results
  values (
    'unpaid recalc on rate change',
    v_commission = 4000 and v_recalc is not null,
    'commission=' || coalesce(v_commission::text, 'null') || ', recalculated_at=' || coalesce(v_recalc::text, 'null')
  );

  update public.project_referrals
  set
    status = 'paid',
    paid_at = now(),
    paid_by = v_employee_id,
    paid_evidence_images = '["proof"]'::jsonb,
    paid_remark = '验证支付'
  where id = v_referral_id;

  insert into verify_results
  values (
    'mark paid',
    exists(
      select 1
      from public.project_referrals
      where id = v_referral_id
        and status = 'paid'
        and paid_by = v_employee_id
    ),
    'paid status persisted'
  );

  begin
    update public.projects
    set signed_amount = 300000
    where id = v_project_id;

    insert into verify_results
    values ('block signed_amount update after paid', false, 'unexpectedly succeeded');
  exception
    when others then
      insert into verify_results
      values ('block signed_amount update after paid', true, SQLERRM);
  end;
end
$$;

do $$
declare
  v_project_id uuid;
begin
  insert into public.projects(name, status)
  values ('验证项目-缺少签约金额', 'lead')
  returning id into v_project_id;

  begin
    update public.projects
    set status = 'signed'
    where id = v_project_id;

    insert into verify_results
    values ('block signed without signed_amount', false, 'unexpectedly succeeded');
  exception
    when others then
      insert into verify_results
      values ('block signed without signed_amount', true, SQLERRM);
  end;
end
$$;

select * from verify_results order by step;

rollback;
